import React, { useEffect, useRef } from "react"
import { getApiBaseUrl } from "../config"

export default function OffscreenPage() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    const handleMessage = async (message: any) => {
      if (message.target !== "offscreen") return

      if (message.type === "start-recording") {
        startRecording(message.url)
      } else if (message.type === "stop-recording") {
        stopRecording()
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const uploadAudio = async (blob: Blob, url: string) => {
    // Standardize on webm for Groq Whisper
    const audioFile = new File([blob], "voice.webm", { type: "audio/webm" })
    const formData = new FormData()
    formData.append("audio", audioFile)
    formData.append("url", url)

    try {
      console.log("Offscreen: Uploading to API...")
      const apiBaseUrl = await getApiBaseUrl()
      const response = await fetch(`${apiBaseUrl}/api/voice`, {
        method: "POST",
        body: formData
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || `Server returned ${response.status}`)
      }
      
      console.log("Offscreen: Upload success!", result)
    } catch (error) {
      console.error("Offscreen: Upload failed", error)
      chrome.runtime.sendMessage({
        type: "recording-failed",
        error: `Upload failed: ${(error as Error).message}`,
        target: "background"
      })
      throw error
    }
  }

  const startRecording = async (url: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
          await uploadAudio(audioBlob, url)
          chrome.runtime.sendMessage({ type: "recording-finished", target: "background" })
        } catch (error) {
          // Handled in uploadAudio
        } finally {
          stream.getTracks().forEach(track => track.stop())
        }
      }

      mediaRecorder.start()
      setTimeout(() => {
        if (mediaRecorder.state === "recording") mediaRecorder.stop()
      }, 5000)
    } catch (error) {
      chrome.runtime.sendMessage({
        type: "recording-failed",
        error: (error as Error).message,
        target: "background"
      })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }

  return <div>Recording...</div>
}

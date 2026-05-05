import React, { useEffect, useRef } from "react"
import { getApiBaseUrl } from "../config"

export default function OffscreenPage() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isCurrentlyRecording = useRef<boolean>(false)

  useEffect(() => {
    const handleMessage = async (message: any) => {
      if (message.target !== "offscreen") return

      if (message.type === "start-recording") {
        startRecording(message.url, message.title)
      } else if (message.type === "stop-recording") {
        stopRecording()
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  const uploadAudio = async (blob: Blob, url: string, title?: string) => {
    const audioFile = new File([blob], "voice.webm", { type: "audio/webm" })
    const formData = new FormData()
    formData.append("audio", audioFile)
    formData.append("url", url)
    if (title) {
      formData.append("title", title)
    }

    try {
      const apiBaseUrl = await getApiBaseUrl()
      const response = await fetch(`${apiBaseUrl}/api/voice`, {
        method: "POST",
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Server returned ${response.status}`)
      }
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

  const startRecording = async (url: string, title?: string) => {
    if (isCurrentlyRecording.current) {
      return
    }
    isCurrentlyRecording.current = true

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          console.warn(`Offscreen: Track '${track.label}' ended prematurely.`)
        }
      })

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

          if (audioBlob.size < 1000) {
            console.warn("Offscreen: Recording was too short/small. Skipping upload.")
            return
          }

          await uploadAudio(audioBlob, url, title)
          chrome.runtime.sendMessage({ type: "recording-finished", target: "background" })
        } catch (error) {
          // Handled in uploadAudio
        } finally {
          isCurrentlyRecording.current = false
          streamRef.current?.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error("Offscreen: MediaRecorder error:", event)
      }

      mediaRecorder.onpause = () => {
        console.warn("Offscreen: MediaRecorder paused.")
      }

      mediaRecorder.start(1000)
    } catch (error) {
      isCurrentlyRecording.current = false
      chrome.runtime.sendMessage({
        type: "recording-failed",
        error: (error as Error).message,
        target: "background"
      })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    } else {
      console.warn("Offscreen: stopRecording called but not in 'recording' state.", {
        state: mediaRecorderRef.current?.state,
        isLockActive: isCurrentlyRecording.current
      })
    }
  }

  return <div>Recording...</div>
}

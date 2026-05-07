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
      console.log("Offscreen: received message", message)

      if (message.type === "start-recording") {
        void startRecording(message.url, message.title, message.userId)
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

  const uploadAudio = async (blob: Blob, url: string, userId: string, title?: string) => {
    const audioFile = new File([blob], "voice.webm", { type: "audio/webm" })
    const formData = new FormData()
    formData.append("audio", audioFile)
    formData.append("url", url)
    formData.append("memento_user_id", userId)
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

  const startRecording = async (url: string, title?: string, userId?: string) => {
    if (isCurrentlyRecording.current) {
      console.log("Offscreen: startRecording ignored, already recording")
      return
    }
    isCurrentlyRecording.current = true
    console.log("Offscreen: startRecording begin", { url, title, userId })

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log("Offscreen: microphone stream acquired")
      chrome.runtime.sendMessage({
        type: "microphone-permission-result",
        granted: true,
        target: "background"
      })
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
          console.log("Offscreen: data chunk", { size: event.data.size })
        }
      }

      mediaRecorder.onstop = async () => {
        console.log("Offscreen: mediaRecorder.onstop", {
          chunkCount: chunksRef.current.length
        })
        try {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
          console.log("Offscreen: built audio blob", { size: audioBlob.size })

          if (audioBlob.size < 1000) {
            console.warn("Offscreen: Recording was too short/small. Skipping upload.")
            return
          }

          if (!userId) {
            console.error("Offscreen: Missing userId for upload")
            return
          }

          await uploadAudio(audioBlob, url, userId, title)
          console.log("Offscreen: upload complete")
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
      console.log("Offscreen: mediaRecorder started")
    } catch (error) {
      isCurrentlyRecording.current = false
      console.error("Offscreen: startRecording failed", error)
      chrome.runtime.sendMessage({
        type: "microphone-permission-result",
        granted: false,
        target: "background"
      })
      chrome.runtime.sendMessage({
        type: "recording-failed",
        error: (error as Error).message,
        target: "background"
      })
    }
  }

  const stopRecording = () => {
    console.log("Offscreen: stopRecording invoked", {
      mediaRecorderState: mediaRecorderRef.current?.state,
      isCurrentlyRecording: isCurrentlyRecording.current
    })
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

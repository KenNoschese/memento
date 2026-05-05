import React, { useEffect, useRef } from "react"
import { getApiBaseUrl } from "../config"

export default function OffscreenPage() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isCurrentlyRecording = useRef<boolean>(false)

  useEffect(() => {
    console.log("Offscreen: Component mounted.")
    const handleMessage = async (message: any) => {
      if (message.target !== "offscreen") return

      if (message.type === "start-recording") {
        startRecording(message.url)
      } else if (message.type === "stop-recording") {
        stopRecording()
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    const heartbeat = setInterval(() => {
      console.debug("Offscreen: Heartbeat (Alive)", {
        recording: isCurrentlyRecording.current,
        recorderState: mediaRecorderRef.current?.state
      })
    }, 2000)

    return () => {
      console.log("Offscreen: Component unmounting.")
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      chrome.runtime.onMessage.removeListener(handleMessage)
      clearInterval(heartbeat)
    }
  }, [])

  const uploadAudio = async (blob: Blob, url: string) => {
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
    if (isCurrentlyRecording.current) {
      console.warn("Offscreen: Already recording. Ignoring start request.")
      return
    }
    isCurrentlyRecording.current = true

    try {
      console.log("Offscreen: Initializing MediaRecorder for URL:", url)
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
        console.log("Offscreen: MediaRecorder 'onstop' event fired.")
        try {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
          console.log(`Offscreen: Uploading ${audioBlob.size} bytes...`)

          if (audioBlob.size < 1000) {
            console.warn("Offscreen: Recording was too short/small. Skipping upload.")
            return
          }

          await uploadAudio(audioBlob, url)
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
      console.log("Offscreen: MediaRecorder started with 1000ms timeslice.")
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
      console.log("Offscreen: Manually stopping MediaRecorder...")
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

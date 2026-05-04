import React, { useEffect, useRef } from "react"

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
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
        await uploadAudio(audioBlob, url)
        stream.getTracks().forEach(track => track.stop())
        chrome.runtime.sendMessage({ type: "recording-finished", target: "background" })
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

  const uploadAudio = async (blob: Blob, url: string) => {
    const formData = new FormData()
    formData.append("audio", blob, "voice.webm")
    formData.append("url", url)

    try {
      await fetch("http://localhost:3000/api/voice", {
        method: "POST",
        body: formData
      })
    } catch (error) {
      console.error("Offscreen: Upload failed", error)
    }
  }

  return <div>Recording...</div>
}

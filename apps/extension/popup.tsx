import logo from "data-base64:~assets/logo_dark.png"
import { useEffect, useState, type CSSProperties } from "react"

type OperationStatus = {
  ok: boolean
  at: number
  error?: string
}

type PageStatus = "eligible" | "blocked" | "unsupported" | "paused"

type PopupState = {
  isRecording: boolean
  isIndexingEnabled: boolean
  hasMicPermission: boolean | "unknown"
  apiBaseUrl: string
  userId: string
  activeTab: {
    url: string
    title: string
    hostname: string
  } | null
  pageStatus: PageStatus
  pageStatusReason?: string
  lastIndex?: OperationStatus
  lastVoiceNote?: OperationStatus
}

const palette = {
  background: "#f5f1eb",
  foreground: "#26211c",
  foregroundSoft: "#4a433c",
  surface: "#fffdfa",
  surfaceSoft: "#faf6f0",
  line: "#e7ddd1",
  muted: "#86786b",
  mutedStrong: "#665b50",
  accent: "#8f6440",
  accentStrong: "#765136",
  accentSoft: "#f3e9de",
  accentEdge: "#d7bea6",
  success: "#4f7a5a",
  warning: "#b7791f",
  danger: "#b55643"
}

const pageLabelByStatus: Record<PageStatus, string> = {
  eligible: "Ready",
  blocked: "Blocked",
  unsupported: "Unsupported",
  paused: "Paused"
}

const pageToneByStatus: Record<
  PageStatus,
  { background: string; text: string; border: string }
> = {
  eligible: {
    background: "#eef5ef",
    text: palette.success,
    border: "#c8decf"
  },
  blocked: {
    background: "#fbefec",
    text: palette.danger,
    border: "#ebc3ba"
  },
  unsupported: {
    background: "#faf3e7",
    text: palette.warning,
    border: "#edd4ad"
  },
  paused: {
    background: palette.accentSoft,
    text: palette.accentStrong,
    border: palette.accentEdge
  }
}

const rootStyle: CSSProperties = {
  width: 360,
  padding: 16,
  boxSizing: "border-box",
  background: palette.background,
  color: palette.foreground,
  fontFamily: '"Manrope", "Segoe UI", sans-serif'
}

const cardStyle: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.line}`,
  borderRadius: 20,
  padding: 16,
  boxShadow: "0 10px 30px rgba(38, 33, 28, 0.06)"
}

const buttonBase: CSSProperties = {
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  border: "none"
}

const getRelativeTime = (timestamp?: number) => {
  if (!timestamp) return "just now"

  const deltaMs = Date.now() - timestamp
  const seconds = Math.max(1, Math.round(deltaMs / 1000))

  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

const getPrimaryAction = (state: PopupState | null) => {
  if (!state) return "loading"
  if (state.isRecording) return "stop"
  if (state.pageStatus !== "eligible") return "disabled"
  if (state.hasMicPermission !== true) return "permission"
  return "record"
}

const getActivityText = (state: PopupState | null) => {
  if (!state) return "Loading capture status…"
  if (state.isRecording) return "Recording a voice note for this page."
  if (state.lastVoiceNote?.error)
    return `Voice note failed: ${state.lastVoiceNote.error}`
  if (state.lastIndex?.error)
    return `Page index failed: ${state.lastIndex.error}`
  if (state.lastVoiceNote?.ok)
    return `Last voice note uploaded ${getRelativeTime(state.lastVoiceNote.at)}.`
  if (state.lastIndex?.ok)
    return `Page indexed ${getRelativeTime(state.lastIndex.at)}.`
  if (state.pageStatus === "eligible")
    return "This page will be indexed after a short delay."
  return state.pageStatusReason ?? "Open a supported page to capture it."
}

function IndexPopup() {
  const [popupState, setPopupState] = useState<PopupState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refreshState = async () => {
    try {
      const state = await chrome.runtime.sendMessage({
        type: "get-popup-state",
        target: "background"
      })
      setPopupState(state)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage("Unable to load extension state")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshState()

    const interval = window.setInterval(() => {
      void refreshState()
    }, 1500)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  const toggleIndexing = async () => {
    if (!popupState) return
    await chrome.storage.local.set({
      isIndexingEnabled: !popupState.isIndexingEnabled
    })
    await refreshState()
  }

  const requestMicrophoneAccess = async () => {
    setIsWorking(true)
    setErrorMessage(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      await chrome.runtime.sendMessage({
        type: "microphone-permission-result",
        granted: true,
        target: "background"
      })
    } catch (error) {
      await chrome.runtime.sendMessage({
        type: "microphone-permission-result",
        granted: false,
        target: "background"
      })
      setErrorMessage("Microphone access is blocked by the browser")
    } finally {
      setIsWorking(false)
      await refreshState()
    }
  }

  const sendRecordingAction = async (type: "start-record" | "stop-record") => {
    setIsWorking(true)
    setErrorMessage(null)

    try {
      await chrome.runtime.sendMessage({
        type,
        target: "background"
      })
    } catch (error) {
      setErrorMessage(
        type === "start-record"
          ? "Unable to start recording"
          : "Unable to stop recording"
      )
    } finally {
      setIsWorking(false)
      await refreshState()
    }
  }

  const openDashboard = () => {
    if (!popupState) return
    const url = new URL(popupState.apiBaseUrl)
    url.searchParams.set("user", popupState.userId)
    window.open(url.toString(), "_blank")
  }

  const renderPrimaryAction = () => {
    const action = getPrimaryAction(popupState)

    if (action === "loading") {
      return (
        <button
          disabled
          style={{
            ...buttonBase,
            width: "100%",
            background: palette.surfaceSoft,
            color: palette.muted,
            border: `1px solid ${palette.line}`
          }}>
          Loading…
        </button>
      )
    }

    if (action === "stop") {
      return (
        <button
          onClick={() => void sendRecordingAction("stop-record")}
          disabled={isWorking}
          style={{
            ...buttonBase,
            width: "100%",
            background: palette.accent,
            color: "#fffdfa"
          }}>
          Stop Recording
        </button>
      )
    }

    if (action === "permission") {
      return (
        <button
          onClick={() => void requestMicrophoneAccess()}
          disabled={isWorking}
          style={{
            ...buttonBase,
            width: "100%",
            background: palette.foreground,
            color: "#fffdfa"
          }}>
          Enable Microphone
        </button>
      )
    }

    if (action === "disabled") {
      return (
        <button
          disabled
          style={{
            ...buttonBase,
            width: "100%",
            background: palette.surfaceSoft,
            color: palette.muted,
            border: `1px solid ${palette.line}`
          }}>
          Voice Note Unavailable
        </button>
      )
    }

    return (
      <button
        onClick={() => void sendRecordingAction("start-record")}
        disabled={isWorking}
        style={{
          ...buttonBase,
          width: "100%",
          background: palette.foreground,
          color: "#fffdfa"
        }}>
        Start Voice Note
      </button>
    )
  }

  const pageStatus = popupState?.pageStatus ?? "unsupported"
  const statusTone = pageToneByStatus[pageStatus]
  const pageTitle = popupState?.activeTab?.title?.trim() || "No active page"
  const pageHost = popupState?.activeTab?.hostname || "Open a regular web page"

  return (
    <div style={rootStyle}>
      <div
        style={{
          ...cardStyle,
          display: "flex",
          flexDirection: "column",
          gap: 14
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12
          }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12
            }}>
            <img
              src={logo}
              alt="Memento"
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                objectFit: "contain",
                background: palette.surface,
                border: `1px solid ${palette.line}`,
                padding: 6
              }}
            />
            <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: palette.muted,
                marginBottom: 6
              }}>
              Memory Capture
            </div>
            <div
              style={{
                fontFamily: '"Fraunces", Georgia, serif',
                fontSize: 28,
                lineHeight: 1,
                color: palette.foreground
              }}>
              Memento
            </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: 999,
              padding: "6px 10px",
              background: statusTone.background,
              color: statusTone.text,
              border: `1px solid ${statusTone.border}`,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase"
            }}>
            {popupState?.isRecording
              ? "Recording"
              : pageLabelByStatus[pageStatus]}
          </div>
        </div>

        <div
          style={{
            borderRadius: 16,
            padding: 14,
            background: palette.surfaceSoft,
            border: `1px solid ${palette.line}`
          }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.3,
              color: palette.foreground,
              marginBottom: 4
            }}>
            {pageTitle}
          </div>
          <div
            style={{
              fontSize: 12,
              color: palette.mutedStrong,
              marginBottom: 10
            }}>
            {pageHost}
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.55,
              color: palette.foregroundSoft
            }}>
            {popupState?.pageStatusReason ?? "Checking page status…"}
          </div>
        </div>

        {renderPrimaryAction()}

        <div
          style={{
            borderRadius: 16,
            padding: "12px 14px",
            background:
              errorMessage || popupState?.hasMicPermission === false
                ? "#fbefec"
                : palette.surfaceSoft,
            border: `1px solid ${
              errorMessage || popupState?.hasMicPermission === false
                ? "#ebc3ba"
                : palette.line
            }`,
            color:
              errorMessage || popupState?.hasMicPermission === false
                ? palette.danger
                : palette.mutedStrong,
            fontSize: 12,
            lineHeight: 1.55
          }}>
          {errorMessage ||
            (popupState?.hasMicPermission === false
              ? "Microphone access is currently denied. Re-enable it in the browser extension permission settings."
              : getActivityText(popupState))}
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={openDashboard}
            disabled={!popupState}
            style={{
              ...buttonBase,
              background: palette.accentSoft,
              color: palette.accentStrong,
              border: `1px solid ${palette.accentEdge}`
            }}>
            Open Dashboard
          </button>
          <button
            onClick={() => void toggleIndexing()}
            style={{
              ...buttonBase,
              background: palette.surface,
              color: palette.foreground,
              border: `1px solid ${palette.line}`
            }}>
            {popupState?.isIndexingEnabled
              ? "Pause Indexing"
              : "Resume Indexing"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            paddingTop: 2
          }}>
          <div style={{ fontSize: 11, color: palette.muted }}>
            {isLoading ? "Refreshing…" : "Connected"}
          </div>
          <button
            onClick={() => {
              chrome.runtime.openOptionsPage()
            }}
            style={{
              ...buttonBase,
              padding: "8px 12px",
              background: "transparent",
              color: palette.mutedStrong,
              border: `1px solid ${palette.line}`,
              fontWeight: 600
            }}>
            Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup

import { useEffect, useState } from "react"

function IndexPopup() {
  const [isIndexingEnabled, setIsIndexingEnabled] = useState<boolean>(true)

  useEffect(() => {
    chrome.storage.local.get(["isIndexingEnabled"], (result) => {
      if (result.isIndexingEnabled !== undefined) {
        setIsIndexingEnabled(result.isIndexingEnabled)
      }
    })
  }, [])

  const toggleIndexing = () => {
    const newState = !isIndexingEnabled
    setIsIndexingEnabled(newState)
    chrome.storage.local.set({ isIndexingEnabled: newState })
  }

  return (
    <div
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        width: 220,
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: "#ffffff"
      }}>
      <h2 style={{ 
        margin: "0 0 4px 0", 
        fontSize: "20px",
        fontWeight: 700,
        color: "#1a1a1a" 
      }}>
        Memento
      </h2>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: "20px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ 
            width: "8px", 
            height: "8px", 
            backgroundColor: isIndexingEnabled ? "#10b981" : "#d1d5db", 
            borderRadius: "50%" 
          }} />
          <span style={{ fontSize: "12px", color: "#666" }}>
            {isIndexingEnabled ? "Auto-indexing active" : "Indexing paused"}
          </span>
        </div>
        <button 
          onClick={toggleIndexing}
          style={{
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            border: "1px solid #d1d5db",
            backgroundColor: "#fff",
            cursor: "pointer"
          }}>
          {isIndexingEnabled ? "Pause" : "Resume"}
        </button>
      </div>
      
      <button
        onClick={async () => {
          try {
            await navigator.mediaDevices.getUserMedia({ audio: true })
            alert("Microphone permission granted!")
          } catch (err) {
            console.error("Permission denied", err)
            alert("Failed to get microphone permission. Please check settings.")
          }
        }}
        style={{
          backgroundColor: "#f3f4f6",
          color: "#374151",
          border: "1px solid #d1d5db",
          padding: "8px 14px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
          marginBottom: "8px",
          transition: "background-color 0.2s"
        }}>
        Enable Microphone
      </button>

      <button
        onClick={async () => {
          chrome.runtime.sendMessage({ type: "toggle-record", target: "background" })
        }}
        style={{
          backgroundColor: "#dc2626",
          color: "white",
          border: "none",
          padding: "8px 14px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
          marginBottom: "8px",
          transition: "opacity 0.2s"
        }}>
        Test Record
      </button>

      <button
        onClick={() => {
          chrome.tabs.create({ url: "http://localhost:3000" })
        }}
        style={{
          backgroundColor: "#000000",
          color: "white",
          border: "none",
          padding: "10px 14px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
          marginBottom: "8px",
          transition: "opacity 0.2s",
          width: "100%"
        }}>
        View Memories
      </button>

      <button
        onClick={() => {
          chrome.runtime.openOptionsPage()
        }}
        style={{
          backgroundColor: "#fff",
          color: "#374151",
          border: "1px solid #d1d5db",
          padding: "10px 14px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
          transition: "background-color 0.2s",
          width: "100%"
        }}>
        Settings
      </button>
      
      <p style={{ 
        marginTop: "16px", 
        fontSize: "10px", 
        color: "#999", 
        textAlign: "center" 
      }}>
        Content is saved after 30 seconds.
      </p>
    </div>
  )
}

export default IndexPopup

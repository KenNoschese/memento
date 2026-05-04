import { useState } from "react"

function IndexPopup() {
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
        gap: "6px",
        marginBottom: "20px"
      }}>
        <div style={{ 
          width: "8px", 
          height: "8px", 
          backgroundColor: "#10b981", 
          borderRadius: "50%" 
        }} />
        <span style={{ fontSize: "12px", color: "#666" }}>
          Auto-indexing active
        </span>
      </div>
      
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
          transition: "opacity 0.2s"
        }}>
        View Memories
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

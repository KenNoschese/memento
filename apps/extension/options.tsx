import { useEffect, useState } from "react"

function OptionsIndex() {
  const [denylist, setDenylist] = useState<string>("")
  const [status, setStatus] = useState<string>("")

  useEffect(() => {
    chrome.storage.local.get(["denylist"], (result) => {
      if (result.denylist) {
        setDenylist(result.denylist.join("\n"))
      } else {
        // Default denylist
        const defaults = ["localhost", "127.0.0.1"]
        setDenylist(defaults.join("\n"))
        chrome.storage.local.set({ denylist: defaults })
      }
    })
  }, [])

  const saveOptions = () => {
    const list = denylist
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    
    chrome.storage.local.set({ denylist: list }, () => {
      setStatus("Options saved.")
      setTimeout(() => setStatus(""), 2000)
    })
  }

  return (
    <div
      style={{
        padding: "40px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "600px",
        margin: "0 auto"
      }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
        Memento Settings
      </h1>
      <p style={{ color: "#666", marginBottom: "24px" }}>
        Configure which sites should be excluded from automatic indexing.
      </p>

      <div style={{ marginBottom: "24px" }}>
        <label
          style={{
            display: "block",
            fontWeight: 600,
            marginBottom: "8px",
            fontSize: "14px"
          }}>
          Site Denylist
        </label>
        <p style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
          Enter one domain or keyword per line (e.g., "localhost", "github.com", "internal.site").
        </p>
        <textarea
          value={denylist}
          onChange={(e) => setDenylist(e.target.value)}
          rows={10}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            fontFamily: "monospace",
            fontSize: "13px",
            boxSizing: "border-box"
          }}
          placeholder="localhost"
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={saveOptions}
          style={{
            backgroundColor: "#000",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "14px"
          }}>
          Save Settings
        </button>
        {status && (
          <span style={{ fontSize: "14px", color: "#059669", fontWeight: 500 }}>
            {status}
          </span>
        )}
      </div>
    </div>
  )
}

export default OptionsIndex

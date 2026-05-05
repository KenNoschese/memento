import { Readability } from "@mozilla/readability"

const extractAndSend = async () => {
  // 0. Check settings
  const settings = await chrome.storage.local.get(["isIndexingEnabled", "denylist"])
  const isEnabled = settings.isIndexingEnabled !== false // default to true
  const denylist = (settings.denylist as string[]) || ["localhost", "127.0.0.1"]

  if (!isEnabled) {
    console.log("Memento: Indexing is disabled. Skipping.")
    return
  }

  const currentUrl = window.location.href
  const hostname = window.location.hostname

  const isBlocked = denylist.some(pattern => 
    hostname.includes(pattern) || currentUrl.includes(pattern)
  )

  if (isBlocked) {
    console.log(`Memento: URL "${currentUrl}" matches denylist pattern. Skipping.`)
    return
  }

  console.log("Memento: Starting extraction...")

  // 1. Extract the "meat" of the page 
  // We use document.cloneNode(true) but wrap it in defensive checks
  // Some sites might have problematic DOM structures
  try {
    const docClone = document.cloneNode(true) as Document
    const reader = new Readability(docClone)
    const article = reader.parse()

    if (article && article.textContent) {
      console.log("Memento: Content extracted. Title:", article.title)

      // 2. Send to API (Communication to Next.js backend)
      try {
        const response = await fetch("http://localhost:3000/api/index", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url: window.location.href,
            title: article.title,
            content: article.textContent
          })
        })
        
        if (response.ok) {
          console.log("Memento: Successfully indexed page.")
        } else {
          console.error("Memento: API returned error status:", response.status)
        }
      } catch (error) {
        console.error("Memento: Failed to send to API. Is the web server running?", error)
      }
    } else {
      console.warn("Memento: Readability could not find any content on this page.")
    }
  } catch (error) {
    console.error("Memento: Error during Readability parsing:", error)
  }
}

// The 30-Second Rule 
window.addEventListener("load", () => {
  console.log("Memento: Content script loaded. Timer started (30s)...")
  setTimeout(extractAndSend, 30000)
})

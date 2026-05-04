console.log("Memento: Content script has loaded!"); // Add this at line 1

import { Readability } from "@mozilla/readability"

const extractAndSend = async () => {
  // 1. Extract the "meat" of the page 
  const doc = document.cloneNode(true) as Document
  const reader = new Readability(doc)
  const article = reader.parse()

  if (article && article.textContent) {
    console.log("Memento: 30s limit reached. Sending content:", article.title)

    // 2. Send to API (Communication to Next.js backend) [cite: 7, 14]
    try {
      const response = await fetch("http://localhost:3000/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: window.location.href,
          title: article.title,
          content: article.textContent
        })
      })
      
      if (response.ok) {
        console.log("Memento: Successfully indexed page.")
      }
    } catch (error) {
      console.error("Memento: Failed to send to API. Is the web server running?", error)
    }
  }
}

// The 30-Second Rule 
window.addEventListener("load", () => {
  console.log("Memento: Timer started (30s)...")
  setTimeout(extractAndSend, 30000)
})
import { Readability } from "@mozilla/readability"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

// Prevent duplicate indexing runs for the same page
let isIndexed = false

// SPA debounce (ms). Can be overridden by chrome.storage.local.spaDebounceMs
let SPA_DEBOUNCE_MS = 2000

// Helper: trigger indexing only if we haven't already
const triggerIndexIfNotIndexed = async () => {
  if (isIndexed) {
    try {
      console.debug("Memento: Index suppressed; already indexed", {
        url: window.location.href
      })
      chrome.runtime.sendMessage?.({
        type: "telemetry",
        event: "index_suppressed",
        url: window.location.href
      })
    } catch (e) {
      // best-effort, ignore
    }
    return
  }
  await extractAndSend()
  isIndexed = true
}

// SPA support: emit a synthetic event when history changes (pushState/replaceState)
const patchHistoryMethods = () => {
  const _pushState = history.pushState
  history.pushState = function (...args: any[]) {
    const ret = _pushState.apply(this, args as any)
    window.dispatchEvent(new Event("locationchange"))
    return ret
  }

  const _replaceState = history.replaceState
  history.replaceState = function (...args: any[]) {
    const ret = _replaceState.apply(this, args as any)
    window.dispatchEvent(new Event("locationchange"))
    return ret
  }
}

// Debounced handler to index when URL changes in SPAs
let lastIndexedUrl = ""
const handleLocationChange = () => {
  const href = window.location.href
  if (href === lastIndexedUrl) return
  lastIndexedUrl = href
  // give SPA content a moment to render
  setTimeout(() => {
    triggerIndexIfNotIndexed().catch((e) =>
      console.error("SPA index failed", e)
    )
  }, SPA_DEBOUNCE_MS)
}

// Emergency index when user navigates away or hides the page
const handleVisibilityOrUnload = () => {
  if (isIndexed) return
  try {
    // best-effort immediate indexing
    extractAndSend().catch(() => {})
    isIndexed = true
  } catch (e) {
    // ignore
  }
}

// Wire up SPA + emergency listeners
const setupAdditionalIndexing = () => {
  try {
    // Sync userId if we are on the dashboard domain
    if (window.location.hostname === "localhost" && window.location.port === "3000") {
      const dashboardUserId = window.localStorage.getItem("memento_user_id")
      if (dashboardUserId) {
        storage.set("memento_user_id", dashboardUserId).then(() => {
          console.debug("Memento: Synced userId from dashboard:", dashboardUserId)
        })
      }
    }

    // Attempt to read a custom debounce value from storage
    try {
      chrome.storage.local.get(["spaDebounceMs"], (res: any) => {
        const v = Number(res?.spaDebounceMs)
        if (!Number.isNaN(v) && v > 0) {
          SPA_DEBOUNCE_MS = v
          console.debug("Memento: SPA debounce set to", SPA_DEBOUNCE_MS)
        }
      })
    } catch (e) {
      // ignore storage read errors
    }
    patchHistoryMethods()
    window.addEventListener("popstate", handleLocationChange)
    window.addEventListener("locationchange", handleLocationChange)

    // If the page becomes hidden or is about to unload, attempt an immediate index
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") handleVisibilityOrUnload()
    })
    window.addEventListener("beforeunload", handleVisibilityOrUnload)
  } catch (e) {
    console.warn("Memento: Failed to setup additional indexing listeners", e)
  }
}

const extractAndSend = async () => {
  // 0. Check settings and context
  if (!chrome.runtime?.id) {
    console.warn("Memento: Extension context invalidated.")
    return
  }

  try {
    const settings = await chrome.storage.local.get([
      "isIndexingEnabled",
      "denylist"
    ])
    const isEnabled = settings.isIndexingEnabled !== false // default to true
    const denylist = (settings.denylist as string[]) || [
      "localhost",
      "127.0.0.1"
    ]

    if (!isEnabled) {
      console.log("Memento: Indexing is disabled. Skipping.")
      return
    }

    const currentUrl = window.location.href
    const hostname = window.location.hostname

    const isBlocked = denylist.some(
      (pattern) => hostname.includes(pattern) || currentUrl.includes(pattern)
    )

    if (isBlocked) {
      console.log(
        `Memento: URL "${currentUrl}" matches denylist pattern. Skipping.`
      )
      return
    }

    console.log("Memento: Starting extraction...")

    // 1. Extract the "meat" of the page
    const docClone = document.cloneNode(true) as Document
    const reader = new Readability(docClone)
    const article = reader.parse()

    if (article && article.textContent) {
      console.log("Memento: Content extracted. Title:", article.title)

      // 2. Send to API (Communication to Next.js backend)
      let userId = await storage.get<string>("memento_user_id")

      // Fallback: If we don't have a userId yet, generate a stable one for this extension
      if (!userId) {
        userId = `user-${crypto.randomUUID().slice(0, 8)}`
        await storage.set("memento_user_id", userId)
        console.log("Memento: Generated new stable userId:", userId)
      }

      const response = await chrome.runtime.sendMessage({
        target: "background",
        type: "index-page",
        payload: {
          url: window.location.href,
          title: article.title,
          content: article.textContent
        }
      })

      if (response?.ok) {
        console.log("Memento: Successfully indexed page.")
      } else {
        console.error(
          "Memento: Background indexing returned error:",
          response?.status ?? response?.error ?? "unknown"
        )
      }
    } else {
      console.warn(
        "Memento: Readability could not find any content on this page."
      )
    }
  } catch (error) {
    console.error("Memento: Error during indexing process:", error)
  }
}

// The 5 second rule
window.addEventListener("load", () => {
  console.log("Memento: Content script loaded. Timer started (5s)...")
  setTimeout(extractAndSend, 5000)
})

// Additional indexing listeners to support SPAs and quick exits
setupAdditionalIndexing()

import { Readability } from "@mozilla/readability"
import { Storage } from "@plasmohq/storage"

const DASHBOARD_HOSTNAME = "memento-mjk1.vercel.app"

const storage = new Storage()

// SPA debounce (ms). Can be overridden by chrome.storage.local.spaDebounceMs
let SPA_DEBOUNCE_MS = 2000
const URL_POLL_INTERVAL_MS = 1000

let lastObservedUrl = window.location.href
let lastSuccessfullyIndexedUrl = ""
let inFlightIndexUrl = ""
let pendingIndexTimer: number | null = null

const clearPendingIndexTimer = () => {
  if (pendingIndexTimer !== null) {
    window.clearTimeout(pendingIndexTimer)
    pendingIndexTimer = null
  }
}

const hasIndexedUrl = (url: string) => lastSuccessfullyIndexedUrl === url

// Helper: trigger indexing only if we haven't already indexed this URL
const triggerIndexForUrl = async (url: string) => {
  if (window.location.href !== url) return

  if (hasIndexedUrl(url) || inFlightIndexUrl === url) {
    try {
      console.debug("Memento: Index suppressed; already indexed", {
        url
      })
      chrome.runtime.sendMessage?.({
        type: "telemetry",
        event: "index_suppressed",
        url
      })
    } catch (e) {
      // best-effort, ignore
    }
    return
  }

  inFlightIndexUrl = url
  try {
    const ok = await extractAndSend(url)
    if (ok) {
      lastSuccessfullyIndexedUrl = url
    }
  } finally {
    if (inFlightIndexUrl === url) {
      inFlightIndexUrl = ""
    }
  }
}

const scheduleIndex = (url: string, delayMs: number) => {
  clearPendingIndexTimer()
  pendingIndexTimer = window.setTimeout(() => {
    pendingIndexTimer = null
    void triggerIndexForUrl(url).catch((e) =>
      console.error("Memento: Scheduled index failed", e)
    )
  }, delayMs)
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
const handleLocationChange = () => {
  const href = window.location.href
  if (href === lastObservedUrl) return
  lastObservedUrl = href

  // give SPA content a moment to render
  scheduleIndex(href, SPA_DEBOUNCE_MS)
}

// Emergency index when user navigates away or hides the page
const handleVisibilityOrUnload = () => {
  const href = window.location.href
  if (hasIndexedUrl(href) || inFlightIndexUrl === href) return

  clearPendingIndexTimer()
  try {
    // best-effort immediate indexing
    void triggerIndexForUrl(href).catch(() => {})
  } catch (e) {
    // ignore
  }
}

// Wire up SPA + emergency listeners
const setupAdditionalIndexing = () => {
  try {
    // Sync userId if we are on the dashboard domain
    if (window.location.hostname === DASHBOARD_HOSTNAME) {
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
    window.setInterval(handleLocationChange, URL_POLL_INTERVAL_MS)

    // If the page becomes hidden or is about to unload, attempt an immediate index
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") handleVisibilityOrUnload()
    })
    window.addEventListener("beforeunload", handleVisibilityOrUnload)
  } catch (e) {
    console.warn("Memento: Failed to setup additional indexing listeners", e)
  }
}

const extractAndSend = async (targetUrl: string) => {
  // 0. Check settings and context
  if (!chrome.runtime?.id) {
    console.warn("Memento: Extension context invalidated.")
    return false
  }

  if (window.location.href !== targetUrl) {
    console.debug("Memento: URL changed before extraction started.", {
      targetUrl,
      currentUrl: window.location.href
    })
    return false
  }

  try {
    const settings = await chrome.storage.local.get([
      "isIndexingEnabled",
      "denylist"
    ])
    const isEnabled = settings.isIndexingEnabled !== false // default to true
    const denylist = (settings.denylist as string[]) || [
      DASHBOARD_HOSTNAME,
      "127.0.0.1"
    ]

    if (!isEnabled) {
      console.debug("Memento: Indexing is disabled. Skipping.")
      return false
    }

    const currentUrl = targetUrl
    const { hostname } = new URL(currentUrl)

    const isBlocked = denylist.some(
      (pattern) => hostname.includes(pattern) || currentUrl.includes(pattern)
    )

    if (isBlocked) {
      console.debug(
        `Memento: URL "${currentUrl}" matches denylist pattern. Skipping.`
      )
      return false
    }

    console.debug("Memento: Starting extraction...")

    // 1. Extract the "meat" of the page
    const docClone = document.cloneNode(true) as Document
    const reader = new Readability(docClone)
    const article = reader.parse()

    if (article && article.textContent) {
      console.debug("Memento: Content extracted. Title:", article.title)

      // 2. Send to API (Communication to Next.js backend)
      let userId = await storage.get<string>("memento_user_id")

      // Fallback: If we don't have a userId yet, generate a stable one for this extension
      if (!userId) {
        userId = `user-${crypto.randomUUID().slice(0, 8)}`
        await storage.set("memento_user_id", userId)
        console.debug("Memento: Generated new stable userId:", userId)
      }

      const response = await chrome.runtime.sendMessage({
        target: "background",
        type: "index-page",
        payload: {
          url: currentUrl,
          title: article.title,
          content: article.textContent
        }
      })

      if (response?.ok) {
        console.debug("Memento: Successfully indexed page.")
        return true
      } else {
        console.error(
          "Memento: Background indexing returned error:",
          response?.status ?? response?.error ?? "unknown"
        )
        return false
      }
    } else {
      console.debug(
        "Memento: Readability could not find any content on this page."
      )
      return false
    }
  } catch (error) {
    console.error("Memento: Error during indexing process:", error)
    return false
  }
}

// The 5 second rule
const scheduleInitialIndex = () => {
  console.debug("Memento: Content script loaded. Timer started (5s)...")
  scheduleIndex(window.location.href, 5000)
}

if (document.readyState === "complete") {
  scheduleInitialIndex()
} else {
  window.addEventListener("load", scheduleInitialIndex, { once: true })
}

// Additional indexing listeners to support SPAs and quick exits
setupAdditionalIndexing()

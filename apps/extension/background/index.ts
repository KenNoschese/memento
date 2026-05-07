export {}

import { Storage } from "@plasmohq/storage"

import { getApiBaseUrl } from "../config"

type OperationStatus = {
  ok: boolean
  at: number
  error?: string
}

type PageStatus = "eligible" | "blocked" | "unsupported" | "paused"

// Show INIT badge to confirm service worker is running
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "LOAD" })
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
})

let isRecording = false
let lastStartTime = 0
let lastStopTime = 0
const COMMAND_DEBOUNCE_MS = 1000

// URL blocking for privacy/stability: protocols and hosts we should never record
const BLOCKED_PROTOCOLS = [
  "chrome-extension:",
  "file:",
  "about:",
  "data:"
]

const BLOCKED_HOSTS = ["localhost"]
const DEFAULT_DENYLIST = ["localhost", "127.0.0.1"]

const isUrlBlocked = (rawUrl?: string) => {
  if (!rawUrl) return true
  try {
    const u = new URL(rawUrl)
    if (BLOCKED_PROTOCOLS.includes(u.protocol)) return true
    if (BLOCKED_HOSTS.includes(u.hostname)) return true
    return false
  } catch (e) {
    // fallback to basic string checks
    for (const p of BLOCKED_PROTOCOLS) if (rawUrl.startsWith(p)) return true
    for (const h of BLOCKED_HOSTS) if (rawUrl.includes(h)) return true
    return false
  }
}

const storage = new Storage()
const POPUP_STATUS_STORAGE_KEY = "popupStatus"

const getStoredPopupStatus = async () => {
  const result = await chrome.storage.local.get([POPUP_STATUS_STORAGE_KEY])
  return (result[POPUP_STATUS_STORAGE_KEY] ?? {}) as {
    lastIndex?: OperationStatus
    lastVoiceNote?: OperationStatus
    hasMicPermission?: boolean | "unknown"
  }
}

const setStoredPopupStatus = async (
  patch: Partial<{
    lastIndex: OperationStatus
    lastVoiceNote: OperationStatus
    hasMicPermission: boolean | "unknown"
  }>
) => {
  const current = await getStoredPopupStatus()
  await chrome.storage.local.set({
    [POPUP_STATUS_STORAGE_KEY]: {
      ...current,
      ...patch
    }
  })
}

const getOrCreateUserId = async () => {
  let userId = await storage.get<string>("memento_user_id")

  if (!userId) {
    userId = `user-${crypto.randomUUID().slice(0, 8)}`
    await storage.set("memento_user_id", userId)
  }

  return userId
}

const getPageStatus = async (rawUrl?: string): Promise<{
  pageStatus: PageStatus
  pageStatusReason?: string
}> => {
  const settings = await chrome.storage.local.get([
    "isIndexingEnabled",
    "denylist"
  ])
  const isIndexingEnabled = settings.isIndexingEnabled !== false
  const denylist = (settings.denylist as string[] | undefined) ?? DEFAULT_DENYLIST

  if (!isIndexingEnabled) {
    return {
      pageStatus: "paused",
      pageStatusReason: "Auto-indexing is paused"
    }
  }

  if (!rawUrl) {
    return {
      pageStatus: "unsupported",
      pageStatusReason: "No active page detected"
    }
  }

  try {
    const url = new URL(rawUrl)

    if (BLOCKED_PROTOCOLS.includes(url.protocol) || rawUrl.startsWith("chrome://")) {
      return {
        pageStatus: "unsupported",
        pageStatusReason: "This browser page cannot be indexed or recorded"
      }
    }

    if (BLOCKED_HOSTS.includes(url.hostname)) {
      return {
        pageStatus: "blocked",
        pageStatusReason: "Local development pages are excluded"
      }
    }

    const matchingPattern = denylist.find(
      (pattern) => url.hostname.includes(pattern) || rawUrl.includes(pattern)
    )

    if (matchingPattern) {
      return {
        pageStatus: "blocked",
        pageStatusReason: `Blocked by denylist: ${matchingPattern}`
      }
    }
  } catch (error) {
    return {
      pageStatus: "unsupported",
      pageStatusReason: "This URL is not supported"
    }
  }

  return {
    pageStatus: "eligible",
    pageStatusReason: "This page is ready for indexing and voice notes"
  }
}

const getActiveBrowserTab = async () => {
  const candidateQueries: chrome.tabs.QueryInfo[] = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
    { active: true }
  ]

  for (const query of candidateQueries) {
    const tabs = await chrome.tabs.query(query)
    const tab = tabs.find((candidate) => {
      if (!candidate.url) return false
      return !candidate.url.startsWith("chrome-extension://")
    })

    if (tab) {
      return tab
    }
  }

  return null
}

const getActiveTabDetails = async () => {
  const tab = await getActiveBrowserTab()

  if (!tab?.url) {
    return null
  }

  try {
    const url = new URL(tab.url)
    return {
      url: tab.url,
      title: tab.title ?? "Untitled page",
      hostname: url.hostname
    }
  } catch (error) {
    return {
      url: tab.url,
      title: tab.title ?? "Untitled page",
      hostname: ""
    }
  }
}

const getPopupState = async () => {
  const [popupStatus, activeTab, apiBaseUrl, userId, settings] = await Promise.all([
    getStoredPopupStatus(),
    getActiveTabDetails(),
    getApiBaseUrl(),
    getOrCreateUserId(),
    chrome.storage.local.get(["isIndexingEnabled"])
  ])
  const pageState = await getPageStatus(activeTab?.url)

  return {
    isRecording,
    isIndexingEnabled: settings.isIndexingEnabled !== false,
    hasMicPermission: popupStatus.hasMicPermission ?? "unknown",
    apiBaseUrl,
    userId,
    activeTab,
    pageStatus: pageState.pageStatus,
    pageStatusReason: pageState.pageStatusReason,
    lastIndex: popupStatus.lastIndex,
    lastVoiceNote: popupStatus.lastVoiceNote
  }
}

// Unified Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "background") return
  
  if (message.type === "start-record") {
    void startRecording()
  } else if (message.type === "stop-record") {
    void stopRecording()
  } else if (message.type === "recording-finished") {
    isRecording = false
    chrome.action.setBadgeText({ text: "" })
    void setStoredPopupStatus({
      lastVoiceNote: {
        ok: true,
        at: Date.now()
      }
    })
    void teardownOffscreen()
  } else if (message.type === "recording-failed") {
    console.error("Background: Recording failed reported:", message.error)
    isRecording = false
    chrome.action.setBadgeText({ text: "ERR" })
    void setStoredPopupStatus({
      lastVoiceNote: {
        ok: false,
        at: Date.now(),
        error: message.error || "Recording failed"
      }
    })
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000)
    void teardownOffscreen()
  } else if (message.type === "microphone-permission-result") {
    void setStoredPopupStatus({
      hasMicPermission: message.granted ? true : false
    })
    sendResponse({ ok: true })
  } else if (message.type === "get-popup-state") {
    void (async () => {
      try {
        sendResponse(await getPopupState())
      } catch (error) {
        console.error("Background: Failed to build popup state:", error)
        sendResponse({
          isRecording,
          isIndexingEnabled: true,
          hasMicPermission: "unknown",
          apiBaseUrl: await getApiBaseUrl(),
          userId: await getOrCreateUserId(),
          activeTab: null,
          pageStatus: "unsupported",
          pageStatusReason: "Unable to load popup state"
        })
      }
    })()
    return true
  } else if (message.type === "index-page") {
    void (async () => {
      try {
        const apiBaseUrl = await getApiBaseUrl()
        const userId = await getOrCreateUserId()

        const response = await fetch(`${apiBaseUrl}/api/index`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url: message.payload?.url,
            title: message.payload?.title,
            content: message.payload?.content,
            memento_user_id: userId
          })
        })

        await setStoredPopupStatus({
          lastIndex: response.ok
            ? {
                ok: true,
                at: Date.now()
              }
            : {
                ok: false,
                at: Date.now(),
                error: `Server returned ${response.status}`
              }
        })

        sendResponse({
          ok: response.ok,
          status: response.status
        })
      } catch (error) {
        console.error("Background: Page indexing failed:", error)
        await setStoredPopupStatus({
          lastIndex: {
            ok: false,
            at: Date.now(),
            error: error instanceof Error ? error.message : "Unknown error"
          }
        })
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }
    })()

    return true
  }
})

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "start-voice-record") {
    await startRecording()
  } else if (command === "stop-voice-record") {
    await stopRecording()
  }
})

async function startRecording() {
  const now = Date.now()
  if (now - lastStartTime < COMMAND_DEBOUNCE_MS) {
    return
  }
  lastStartTime = now

  if (isRecording) {
    return
  }
  isRecording = true

  try {
    const tab = await getActiveBrowserTab()
    
    if (!tab?.url || tab.url.startsWith("chrome://")) {
      console.warn("Cannot record on this page:", tab?.url)
      isRecording = false
      chrome.action.setBadgeText({ text: "NA" })
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
      return
    }

    // Additional blocked URL checks (chrome-extension://, file://, about:, data:, localhost)
    if (isUrlBlocked(tab.url)) {
      console.warn("Cannot record on blocked/unsupported URL:", tab.url)
      isRecording = false
      chrome.action.setBadgeText({ text: "NA" })
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
      return
    }

    await setupOffscreen()
    
    let attempts = 0
    const sendMessage = async () => {
      try {
        let userId = await storage.get<string>("memento_user_id")
        if (!userId) {
          userId = `user-${crypto.randomUUID().slice(0, 8)}`
          await storage.set("memento_user_id", userId)
        }

        await chrome.runtime.sendMessage({ 
          type: "start-recording", 
          target: "offscreen", 
          url: tab.url,
          title: tab.title ?? "",
          userId
        })
        return true
      } catch (e) {
        return false
      }
    }

    while (attempts < 10 && !(await sendMessage())) {
      await new Promise(r => setTimeout(r, 200))
      attempts++
    }

    if (attempts >= 10) {
      console.error("Failed to reach offscreen document after 10 attempts")
      isRecording = false
      chrome.action.setBadgeText({ text: "FAIL" })
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
      return
    }

    chrome.action.setBadgeText({ text: "REC" })
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })
  } catch (error) {
    isRecording = false
    console.error("Start recording logic error:", error)
    await setStoredPopupStatus({
      lastVoiceNote: {
        ok: false,
        at: Date.now(),
        error: error instanceof Error ? error.message : "Unable to start recording"
      }
    })
    chrome.action.setBadgeText({ text: "ERR!" })
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
  }
}

async function stopRecording() {
  const now = Date.now()
  if (now - lastStopTime < COMMAND_DEBOUNCE_MS) {
    return
  }
  lastStopTime = now

  if (!isRecording) {
    return
  }

  try {
    await chrome.runtime.sendMessage({ type: "stop-recording", target: "offscreen" })
    isRecording = false
    chrome.action.setBadgeText({ text: "" })
  } catch (error) {
    console.error("Stop recording failed:", error)
  } finally {
    isRecording = false
    chrome.action.setBadgeText({ text: "" })
  }
}

async function setupOffscreen() {
  try {
    const contexts = await (chrome.runtime as any).getContexts({ 
      contextTypes: ["OFFSCREEN_DOCUMENT"] 
    })
    if (contexts.length > 0) return

    await chrome.offscreen.createDocument({
      url: "tabs/offscreen.html",
      reasons: ["USER_MEDIA" as any],
      justification: "Recording audio for voice notes"
    })
  } catch (error: any) {
    if (!error.message.includes("Only a single offscreen document may be created")) {
      console.error("Offscreen creation failed:", error)
      throw error
    }
  }
}

async function teardownOffscreen() {
  try {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"]
    })

    if (contexts.length === 0) return

    await chrome.offscreen.closeDocument()
  } catch (error: any) {
    if (!error?.message?.includes("No current offscreen document")) {
      console.error("Offscreen teardown failed:", error)
    }
  }
}

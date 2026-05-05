export {}

// Show INIT badge to confirm service worker is running
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "LOAD" })
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
})

let isRecording = false

// URL blocking for privacy/stability: protocols and hosts we should never record
const BLOCKED_PROTOCOLS = [
  'chrome-extension:',
  'file:',
  'about:',
  'data:'
]

const BLOCKED_HOSTS = [
  'localhost'
]

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

// Unified Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "background") return
  
  if (message.type === "toggle-record") {
    if (isRecording) {
      void stopRecording()
    } else {
      void startRecording()
    }
  } else if (message.type === "recording-finished") {
    console.log("Recording finished successfully")
    isRecording = false
    chrome.action.setBadgeText({ text: "" })
    void teardownOffscreen()
  } else if (message.type === "recording-failed") {
    console.error("Recording failed reported by offscreen:", message.error)
    isRecording = false
    chrome.action.setBadgeText({ text: "ERR" })
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000)
    void teardownOffscreen()
  }
})

chrome.commands.onCommand.addListener(async (command) => {
  console.log("Command received:", command)
  if (command === "toggle-voice-record") {
    const currentBadge = await chrome.action.getBadgeText({})
    if (!currentBadge) {
      chrome.action.setBadgeText({ text: "..." })
    }

    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }
})

async function startRecording() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    
    if (!tab?.url || tab.url.startsWith("chrome://")) {
      console.warn("Cannot record on this page:", tab?.url)
      chrome.action.setBadgeText({ text: "NA" })
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
      return
    }

    // Additional blocked URL checks (chrome-extension://, file://, about:, data:, localhost)
    if (isUrlBlocked(tab.url)) {
      console.warn("Cannot record on blocked/unsupported URL:", tab.url)
      chrome.action.setBadgeText({ text: "NA" })
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
      return
    }

    await setupOffscreen()
    
    let attempts = 0
    const sendMessage = async () => {
      try {
        await chrome.runtime.sendMessage({ 
          type: "start-recording", 
          target: "offscreen", 
          url: tab.url 
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
      chrome.action.setBadgeText({ text: "FAIL" })
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
      return
    }

    isRecording = true
    chrome.action.setBadgeText({ text: "REC" })
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })
  } catch (error) {
    console.error("Start recording logic error:", error)
    chrome.action.setBadgeText({ text: "ERR!" })
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000)
  }
}

async function stopRecording() {
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
      url: "offscreen.html",
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

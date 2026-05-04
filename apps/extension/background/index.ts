export {}

let isRecording = false

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-voice-record") {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }
})

async function startRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return

  await setupOffscreen()
  chrome.runtime.sendMessage({ type: "start-recording", target: "offscreen", url: tab.url })
  isRecording = true
  chrome.action.setBadgeText({ text: "REC" })
  chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })
}

async function stopRecording() {
  chrome.runtime.sendMessage({ type: "stop-recording", target: "offscreen" })
  isRecording = false
  chrome.action.setBadgeText({ text: "" })
}

async function setupOffscreen() {
  const contexts = await (chrome.runtime as any).getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })
  if (contexts.length > 0) return

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA" as any],
    justification: "Recording audio for voice notes"
  })
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "background") return
  if (message.type === "recording-finished") {
    isRecording = false
    chrome.action.setBadgeText({ text: "" })
  } else if (message.type === "recording-failed") {
    isRecording = false
    chrome.action.setBadgeText({ text: "ERR" })
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000)
  }
})

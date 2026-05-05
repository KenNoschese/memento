/**
 * Centralized configuration for the extension.
 * Provides dynamic API base URL with fallback to localhost.
 */

export const getApiBaseUrl = async (): Promise<string> => {
  try {
    const settings = await chrome.storage.local.get("apiBaseUrl")
    return settings.apiBaseUrl || "http://localhost:3000"
  } catch (error) {
    console.warn("Failed to get API base URL from storage, using default")
    return "http://localhost:3000"
  }
}

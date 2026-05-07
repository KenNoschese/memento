/**
 * Centralized configuration for the extension.
 * Provides dynamic API base URL with fallback to the deployed dashboard.
 */

const DEFAULT_API_BASE_URL = "https://memento-mjk1.vercel.app"

export const getApiBaseUrl = async (): Promise<string> => {
  try {
    const settings = await chrome.storage.local.get("apiBaseUrl")
    return settings.apiBaseUrl || DEFAULT_API_BASE_URL
  } catch (error) {
    console.warn("Failed to get API base URL from storage, using default")
    return DEFAULT_API_BASE_URL
  }
}

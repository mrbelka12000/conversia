/**
 * Chrome storage utility wrapper
 * Provides async/await interface for chrome.storage operations
 */

const STORAGE_KEYS = {
  TRANSCRIPT: 'transcript',
  SETTINGS: 'settings',
  RECORDING_STATE: 'recordingState',
  AUDIO_CHUNKS: 'audioChunks',
};

const DEFAULT_SETTINGS = {
  language: 'en-US',
  autoStop: true,
  autoDownload: true,
  showIndicator: true,
  apiKey: '',
  summaryProvider: 'openai', // 'openai' or 'claude'
};

/**
 * Get data from chrome.storage.local
 * @param {string|string[]} keys - Key(s) to retrieve
 * @returns {Promise<any>}
 */
export async function get(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Set data in chrome.storage.local
 * @param {object} data - Data to store
 * @returns {Promise<void>}
 */
export async function set(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Remove data from chrome.storage.local
 * @param {string|string[]} keys - Key(s) to remove
 * @returns {Promise<void>}
 */
export async function remove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Clear all data from chrome.storage.local
 * @returns {Promise<void>}
 */
export async function clear() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get transcript from storage
 * @returns {Promise<string>}
 */
export async function getTranscript() {
  const result = await get(STORAGE_KEYS.TRANSCRIPT);
  return result[STORAGE_KEYS.TRANSCRIPT] || '';
}

/**
 * Append text to transcript
 * @param {string} text - Text to append
 * @returns {Promise<void>}
 */
export async function appendTranscript(text) {
  const current = await getTranscript();
  const timestamp = new Date().toLocaleTimeString();
  const newTranscript = current + `[${timestamp}] ${text}\n`;
  await set({ [STORAGE_KEYS.TRANSCRIPT]: newTranscript });
}

/**
 * Clear transcript
 * @returns {Promise<void>}
 */
export async function clearTranscript() {
  await remove(STORAGE_KEYS.TRANSCRIPT);
}

/**
 * Get settings
 * @returns {Promise<object>}
 */
export async function getSettings() {
  const result = await get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

/**
 * Save settings
 * @param {object} settings - Settings to save
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  const current = await getSettings();
  await set({ [STORAGE_KEYS.SETTINGS]: { ...current, ...settings } });
}

/**
 * Get recording state
 * @returns {Promise<object>}
 */
export async function getRecordingState() {
  const result = await get(STORAGE_KEYS.RECORDING_STATE);
  return result[STORAGE_KEYS.RECORDING_STATE] || { isRecording: false, startTime: null };
}

/**
 * Set recording state
 * @param {object} state - Recording state
 * @returns {Promise<void>}
 */
export async function setRecordingState(state) {
  await set({ [STORAGE_KEYS.RECORDING_STATE]: state });
}

export { STORAGE_KEYS, DEFAULT_SETTINGS };

/**
 * Background Service Worker
 * Coordinates tabCapture, offscreen document, and messaging between components
 */

// State management
let currentTabId = null;
let isRecording = false;
let offscreenDocumentExists = false;

// Offscreen document path
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

/**
 * Check if offscreen document exists
 */
async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
    });
    return contexts.length > 0;
  }
  return offscreenDocumentExists;
}

/**
 * Create offscreen document for audio capture
 */
async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    console.log('[ServiceWorker] Offscreen document already exists');
    return;
  }

  console.log('[ServiceWorker] Creating offscreen document...');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Recording tab audio for transcription',
  });
  offscreenDocumentExists = true;
  console.log('[ServiceWorker] Offscreen document created');
}

/**
 * Close offscreen document
 */
async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) {
    return;
  }

  console.log('[ServiceWorker] Closing offscreen document...');
  await chrome.offscreen.closeDocument();
  offscreenDocumentExists = false;
  console.log('[ServiceWorker] Offscreen document closed');
}

/**
 * Download transcript as a text file
 */
async function downloadTranscript() {
  try {
    const result = await chrome.storage.local.get('transcript');
    const transcriptText = result.transcript || '';

    if (!transcriptText) {
      console.log('[ServiceWorker] No transcript to download');
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toLocaleTimeString().replace(/:/g, '-');
    const filename = `conversia-transcript-${date}-${time}.txt`;

    // Create a data URL from the transcript text
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const reader = new FileReader();

    reader.onloadend = () => {
      const dataUrl = reader.result;
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false,
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[ServiceWorker] Download failed:', chrome.runtime.lastError);
        } else {
          console.log('[ServiceWorker] Transcript downloaded, id:', downloadId);
        }
      });
    };

    reader.readAsDataURL(blob);
  } catch (error) {
    console.error('[ServiceWorker] Error downloading transcript:', error);
  }
}

/**
 * Start recording from a tab
 * @param {number} tabId - Tab ID to capture
 */
async function startRecording(tabId) {
  if (isRecording) {
    console.log('[ServiceWorker] Already recording');
    return { success: false, error: 'Already recording' };
  }

  try {
    console.log('[ServiceWorker] Starting recording for tab:', tabId);

    // Get the stream ID for tab capture
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });

    console.log('[ServiceWorker] Got stream ID:', streamId);

    // Create offscreen document
    await createOffscreenDocument();

    // Get settings for API key and language
    const settingsResult = await chrome.storage.local.get('settings');
    const settings = settingsResult.settings || {};

    // Send message to offscreen document to start recording
    await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      target: 'offscreen',
      data: {
        streamId,
        tabId,
        apiKey: settings.apiKey || '',
        language: settings.language || 'en-US',
      },
    });

    isRecording = true;
    currentTabId = tabId;

    // Save recording state
    await chrome.storage.local.set({
      recordingState: {
        isRecording: true,
        startTime: Date.now(),
        tabId,
      },
    });

    // Notify content script
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'RECORDING_STARTED',
      });
    } catch (e) {
      console.log('[ServiceWorker] Could not notify content script:', e.message);
    }

    console.log('[ServiceWorker] Recording started');
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Failed to start recording:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Stop recording
 * @param {boolean} autoTriggered - Whether this stop was triggered automatically (call end, tab close, etc.)
 */
async function stopRecording(autoTriggered = false) {
  if (!isRecording) {
    console.log('[ServiceWorker] Not recording');
    return { success: false, error: 'Not recording' };
  }

  try {
    console.log('[ServiceWorker] Stopping recording...');

    // Send message to offscreen document to stop recording
    await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING',
      target: 'offscreen',
    });

    isRecording = false;

    // Notify content script
    if (currentTabId) {
      try {
        await chrome.tabs.sendMessage(currentTabId, {
          type: 'RECORDING_STOPPED',
        });
      } catch (e) {
        console.log('[ServiceWorker] Could not notify content script:', e.message);
      }
    }

    currentTabId = null;

    // Save recording state
    await chrome.storage.local.set({
      recordingState: {
        isRecording: false,
        startTime: null,
        tabId: null,
      },
    });

    // Close offscreen document after a delay to ensure cleanup
    setTimeout(() => {
      closeOffscreenDocument();
    }, 1000);

    // Auto-download transcript if enabled and stop was auto-triggered
    if (autoTriggered) {
      const settingsResult = await chrome.storage.local.get('settings');
      const settings = settingsResult.settings || {};
      if (settings.autoDownload !== false) {
        // Delay download to ensure final transcript chunk is saved
        setTimeout(() => {
          downloadTranscript();
        }, 2000);
      }
    }

    console.log('[ServiceWorker] Recording stopped');
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Failed to stop recording:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get recording status
 */
function getRecordingStatus() {
  return {
    isRecording,
    tabId: currentTabId,
  };
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ServiceWorker] Received message:', message.type);

  // Handle auto-start from content script
  if (message.type === 'AUTO_START_RECORDING') {
    // Get tab ID from sender
    const tabId = sender.tab?.id;
    if (tabId) {
      console.log('[ServiceWorker] Auto-starting recording for tab:', tabId);
      startRecording(tabId).then(sendResponse);
    } else {
      sendResponse({ success: false, error: 'No tab ID' });
    }
    return true; // Async response
  }

  // Handle messages from popup
  if (message.type === 'START_RECORDING') {
    startRecording(message.tabId).then(sendResponse);
    return true; // Async response
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording(message.autoTriggered === true).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse(getRecordingStatus());
    return false;
  }

  // Handle transcript updates from content script or offscreen
  if (message.type === 'TRANSCRIPT_UPDATE' && message.target === 'background') {
    console.log('[ServiceWorker] Received transcript:', message.data.transcript);

    // Save transcript to storage
    if (message.data.isFinal) {
      chrome.storage.local.get('transcript', (result) => {
        const currentTranscript = result.transcript || '';
        const time = new Date(message.data.timestamp).toLocaleTimeString();
        const newTranscript = currentTranscript + `[${time}] ${message.data.transcript}\n`;

        chrome.storage.local.set({ transcript: newTranscript }, () => {
          console.log('[ServiceWorker] Transcript saved to storage');
        });
      });
    }

    // Forward to popup if open
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPT_UPDATE',
      target: 'popup',
      data: message.data,
    }).catch(() => {
      // Popup might not be open
    });
    return false;
  }

  // Handle audio data from offscreen (for potential Whisper API integration)
  if (message.type === 'AUDIO_DATA' && message.target === 'background') {
    // Store audio data for later processing
    console.log('[ServiceWorker] Received audio data chunk');
    return false;
  }

  return false;
});

// Handle tab close - auto-stop recording
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId && isRecording) {
    console.log('[ServiceWorker] Recording tab closed, stopping recording');
    stopRecording(true); // Auto-triggered
  }
});

// Handle tab navigation - auto-stop if navigating away from Meet
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTabId && isRecording && changeInfo.url) {
    if (!changeInfo.url.includes('meet.google.com')) {
      console.log('[ServiceWorker] Navigated away from Meet, stopping recording');
      stopRecording(true); // Auto-triggered
    }
  }
});

// Keep service worker alive with periodic alarm
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && isRecording) {
    console.log('[ServiceWorker] Keep-alive ping');
  }
});

console.log('[ServiceWorker] Initialized');

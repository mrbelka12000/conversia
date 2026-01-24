/**
 * Content Script for Google Meet
 * Handles auto-start recording when call begins and recording indicator
 */

let recordingIndicator = null;
let isRecording = false;
let callDetectionInterval = null;
let wasInCall = false;

/**
 * Check if we're in an active Meet call
 */
function isInMeetCall() {
  // Check URL for meeting code pattern (xxx-xxxx-xxx)
  const hasMeetingCode = /\/[a-z]{3}-[a-z]{4}-[a-z]{3}/.test(window.location.pathname);

  // Check for call UI elements
  const hasCallUI = !!(
    document.querySelector('[data-self-name]') || // Self video
    document.querySelector('[data-requested-participant-id]') || // Participants
    document.querySelector('[jscontroller="kAPMuc"]') || // Video container
    document.querySelector('.T4LgNb') || // Call controls
    document.querySelector('[data-call-active="true"]')
  );

  return hasMeetingCode && hasCallUI;
}

/**
 * Request recording start from background
 */
async function requestStartRecording() {
  if (isRecording) {
    console.log('[Conversia] Already recording');
    return;
  }

  console.log('[Conversia] Auto-starting recording...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AUTO_START_RECORDING',
    });

    if (response?.success) {
      console.log('[Conversia] Recording started successfully');
    } else {
      console.log('[Conversia] Failed to start recording:', response?.error);
    }
  } catch (error) {
    console.error('[Conversia] Error starting recording:', error);
  }
}

/**
 * Request recording stop from background
 */
async function requestStopRecording() {
  if (!isRecording) {
    return;
  }

  console.log('[Conversia] Auto-stopping recording...');

  try {
    await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING',
      autoTriggered: true,
    });
  } catch (error) {
    console.error('[Conversia] Error stopping recording:', error);
  }
}

/**
 * Check for call state changes
 */
function checkCallState() {
  const inCall = isInMeetCall();

  // Joined a call
  if (inCall && !wasInCall && !isRecording) {
    console.log('[Conversia] Detected call start');

    // Check if auto-start is enabled
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || {};
      if (settings.autoStart !== false) {
        // Small delay to ensure Meet is fully loaded
        setTimeout(() => {
          if (isInMeetCall() && !isRecording) {
            requestStartRecording();
          }
        }, 2000);
      }
    });
  }

  // Left a call
  if (!inCall && wasInCall && isRecording) {
    console.log('[Conversia] Detected call end');

    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || {};
      if (settings.autoStop !== false) {
        requestStopRecording();
      }
    });
  }

  wasInCall = inCall;
}

/**
 * Create recording indicator element
 */
function createRecordingIndicator() {
  if (recordingIndicator) {
    return recordingIndicator;
  }

  const indicator = document.createElement('div');
  indicator.id = 'conversia-recording-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(239, 68, 68, 0.95);
      color: white;
      border-radius: 20px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      animation: conversia-fadeIn 0.3s ease;
    ">
      <div style="
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
        animation: conversia-pulse 1.5s infinite;
      "></div>
      <span>Conversia Recording</span>
    </div>
    <style>
      @keyframes conversia-fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes conversia-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  `;

  document.body.appendChild(indicator);
  recordingIndicator = indicator;

  return indicator;
}

/**
 * Remove recording indicator
 */
function removeRecordingIndicator() {
  if (recordingIndicator) {
    recordingIndicator.remove();
    recordingIndicator = null;
  }
}

/**
 * Show recording started notification
 */
function showStartNotification() {
  chrome.storage.local.get('settings', (result) => {
    const settings = result.settings || {};
    if (settings.showIndicator !== false) {
      createRecordingIndicator();
    }
  });
}

/**
 * Initialize content script
 */
function init() {
  console.log('[Conversia] Content script initialized on Meet page');

  // Check if already recording
  chrome.storage.local.get('recordingState', (result) => {
    if (result.recordingState?.isRecording) {
      isRecording = true;
      showStartNotification();
    }
  });

  // Check initial call state
  wasInCall = isInMeetCall();
  console.log('[Conversia] Initial call state:', wasInCall ? 'In call' : 'Not in call');

  // Start periodic call state checking
  callDetectionInterval = setInterval(checkCallState, 2000);

  // Also check on visibility change (tab switch back)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkCallState();
    }
  });
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Conversia] Received message:', message.type);

  if (message.type === 'RECORDING_STARTED') {
    isRecording = true;
    showStartNotification();
    sendResponse({ success: true });
  }

  if (message.type === 'RECORDING_STOPPED') {
    isRecording = false;
    removeRecordingIndicator();
    sendResponse({ success: true });
  }

  return false;
});

// Listen to storage changes as fallback for recording state
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.recordingState) {
    const newState = changes.recordingState.newValue;
    console.log('[Conversia] Recording state changed:', newState);

    if (newState?.isRecording && !isRecording) {
      isRecording = true;
      showStartNotification();
    } else if (!newState?.isRecording && isRecording) {
      isRecording = false;
      removeRecordingIndicator();
    }
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

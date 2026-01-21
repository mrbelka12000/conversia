/**
 * Popup Script
 * Handles UI interactions and communication with background service worker
 */

import { summarize, generateLocalSummary } from '../lib/summarizer.js';

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const notMeetWarning = document.getElementById('notMeetWarning');
const controls = document.getElementById('controls');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const timer = document.getElementById('timer');
const timerValue = document.getElementById('timerValue');
const transcript = document.getElementById('transcript');
const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
const summaryBtn = document.getElementById('summaryBtn');
const summary = document.getElementById('summary');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const languageSelect = document.getElementById('languageSelect');
const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const autoStartCheckbox = document.getElementById('autoStartCheckbox');
const autoStopCheckbox = document.getElementById('autoStopCheckbox');
const showIndicatorCheckbox = document.getElementById('showIndicatorCheckbox');

// State
let currentTabId = null;
let isRecording = false;
let recordingStartTime = null;
let timerInterval = null;
let transcriptText = '';

/**
 * Initialize the popup
 */
async function init() {
  // Check if we're on a Google Meet tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  const isMeetTab = tab?.url?.includes('meet.google.com');

  if (!isMeetTab) {
    notMeetWarning.style.display = 'flex';
    controls.style.display = 'none';
  } else {
    notMeetWarning.style.display = 'none';
    controls.style.display = 'flex';
  }

  // Load settings
  await loadSettings();

  // Check current recording status
  await checkRecordingStatus();

  // Load transcript from storage
  await loadTranscript();

  // Set up event listeners
  setupEventListeners();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  const settings = result.settings || {};

  languageSelect.value = settings.language || 'en-US';
  providerSelect.value = settings.summaryProvider || 'openai';
  apiKeyInput.value = settings.apiKey || '';
  autoStartCheckbox.checked = settings.autoStart !== false;
  autoStopCheckbox.checked = settings.autoStop !== false;
  showIndicatorCheckbox.checked = settings.showIndicator !== false;
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const settings = {
    language: languageSelect.value,
    summaryProvider: providerSelect.value,
    apiKey: apiKeyInput.value,
    autoStart: autoStartCheckbox.checked,
    autoStop: autoStopCheckbox.checked,
    showIndicator: showIndicatorCheckbox.checked,
  };

  await chrome.storage.local.set({ settings });
  settingsModal.style.display = 'none';
}

/**
 * Check current recording status
 */
async function checkRecordingStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  const recordingState = await chrome.storage.local.get('recordingState');

  if (response?.isRecording || recordingState.recordingState?.isRecording) {
    isRecording = true;
    recordingStartTime = recordingState.recordingState?.startTime || Date.now();
    updateUIForRecording(true);
    startTimer();
  }
}

/**
 * Load transcript from storage
 */
async function loadTranscript() {
  const result = await chrome.storage.local.get('transcript');
  transcriptText = result.transcript || '';

  if (transcriptText) {
    updateTranscriptDisplay();
  }
}

/**
 * Update transcript display
 */
function updateTranscriptDisplay() {
  if (!transcriptText) {
    transcript.innerHTML = '<p class="transcript-empty">Transcript will appear here...</p>';
    return;
  }

  const entries = transcriptText.split('\n').filter((line) => line.trim());
  transcript.innerHTML = entries
    .slice(-50) // Show last 50 entries
    .map((entry) => {
      const match = entry.match(/\[(.*?)\]\s*(.*)/);
      if (match) {
        return `<div class="transcript-entry"><span class="time">${match[1]}</span>${match[2]}</div>`;
      }
      return `<div class="transcript-entry">${entry}</div>`;
    })
    .join('');

  // Scroll to bottom
  transcript.scrollTop = transcript.scrollHeight;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Start recording
  startBtn.addEventListener('click', startRecording);

  // Stop recording
  stopBtn.addEventListener('click', stopRecording);

  // Download transcript
  downloadTranscriptBtn.addEventListener('click', downloadTranscript);

  // Clear transcript
  clearTranscriptBtn.addEventListener('click', clearTranscript);

  // Generate summary
  summaryBtn.addEventListener('click', generateSummary);

  // Settings
  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  saveSettingsBtn.addEventListener('click', saveSettings);

  // Close modal on outside click
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Listen for transcript updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRANSCRIPT_UPDATE' && message.target === 'popup') {
      handleTranscriptUpdate(message.data);
    }
  });
}

/**
 * Start recording
 */
async function startRecording() {
  if (!currentTabId) {
    console.error('No tab ID');
    return;
  }

  startBtn.disabled = true;
  statusText.textContent = 'Starting...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      tabId: currentTabId,
    });

    if (response.success) {
      isRecording = true;
      recordingStartTime = Date.now();
      updateUIForRecording(true);
      startTimer();
      // Speech recognition now runs in content script on Meet page
    } else {
      console.error('Failed to start recording:', response.error);
      statusText.textContent = 'Failed to start';
      startBtn.disabled = false;
    }
  } catch (error) {
    console.error('Error starting recording:', error);
    statusText.textContent = 'Error';
    startBtn.disabled = false;
  }
}

/**
 * Stop recording
 */
async function stopRecording() {
  stopBtn.disabled = true;
  statusText.textContent = 'Stopping...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING',
    });

    if (response.success) {
      isRecording = false;
      updateUIForRecording(false);
      stopTimer();
      // Speech recognition stopped via content script
    } else {
      console.error('Failed to stop recording:', response.error);
    }
  } catch (error) {
    console.error('Error stopping recording:', error);
  }

  stopBtn.disabled = false;
}

/**
 * Update UI for recording state
 * @param {boolean} recording - Whether recording is active
 */
function updateUIForRecording(recording) {
  if (recording) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    timer.style.display = 'block';
    statusDot.classList.add('recording');
    statusText.textContent = 'Recording...';
  } else {
    startBtn.style.display = 'flex';
    startBtn.disabled = false;
    stopBtn.style.display = 'none';
    timer.style.display = 'none';
    statusDot.classList.remove('recording');
    statusText.textContent = 'Not active';
  }
}

/**
 * Start the timer
 */
function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerValue.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

/**
 * Stop the timer
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * Handle transcript update from background
 * @param {object} data - Transcript data
 */
function handleTranscriptUpdate(data) {
  const { transcript: text, isFinal, timestamp } = data;

  if (isFinal) {
    const time = new Date(timestamp).toLocaleTimeString();
    transcriptText += `[${time}] ${text}\n`;

    // Save to storage
    chrome.storage.local.set({ transcript: transcriptText });

    updateTranscriptDisplay();
  }
}

/**
 * Download transcript as text file
 */
function downloadTranscript() {
  if (!transcriptText) {
    alert('No transcript to download');
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toLocaleTimeString().replace(/:/g, '-');
  const filename = `conversia-transcript-${date}-${time}.txt`;

  const blob = new Blob([transcriptText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Clear transcript
 */
async function clearTranscript() {
  transcriptText = '';
  await chrome.storage.local.remove('transcript');
  transcript.innerHTML = '<p class="transcript-empty">Transcript will appear here...</p>';
  summary.style.display = 'none';
}

/**
 * Generate summary
 */
async function generateSummary() {
  if (!transcriptText) {
    alert('No transcript to summarize');
    return;
  }

  summaryBtn.disabled = true;
  summaryBtn.textContent = 'Generating...';
  statusDot.classList.add('processing');
  statusText.textContent = 'Processing...';

  try {
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};

    let summaryText;

    if (settings.apiKey) {
      // Use AI summarization
      summaryText = await summarize(transcriptText, settings);
    } else {
      // Use local summary
      summaryText = generateLocalSummary(transcriptText);
    }

    summary.innerHTML = summaryText.replace(/\n/g, '<br>');
    summary.style.display = 'block';
  } catch (error) {
    console.error('Error generating summary:', error);
    summary.innerHTML = `<strong>Error:</strong> ${error.message}`;
    summary.style.display = 'block';
  }

  summaryBtn.disabled = false;
  summaryBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14,2H6a2,2,0,0,0-2,2V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8Z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
    Generate Summary
  `;
  statusDot.classList.remove('processing');
  statusText.textContent = isRecording ? 'Recording...' : 'Not active';
}

// Initialize
init();

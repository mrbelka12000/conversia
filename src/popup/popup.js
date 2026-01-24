/**
 * Popup Script
 * Handles UI interactions and communication with background service worker
 */

import { summarize, generateLocalSummary, ANALYSIS_TYPES } from '../lib/summarizer.js';

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
const downloadSummaryBtn = document.getElementById('downloadSummaryBtn');
const analysisTypeSelect = document.getElementById('analysisTypeSelect');
const analysisDescription = document.getElementById('analysisDescription');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const languageSelect = document.getElementById('languageSelect');
const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const autoStartCheckbox = document.getElementById('autoStartCheckbox');
const autoStopCheckbox = document.getElementById('autoStopCheckbox');
const autoDownloadCheckbox = document.getElementById('autoDownloadCheckbox');
const showIndicatorCheckbox = document.getElementById('showIndicatorCheckbox');

// State
let currentTabId = null;
let isRecording = false;
let recordingStartTime = null;
let timerInterval = null;
let transcriptText = '';
let currentSummaryText = '';
let currentAnalysisType = 'general';

/**
 * Validate OpenAI API key by listing available models
 */
async function validateOpenAIKey(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, error: 'Please enter an API key' };
  }

  if (!apiKey.startsWith('sk-')) {
    return { valid: false, error: 'API key should start with "sk-"' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key. Please check and try again.' };
      }
      if (response.status === 429) {
        return { valid: false, error: 'Rate limited. Please wait and try again.' };
      }
      return { valid: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const modelIds = data.data?.map(m => m.id) || [];

    const hasWhisper = modelIds.some(id => id.includes('whisper'));
    const hasGpt = modelIds.some(id => id.includes('gpt-4o-mini') || id.includes('gpt-4'));

    if (!hasWhisper) {
      return { valid: false, error: 'Your key does not have access to Whisper (needed for transcription).' };
    }

    return { valid: true, hasWhisper, hasGpt };
  } catch (error) {
    return { valid: false, error: 'Network error. Check your connection.' };
  }
}

/**
 * Show onboarding screen
 */
function showOnboarding() {
  document.getElementById('onboardingScreen').style.display = 'flex';
  document.getElementById('mainScreen').style.display = 'none';
  document.getElementById('footerSection').style.display = 'none';
  setupOnboardingListeners();
}

/**
 * Show main UI
 */
function showMainUI() {
  document.getElementById('onboardingScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'flex';
  document.getElementById('footerSection').style.display = 'flex';
}

/**
 * Set up onboarding event listeners
 */
function setupOnboardingListeners() {
  const validateKeyBtn = document.getElementById('validateKeyBtn');
  const onboardingApiKey = document.getElementById('onboardingApiKey');

  validateKeyBtn.addEventListener('click', handleValidateKey);
  onboardingApiKey.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleValidateKey();
  });
}

/**
 * Handle API key validation
 */
async function handleValidateKey() {
  const btn = document.getElementById('validateKeyBtn');
  const btnText = document.getElementById('validateBtnText');
  const spinner = document.getElementById('validateBtnSpinner');
  const input = document.getElementById('onboardingApiKey');
  const errorDiv = document.getElementById('onboardingError');
  const errorText = document.getElementById('onboardingErrorText');

  errorDiv.style.display = 'none';
  btn.disabled = true;
  btnText.textContent = 'Validating...';
  spinner.style.display = 'inline-block';

  const result = await validateOpenAIKey(input.value.trim());

  if (result.valid) {
    // Save API key
    const current = await chrome.storage.local.get('settings');
    const settings = current.settings || {};
    settings.apiKey = input.value.trim();
    await chrome.storage.local.set({ settings });

    // Transition to main UI
    showMainUI();

    // Initialize main UI
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

    await loadSettings();
    await checkRecordingStatus();
    await loadTranscript();
    setupEventListeners();
  } else {
    errorDiv.style.display = 'block';
    errorText.textContent = result.error;
  }

  btn.disabled = false;
  btnText.textContent = 'Validate & Continue';
  spinner.style.display = 'none';
}

/**
 * Initialize the popup
 */
async function init() {
  // Check for API key first
  const result = await chrome.storage.local.get('settings');
  const settings = result.settings || {};

  if (!settings.apiKey) {
    showOnboarding();
    return;
  }

  // Proceed with normal initialization
  showMainUI();

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

  languageSelect.value = settings.language || 'ru-RU';
  providerSelect.value = settings.summaryProvider || 'openai';
  apiKeyInput.value = settings.apiKey || '';
  autoStartCheckbox.checked = settings.autoStart !== false;
  autoStopCheckbox.checked = settings.autoStop !== false;
  autoDownloadCheckbox.checked = settings.autoDownload !== false;
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
    autoDownload: autoDownloadCheckbox.checked,
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

  // Download summary
  downloadSummaryBtn.addEventListener('click', downloadSummary);

  // Analysis type selection
  analysisTypeSelect.addEventListener('change', updateAnalysisDescription);

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
  currentSummaryText = '';
  await chrome.storage.local.remove('transcript');
  transcript.innerHTML = '<p class="transcript-empty">Transcript will appear here...</p>';
  summary.style.display = 'none';
  downloadSummaryBtn.style.display = 'none';
}

/**
 * Update analysis description when type changes
 */
function updateAnalysisDescription() {
  const selectedType = analysisTypeSelect.value;
  const analysisType = ANALYSIS_TYPES[selectedType];
  if (analysisType && analysisDescription) {
    analysisDescription.textContent = analysisType.description;
  }
}

/**
 * Generate summary
 */
async function generateSummary() {
  if (!transcriptText) {
    alert('No transcript to summarize');
    return;
  }

  const selectedAnalysisType = analysisTypeSelect.value;
  const analysisType = ANALYSIS_TYPES[selectedAnalysisType];

  summaryBtn.disabled = true;
  summaryBtn.textContent = 'Analyzing...';
  statusDot.classList.add('processing');
  statusText.textContent = `Analyzing (${analysisType.name})...`;

  try {
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};

    let summaryText;

    if (settings.apiKey) {
      // Use AI summarization with selected analysis type
      summaryText = await summarize(transcriptText, settings, selectedAnalysisType);
    } else {
      // Use local summary
      summaryText = generateLocalSummary(transcriptText);
    }

    // Store summary for download
    currentSummaryText = summaryText;
    currentAnalysisType = selectedAnalysisType;

    summary.innerHTML = summaryText.replace(/\n/g, '<br>');
    summary.style.display = 'block';
    downloadSummaryBtn.style.display = 'flex';
  } catch (error) {
    console.error('Error generating summary:', error);
    summary.innerHTML = `<strong>Error:</strong> ${error.message}`;
    summary.style.display = 'block';
    downloadSummaryBtn.style.display = 'none';
  }

  summaryBtn.disabled = false;
  summaryBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14,2H6a2,2,0,0,0-2,2V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8Z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
    Analyze
  `;
  statusDot.classList.remove('processing');
  statusText.textContent = isRecording ? 'Recording...' : 'Not active';
}

/**
 * Extract topic from summary text
 * @param {string} summaryText - The summary text
 * @returns {string} - Extracted topic for filename
 */
function extractTopicFromSummary(summaryText) {
  if (!summaryText) return '';

  // Try to find a topic from common patterns in the summary
  const patterns = [
    /(?:Main topic|Topic|Purpose|Subject)[:\s]*([^\n]+)/i,
    /(?:Meeting Context|Overview)[:\s]*\n?[^:]*?([^\n]+)/i,
    /##\s*([^\n]+)/,  // First markdown heading
    /\*\*([^*]+)\*\*/,  // First bold text
  ];

  for (const pattern of patterns) {
    const match = summaryText.match(pattern);
    if (match && match[1]) {
      let topic = match[1].trim();
      // Clean up the topic
      topic = topic.replace(/[#*_]/g, '').trim();
      // Limit length and sanitize for filename
      if (topic.length > 3) {
        return sanitizeFilename(topic.substring(0, 50));
      }
    }
  }

  // Fallback: use first meaningful line
  const lines = summaryText.split('\n').filter(line => {
    const cleaned = line.replace(/[#*_\-]/g, '').trim();
    return cleaned.length > 5 && !cleaned.startsWith('##');
  });

  if (lines.length > 0) {
    return sanitizeFilename(lines[0].substring(0, 50));
  }

  return '';
}

/**
 * Sanitize string for use in filename
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, '')  // Keep letters (latin + cyrillic), numbers, spaces, hyphens
    .replace(/\s+/g, '-')  // Replace spaces with hyphens
    .replace(/-+/g, '-')   // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50);     // Limit length
}

/**
 * Download summary as text file
 */
function downloadSummary() {
  if (!currentSummaryText) {
    alert('No analysis to download');
    return;
  }

  const analysisType = ANALYSIS_TYPES[currentAnalysisType];
  const typeName = analysisType?.name?.toLowerCase().replace(/\s+/g, '-') || 'analysis';
  const topic = extractTopicFromSummary(currentSummaryText);
  const date = new Date().toISOString().slice(0, 10);

  // Build filename: type-topic-date.txt or type-date.txt if no topic
  let filename;
  if (topic) {
    filename = `conversia-${typeName}-${topic}-${date}.txt`;
  } else {
    filename = `conversia-${typeName}-${date}.txt`;
  }

  const blob = new Blob([currentSummaryText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// Initialize
init();

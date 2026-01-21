/**
 * Offscreen Document
 * Captures tab audio and transcribes with Whisper
 *
 * Key insight: MediaRecorder timeslice does NOT create independent files.
 * Only the first chunk has the WebM header. Solution: stop/restart recorder
 * for each transcription batch to get complete files with headers.
 */

let mediaStream = null;
let mediaRecorder = null;
let isRecording = false;
let audioElement = null;
let recordingInterval = null;
let currentChunks = [];

let apiKey = null;
let language = 'en';
let mimeType = 'audio/webm';

const WHISPER_INTERVAL = 15000; // 15s batches

/**
 * Send audio to Whisper API for transcription
 */
async function transcribeWithWhisper(audioBlob) {
  try {
    if (!apiKey) {
      console.log('[Offscreen] No API key configured for Whisper');
      return null;
    }

    if (audioBlob.size < 1000) {
      console.log('[Offscreen] Audio too small, skipping:', audioBlob.size);
      return null;
    }

    console.log('[Offscreen] Sending to Whisper:', audioBlob.size, 'bytes');

    const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');
    formData.append('language', language);

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Offscreen] Whisper API error:', errorText);
      return null;
    }

    const transcript = (await response.text()).trim();
    console.log('[Offscreen] Transcript:', transcript);
    return transcript.length ? transcript : null;
  } catch (error) {
    console.error('[Offscreen] Whisper transcription failed:', error);
    return null;
  }
}

/**
 * Create and start a new MediaRecorder instance
 */
function createMediaRecorder() {
  if (!mediaStream) return null;

  const recorder = new MediaRecorder(mediaStream, { mimeType });
  currentChunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      currentChunks.push(event.data);
      console.log('[Offscreen] Chunk received:', event.data.size, 'bytes');
    }
  };

  recorder.onstop = async () => {
    console.log('[Offscreen] Recorder stopped, chunks:', currentChunks.length);

    if (currentChunks.length === 0) return;

    // Create a complete WebM file from all chunks
    const audioBlob = new Blob(currentChunks, { type: 'audio/webm' });
    console.log('[Offscreen] Complete blob:', audioBlob.size, 'bytes');

    // Transcribe
    const transcript = await transcribeWithWhisper(audioBlob);

    if (transcript) {
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPT_UPDATE',
        target: 'background',
        data: {
          transcript,
          isFinal: true,
          timestamp: Date.now(),
        },
      });
    }
  };

  return recorder;
}

/**
 * Stop current recorder and start a new one (to get fresh WebM header)
 */
function restartRecorder() {
  if (!isRecording || !mediaStream) return;

  // Stop current recorder (triggers onstop which processes chunks)
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  // Start new recorder for next batch
  mediaRecorder = createMediaRecorder();
  if (mediaRecorder) {
    mediaRecorder.start();
    console.log('[Offscreen] New recorder started');
  }
}

/**
 * Start recording from tab
 */
async function startRecording(streamId, key, lang) {
  apiKey = key;
  language = lang?.split('-')[0] || 'en';

  console.log(
    '[Offscreen] API key configured:',
    apiKey ? 'Yes' : 'No',
    'Language:',
    language,
  );

  if (isRecording) {
    console.log('[Offscreen] Already recording');
    return;
  }

  try {
    console.log('[Offscreen] Starting recording with stream ID:', streamId);

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    console.log('[Offscreen] Got media stream');

    // Playback so user still hears the call
    audioElement = new Audio();
    audioElement.srcObject = mediaStream;
    audioElement.play().catch((e) => {
      console.log('[Offscreen] Audio playback autoplay blocked:', e.message);
    });

    // Pick supported mime type
    const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
    mimeType = '';
    for (const mt of candidates) {
      if (MediaRecorder.isTypeSupported(mt)) {
        mimeType = mt;
        break;
      }
    }
    if (!mimeType) throw new Error('No supported audio format for MediaRecorder');

    console.log('[Offscreen] Using MediaRecorder mimeType:', mimeType);

    isRecording = true;

    // Start first recorder
    mediaRecorder = createMediaRecorder();
    mediaRecorder.start();
    console.log('[Offscreen] MediaRecorder started');

    // Restart recorder every WHISPER_INTERVAL to get complete files
    recordingInterval = setInterval(restartRecorder, WHISPER_INTERVAL);

    chrome.runtime.sendMessage({
      type: 'TAB_RECORDING_STARTED',
      target: 'background',
    });

    console.log('[Offscreen] Recording started successfully');
  } catch (error) {
    console.error('[Offscreen] Failed to start recording:', error);
    throw error;
  }
}

/**
 * Stop recording
 */
async function stopRecording() {
  console.log('[Offscreen] Stopping recording...');

  isRecording = false;

  // Clear interval
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }

  // Stop recorder (will trigger final transcription)
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  mediaRecorder = null;

  // Small delay to allow final transcription to complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (audioElement) {
    audioElement.pause();
    audioElement.srcObject = null;
    audioElement = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  console.log('[Offscreen] Recording stopped');
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  console.log('[Offscreen] Received message:', message.type);

  if (message.type === 'START_RECORDING') {
    startRecording(
      message.data.streamId,
      message.data.apiKey,
      message.data.language,
    )
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

console.log('[Offscreen] Initialized');

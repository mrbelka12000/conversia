/**
 * Web Speech API wrapper for speech recognition
 * Note: Web Speech API only works with microphone input, not arbitrary audio streams
 */

export class SpeechRecognitionManager {
  constructor(options = {}) {
    this.options = {
      language: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      ...options,
    };

    this.recognition = null;
    this.isListening = false;
    this.onResult = null;
    this.onError = null;
    this.onEnd = null;
    this.onStart = null;
    this.autoRestart = true;
    this.restartTimeout = null;
  }

  /**
   * Check if Web Speech API is supported
   * @returns {boolean}
   */
  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Initialize the speech recognition instance
   */
  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Web Speech API is not supported in this browser');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.options.language;
    this.recognition.continuous = this.options.continuous;
    this.recognition.interimResults = this.options.interimResults;
    this.recognition.maxAlternatives = this.options.maxAlternatives;

    this.setupEventListeners();
  }

  /**
   * Set up event listeners for the recognition instance
   */
  setupEventListeners() {
    this.recognition.onstart = () => {
      this.isListening = true;
      console.log('[SpeechRecognition] Started listening');
      if (this.onStart) {
        this.onStart();
      }
    };

    this.recognition.onresult = (event) => {
      const results = event.results;
      const lastResult = results[results.length - 1];

      const transcript = lastResult[0].transcript;
      const isFinal = lastResult.isFinal;
      const confidence = lastResult[0].confidence;

      console.log(`[SpeechRecognition] ${isFinal ? 'Final' : 'Interim'}: "${transcript}" (${Math.round(confidence * 100)}%)`);

      if (this.onResult) {
        this.onResult({
          transcript,
          isFinal,
          confidence,
        });
      }
    };

    this.recognition.onerror = (event) => {
      console.error('[SpeechRecognition] Error:', event.error);

      // Don't restart on certain errors
      const fatalErrors = ['not-allowed', 'service-not-allowed', 'language-not-supported'];
      if (fatalErrors.includes(event.error)) {
        this.autoRestart = false;
      }

      if (this.onError) {
        this.onError(event.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      console.log('[SpeechRecognition] Stopped listening');

      if (this.onEnd) {
        this.onEnd();
      }

      // Auto-restart if needed
      if (this.autoRestart && this.shouldBeListening) {
        this.scheduleRestart();
      }
    };

    this.recognition.onspeechend = () => {
      console.log('[SpeechRecognition] Speech ended');
    };

    this.recognition.onnomatch = () => {
      console.log('[SpeechRecognition] No speech was recognized');
    };
  }

  /**
   * Schedule a restart of the recognition
   */
  scheduleRestart() {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    this.restartTimeout = setTimeout(() => {
      if (this.shouldBeListening && !this.isListening) {
        console.log('[SpeechRecognition] Auto-restarting...');
        this.recognition.start();
      }
    }, 100);
  }

  /**
   * Start speech recognition
   */
  start() {
    if (!this.recognition) {
      this.init();
    }

    this.shouldBeListening = true;
    this.autoRestart = true;

    if (!this.isListening) {
      try {
        this.recognition.start();
      } catch (error) {
        // May throw if already started
        console.warn('[SpeechRecognition] Start error:', error.message);
      }
    }
  }

  /**
   * Stop speech recognition
   */
  stop() {
    this.shouldBeListening = false;
    this.autoRestart = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  /**
   * Abort speech recognition immediately
   */
  abort() {
    this.shouldBeListening = false;
    this.autoRestart = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      this.recognition.abort();
    }
  }

  /**
   * Change the recognition language
   * @param {string} language - Language code (e.g., 'en-US', 'ru-RU')
   */
  setLanguage(language) {
    this.options.language = language;
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }

  /**
   * Get available languages (common ones)
   * @returns {Array<{code: string, name: string}>}
   */
  static getAvailableLanguages() {
    return [
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'ru-RU', name: 'Russian' },
      { code: 'es-ES', name: 'Spanish' },
      { code: 'fr-FR', name: 'French' },
      { code: 'de-DE', name: 'German' },
      { code: 'it-IT', name: 'Italian' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'ja-JP', name: 'Japanese' },
      { code: 'ko-KR', name: 'Korean' },
    ];
  }
}

export default SpeechRecognitionManager;

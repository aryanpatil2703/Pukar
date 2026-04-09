// ============================================
// Custom Error Classes
// ============================================

export class AppError extends Error {
  constructor(message, code, retryable = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();
  }
}

export class TelnyxApiError extends AppError {
  constructor(message, originalError = null) {
    super(message, 'TELNYX_API_ERROR', true);
    this.originalError = originalError;
    this.statusCode = originalError?.response?.status || null;
  }
}

export class SttError extends AppError {
  constructor(message, originalError = null) {
    super(message, 'STT_ERROR', true);
    this.originalError = originalError;
  }
}

export class IntentError extends AppError {
  constructor(message, originalError = null) {
    super(message, 'INTENT_ERROR', true);
    this.originalError = originalError;
  }
}

export class StateError extends AppError {
  constructor(message, currentState, attemptedState) {
    super(message, 'STATE_ERROR', false);
    this.currentState = currentState;
    this.attemptedState = attemptedState;
  }
}

export class ConfigError extends AppError {
  constructor(message) {
    super(message, 'CONFIG_ERROR', false);
  }
}

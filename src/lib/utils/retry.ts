/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryOn?: (error: Error) => boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
  retryOn: (error: Error) => {
    // Retry on network errors, timeouts, and server errors
    if (error.message.includes('timeout')) return true;
    if (error.message.includes('network')) return true;
    if (error.message.includes('ECONNRESET')) return true;
    if (error.message.includes('ENOTFOUND')) return true;
    if (error.message.includes('500')) return true;
    if (error.message.includes('502')) return true;
    if (error.message.includes('503')) return true;
    if (error.message.includes('504')) return true;
    return false;
  },
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  const delay = Math.min(exponentialDelay, options.maxDelay);

  if (options.jitter) {
    // Add random jitter (±25% of the delay)
    const jitterAmount = delay * 0.25;
    return delay + (Math.random() - 0.5) * 2 * jitterAmount;
  }

  return delay;
}

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: string
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await fn();

      if (attempt > 1) {
        console.log(`[Retry] ${context || 'Operation'} succeeded on attempt ${attempt}`);
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      if (!config.retryOn!(lastError)) {
        console.log(`[Retry] ${context || 'Operation'} failed with non-retryable error:`, lastError.message);
        throw lastError;
      }

      // If this is the last attempt, throw the error
      if (attempt === config.maxAttempts) {
        console.log(`[Retry] ${context || 'Operation'} failed after ${config.maxAttempts} attempts:`, lastError.message);
        throw lastError;
      }

      // Calculate delay and wait before retrying
      const delay = calculateDelay(attempt, config);
      console.log(`[Retry] ${context || 'Operation'} failed on attempt ${attempt}, retrying in ${Math.round(delay)}ms:`, lastError.message);

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retry configuration presets for different types of operations
 */
export const RETRY_PRESETS = {
  // Fast operations like API calls
  API_CALL: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryOptions,

  // Image generation operations (longer delays)
  IMAGE_GENERATION: {
    maxAttempts: 3,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryOn: (error: Error) => {
      // Retry on timeouts, network errors, and rate limiting
      if (error.message.includes('timeout')) return true;
      if (error.message.includes('network')) return true;
      if (error.message.includes('rate')) return true;
      if (error.message.includes('429')) return true;
      if (error.message.includes('500')) return true;
      if (error.message.includes('502')) return true;
      if (error.message.includes('503')) return true;
      if (error.message.includes('504')) return true;
      return false;
    },
  } as RetryOptions,

  // Printify operations (external service)
  PRINTIFY_OPERATION: {
    maxAttempts: 4,
    initialDelay: 1500,
    maxDelay: 20000,
    backoffMultiplier: 1.8,
    jitter: true,
    retryOn: (error: Error) => {
      // Retry on network errors, timeouts, and Printify server errors
      if (error.message.includes('timeout')) return true;
      if (error.message.includes('network')) return true;
      if (error.message.includes('ECONNRESET')) return true;
      if (error.message.includes('ENOTFOUND')) return true;
      if (error.message.includes('500')) return true;
      if (error.message.includes('502')) return true;
      if (error.message.includes('503')) return true;
      if (error.message.includes('504')) return true;
      // Don't retry on validation errors (4xx except 429)
      if (error.message.includes('400')) return false;
      if (error.message.includes('401')) return false;
      if (error.message.includes('403')) return false;
      if (error.message.includes('404')) return false;
      if (error.message.includes('422')) return false;
      // Retry on rate limiting
      if (error.message.includes('429')) return true;
      return false;
    },
  } as RetryOptions,

  // Overall workflow retry (fewer attempts, longer delays)
  WORKFLOW: {
    maxAttempts: 2,
    initialDelay: 5000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryOptions,
};
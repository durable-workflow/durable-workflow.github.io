'use strict';

const DEFAULT_LIVE_RESOURCE_ATTEMPTS = 3;
const DEFAULT_LIVE_RESOURCE_RETRY_DELAY_MS = 1000;
const TRANSIENT_REQUEST_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function retryableHttpStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function errorChain(error) {
  const errors = [];
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current)) {
    errors.push(current);
    seen.add(current);
    current = current.cause;
  }
  return errors;
}

function transientErrorCode(error) {
  return errorChain(error)
    .map(current => current?.code)
    .find(code => TRANSIENT_REQUEST_ERROR_CODES.has(code));
}

function isTransientResourceFailure(error) {
  if (retryableHttpStatus(Number(error?.status))) {
    return true;
  }
  if (transientErrorCode(error)) {
    return true;
  }
  return errorChain(error).some(current =>
    current?.name === 'AbortError' || current?.name === 'TimeoutError',
  );
}

function failureDescription(error) {
  if (Number.isInteger(Number(error?.status))) {
    return `HTTP ${Number(error.status)}`;
  }
  const code = transientErrorCode(error);
  if (code) {
    return `${code}: ${error.message}`;
  }
  return error?.message || String(error);
}

function transientHttpError(url, status) {
  const error = new Error(`${url} returned HTTP ${status}`);
  error.status = status;
  return error;
}

function exhaustedResourceError(error, url, attempts) {
  const finalFailure = failureDescription(error);
  const exhausted = new Error(
    `Live resource read failed after ${attempts} attempts for ${url}; ` +
      `final failure: ${finalFailure}`,
    {cause: error},
  );
  exhausted.attempts = attempts;
  exhausted.status = error?.status;
  exhausted.url = url;
  return exhausted;
}

async function retryTransientResourceRead(operation, options = {}) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_LIVE_RESOURCE_ATTEMPTS;
  const retryDelayMs =
    options.retryDelayMs ?? DEFAULT_LIVE_RESOURCE_RETRY_DELAY_MS;
  const url = options.url || options.label || '<unknown live resource>';
  const pause = options.wait || wait;
  const onRetry = options.onRetry || ((error, attempt) => {
    console.warn(
      `Transient live resource failure for ${url} ` +
        `(${failureDescription(error)}); retrying attempt ${attempt + 1} ` +
        `of ${maxAttempts}.`,
    );
  });

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(
      `Live resource maxAttempts must be a positive integer; got ${maxAttempts}`,
    );
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new Error(
      `Live resource retryDelayMs must be non-negative; got ${retryDelayMs}`,
    );
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation(attempt);
      if (retryableHttpStatus(Number(result?.status))) {
        throw transientHttpError(url, Number(result.status));
      }
      return result;
    } catch (error) {
      if (!isTransientResourceFailure(error)) {
        throw error;
      }
      if (attempt === maxAttempts) {
        throw exhaustedResourceError(error, url, attempt);
      }
      onRetry(error, attempt, maxAttempts);
      await pause(retryDelayMs * attempt);
    }
  }

  throw new Error('Live resource retry loop ended without a result');
}

module.exports = {
  DEFAULT_LIVE_RESOURCE_ATTEMPTS,
  DEFAULT_LIVE_RESOURCE_RETRY_DELAY_MS,
  isTransientResourceFailure,
  retryTransientResourceRead,
  retryableHttpStatus,
};

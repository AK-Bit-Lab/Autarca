/**
 * Safe JSON parsing with a typed fallback. Never throws — returns the fallback
 * if the input is empty, malformed, or doesn't match the validator.
 *
 * Used everywhere we parse LLM output, x402 proof payloads, or MCP responses,
 * so a malformed upstream response can never crash the agent pipeline.
 */
export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  validate?: (value: unknown) => value is T
): T {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate) {
      return validate(parsed) ? parsed : fallback;
    }
    return parsed as T;
  } catch {
    // Try to extract the first JSON object from a noisy LLM response
    // (e.g. "Here is the decision: { ... }. Hope that helps!").
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed: unknown = JSON.parse(match[0]);
        if (validate) {
          return validate(parsed) ? parsed : fallback;
        }
        return parsed as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

/**
 * Retry an async operation with exponential backoff and jitter.
 * Retries on any thrown error (network, timeout, 5xx surfaced as throws).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, err: Error, nextDelayMs: number) => void;
  } = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 8_000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const exp = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 250);
      const delay = exp + jitter;
      opts.onRetry?.(attempt + 1, err as Error, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Simple circuit breaker. After `threshold` consecutive failures, trips open
 * for `cooldownMs`, during which calls short-circuit and return the fallback.
 * Half-open: after cooldown, one trial call is allowed; success resets, failure
 * re-opens the circuit.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number
  ) {}

  async call<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    const now = Date.now();
    if (this.openUntil > now) return fallback;
    try {
      const result = await fn();
      this.failures = 0;
      this.openUntil = 0;
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openUntil = now + this.cooldownMs;
      }
      return fallback;
    }
  }

  isOpen(): boolean {
    return this.openUntil > Date.now();
  }
}

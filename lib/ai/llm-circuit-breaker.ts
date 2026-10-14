import { classifyLlmError, getRetryAfterMs, type LlmErrorKind } from "./llm-errors";

// Daily free-tier quota can report ~20h; re-probe at least hourly in case billing was enabled
const MAX_QUOTA_COOLDOWN_MS = 60 * 60_000;
const DEFAULT_QUOTA_COOLDOWN_MS = 60_000;
const UPSTREAM_COOLDOWN_MS = 30_000;

// Per model, per server instance (same trade-off as the in-memory rate limiter)
const openUntilByModel = new Map<string, number>();

/** True while calls to this model should be skipped instead of failing slowly. */
export function isCircuitOpen(model: string): boolean {
  const openUntil = openUntilByModel.get(model);
  if (openUntil === undefined) return false;
  if (Date.now() >= openUntil) {
    openUntilByModel.delete(model);
    return false;
  }
  return true;
}

/** Opens the circuit for quota / upstream failures; other errors leave it closed. */
export function recordLlmFailure(model: string, error: unknown): LlmErrorKind {
  const kind = classifyLlmError(error);
  let cooldownMs: number | null = null;

  if (kind === "quota") {
    cooldownMs = Math.min(getRetryAfterMs(error) ?? DEFAULT_QUOTA_COOLDOWN_MS, MAX_QUOTA_COOLDOWN_MS);
  } else if (kind === "upstream") {
    cooldownMs = UPSTREAM_COOLDOWN_MS;
  }

  if (cooldownMs !== null) openUntilByModel.set(model, Date.now() + cooldownMs);
  return kind;
}

/** Test hook. */
export function resetLlmCircuitBreaker(): void {
  openUntilByModel.clear();
}

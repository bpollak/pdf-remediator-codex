export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface RequestOutcome {
  status: number;
  code?: string;
  model?: string;
  attempts?: number;
  /** Per-model outcome; model names and HTTP statuses only. */
  failures?: Array<{ model: string; status?: number }>;
  usage?: TokenUsage;
  /** Short, static server-side diagnostic (e.g. which setting is missing). */
  detail?: string;
}

export interface RequestLog {
  reqId: string;
  finish(outcome: RequestOutcome): void;
}

/**
 * One JSON line per request outcome. Never pass document content, prompts,
 * images, model output, upstream response bodies or keys to this logger.
 */
export function startRequestLog(request: Request, route: string): RequestLog {
  const startedAt = Date.now();
  const reqId = request.headers.get('x-vercel-id')?.trim().slice(0, 128) || crypto.randomUUID();
  let finished = false;

  return {
    reqId,
    finish(outcome) {
      if (finished) return;
      finished = true;
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        reqId,
        route,
        ms: Date.now() - startedAt,
        ...outcome
      });
      if (outcome.status >= 500) console.error(line);
      else console.log(line);
    }
  };
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Token counts from an OpenAI-compatible `usage` object, if present. */
export function readTokenUsage(payload: unknown): TokenUsage | undefined {
  const usage = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).usage : undefined;
  if (!usage || typeof usage !== 'object') return undefined;
  const record = usage as Record<string, unknown>;
  const result: TokenUsage = {
    promptTokens: tokenCount(record.prompt_tokens),
    completionTokens: tokenCount(record.completion_tokens),
    totalTokens: tokenCount(record.total_tokens)
  };
  return Object.values(result).some((value) => value !== undefined) ? result : undefined;
}

/** Sums usage across several upstream calls (e.g. a retry with a larger budget). */
export function addTokenUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  const sum = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  return {
    promptTokens: sum(a.promptTokens, b.promptTokens),
    completionTokens: sum(a.completionTokens, b.completionTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens)
  };
}

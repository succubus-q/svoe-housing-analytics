import { setTimeout as delay } from 'node:timers/promises';

export type CbrEndpoint =
  | 'publications'
  | 'datasets'
  | 'measures'
  | 'years'
  | 'data'
  | 'datasetsEx'
  | 'dataEx'
  | 'DatasetDescription'
  | 'swagger';
export type Query = Record<string, string | number | undefined>;

export interface Attempt {
  endpoint: CbrEndpoint;
  query: Query;
  attempt: number;
  startedAt: string;
  durationMs: number;
  status: number | null;
  contentType: string | null;
  body: string | null;
  error: string | null;
}

export interface ClientOptions {
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  onAttempt?: (attempt: Attempt) => Promise<void>;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`ЦБ вернул HTTP ${status}`);
    this.status = status;
  }
}

export class CbrApiClient {
  private readonly options: ClientOptions;
  private readonly baseUrl: URL;

  constructor(options: ClientOptions) {
    this.options = options;
    this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    if (
      this.baseUrl.protocol !== 'https:' ||
      this.baseUrl.username ||
      this.baseUrl.password ||
      this.baseUrl.search ||
      this.baseUrl.hash
    ) {
      throw new Error('CBR_BASE_URL должен быть HTTPS URL без credentials, query и fragment');
    }
    if (
      !Number.isSafeInteger(options.timeoutMs) ||
      options.timeoutMs < 1 ||
      !Number.isSafeInteger(options.retries) ||
      options.retries < 0 ||
      options.retries > 5
    ) {
      throw new Error('Некорректные timeoutMs/retries');
    }
  }

  async get(endpoint: CbrEndpoint, query: Query = {}): Promise<unknown> {
    const url = new URL(endpoint, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const fetcher = this.options.fetch ?? globalThis.fetch;
    const sleep = this.options.sleep ?? delay;
    for (let attempt = 1; attempt <= this.options.retries + 1; attempt++) {
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const trace: Attempt = {
        endpoint,
        query,
        attempt,
        startedAt,
        durationMs: 0,
        status: null,
        contentType: null,
        body: null,
        error: null,
      };
      let failure: unknown;
      let retryable = false;
      let retryAfter: string | null = null;
      let result: unknown;
      try {
        // Timeout covers headers AND response body. Never log headers or env variables.
        const response = await fetcher(url, {
          signal: AbortSignal.timeout(this.options.timeoutMs),
          headers: { Accept: 'application/json' },
        });
        trace.status = response.status;
        trace.contentType = response.headers.get('content-type');
        retryAfter = response.headers.get('retry-after');
        trace.body = await response.text();
        if (!response.ok) throw new HttpError(response.status);
        // Some upstream errors are HTML with HTTP 200. Keep the body before failing.
        result = JSON.parse(trace.body) as unknown;
      } catch (error) {
        failure = error;
        trace.error =
          error instanceof HttpError
            ? error.message
            : error instanceof SyntaxError
              ? 'Ответ ЦБ не является JSON'
              : 'Сетевая ошибка или таймаут';
        retryable =
          error instanceof HttpError
            ? error.status === 408 || error.status === 429 || error.status >= 500
            : !(error instanceof SyntaxError);
      }
      trace.durationMs = Math.round(performance.now() - start);
      // Persist outside the retry block: a disk error must not produce extra HTTP calls.
      await this.options.onAttempt?.(trace);
      this.options.log?.(
        `GET /${endpoint} ${JSON.stringify(query)} attempt=${attempt} ` +
          `status=${trace.status ?? 'network-error'} ${trace.durationMs}ms`,
      );
      if (!failure) return result;
      if (!retryable || attempt > this.options.retries) {
        throw new Error(`${trace.error}; /${endpoint}; попыток: ${attempt}`, { cause: failure });
      }
      const parsedSeconds = retryAfter === null ? NaN : Number(retryAfter);
      const retryMs = Number.isFinite(parsedSeconds)
        ? parsedSeconds * 1000
        : retryAfter
          ? Date.parse(retryAfter) - Date.now()
          : 0;
      const backoff = Math.min(30_000, Math.max(500 * 2 ** (attempt - 1), retryMs || 0));
      await sleep(backoff);
    }
    throw new Error('Недостижимое состояние');
  }
}

function numberSetting(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} должен быть целым числом от ${min} до ${max}`);
  }
  return value;
}

function booleanSetting(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw !== 'true' && raw !== 'false') throw new Error(`${name}: допустимы true/false`);
  return raw === 'true';
}

export function loadConfig() {
  const regions = (process.env.CBR_REGIONS ?? '22,41,33,54').split(',').map(Number);
  if (!regions.length || regions.some((n) => !Number.isSafeInteger(n) || n < 1)) {
    throw new Error('CBR_REGIONS: ожидается список ID разрезов через запятую');
  }
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: numberSetting('PORT', 3001, 1, 65535),
    cbrBaseUrl: process.env.CBR_BASE_URL ?? 'https://www.cbr.ru/dataservice/',
    timeoutMs: numberSetting('CBR_TIMEOUT_MS', 20000, 100, 120000),
    retries: numberSetting('CBR_RETRIES', 2, 0, 5),
    regionIds: [...new Set(regions)],
    fromYear: numberSetting('CBR_FROM_YEAR', 2025, 1900, 2200),
    syncEnabled: booleanSetting('SYNC_ENABLED', true),
    syncOnStart: booleanSetting('SYNC_ON_START', false),
    syncHour: numberSetting('SYNC_UTC_HOUR', 5, 0, 23),
  };
}
export type Config = ReturnType<typeof loadConfig>;

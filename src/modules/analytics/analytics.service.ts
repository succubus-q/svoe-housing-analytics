export function percentageChange(current: number | null, previous: number | null): number | null {
  if (
    current === null ||
    previous === null ||
    previous === 0 ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  )
    return null;
  return ((current - previous) / previous) * 100;
}

export function averageLoanSize(volumeRubles: number | null, count: number | null): number | null {
  if (
    volumeRubles === null ||
    count === null ||
    count <= 0 ||
    volumeRubles < 0 ||
    !Number.isFinite(volumeRubles) ||
    !Number.isFinite(count)
  )
    return null;
  return volumeRubles / count;
}

export function monthDate(period: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Некорректный месяц');
  return new Date(`${period}-01T00:00:00.000Z`);
}

export function shiftMonth(period: string, shift: number): string {
  const date = monthDate(period);
  date.setUTCMonth(date.getUTCMonth() + shift);
  return date.toISOString().slice(0, 7);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageLoanSize,
  percentageChange,
  shiftMonth,
} from '../src/modules/analytics/analytics.service.ts';

test('MoM/YoY: relative changes, missing comparison and zero denominator', () => {
  assert.equal(percentageChange(120, 100), 20);
  assert.equal(percentageChange(80, 100), -20);
  assert.equal(percentageChange(0, 100), -100);
  assert.equal(percentageChange(100, 0), null);
  assert.equal(percentageChange(null, 100), null);
  assert.equal(percentageChange(100, null), null);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-08', -12), '2025-08');
});

test('average loan uses volume already normalized to rubles', () => {
  assert.equal(averageLoanSize(500_000_000, 100), 5_000_000);
  assert.equal(averageLoanSize(100, 0), null);
  assert.equal(averageLoanSize(null, 10), null);
  assert.equal(averageLoanSize(Infinity, 10), null);
});

// spec §4.10 — DormancyDeclaration check: max per rolling window, cooldown, overlap
// spec §2.4 — rolling-window convention: a W-epoch window ending at t is { e | t - W < e <= t }
import { resolve } from "./params.js";

export interface DormancyPeriod {
  start: number;
  end: number;
}

function param(name: string): number {
  return resolve(name).value;
}

function validate(period: DormancyPeriod, label: string): void {
  const { start, end } = period;
  if (!Number.isInteger(start) || !Number.isInteger(end))
    throw new RangeError(`${label} bounds must be integers`);
  if (start < 0 || end < 0)
    throw new RangeError(`${label} bounds must be non-negative`);
  if (end <= start) throw new RangeError(`${label} must have end > start`);
}

// Merge half-open periods (start <= e < end) into disjoint, sorted intervals.
function mergeIntervals(periods: readonly DormancyPeriod[]): DormancyPeriod[] {
  const sorted = [...periods].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: DormancyPeriod[] = [];
  for (const p of sorted) {
    const last = merged[merged.length - 1];
    if (last && p.start <= last.end) {
      if (p.end > last.end) last.end = p.end;
    } else {
      merged.push({ start: p.start, end: p.end });
    }
  }
  return merged;
}

// Distinct dormant epochs of the union inside the W-epoch window ending at t.
function coverageAt(
  intervals: readonly DormancyPeriod[],
  t: number,
  window: number,
): number {
  const lo = t - window + 1;
  let count = 0;
  for (const { start, end } of intervals) {
    const a = Math.max(start, lo);
    const b = Math.min(end - 1, t);
    if (b >= a) count += b - a + 1;
  }
  return count;
}

// Only a window containing a proposed epoch can newly exceed the cap, so t ranges
// over [proposed.start, proposed.end - 1 + (window - 1)]. coverage(t) is piecewise
// linear in t; its maximum on that range is attained at a breakpoint or an endpoint.
function exceedsMax(
  intervals: readonly DormancyPeriod[],
  proposed: DormancyPeriod,
  window: number,
  maxDays: number,
): boolean {
  const t0 = proposed.start;
  const t1 = proposed.end - 1 + (window - 1);
  const candidates = new Set<number>([t0, t1]);
  for (const { start, end } of intervals) {
    for (const c of [
      start - 1,
      start,
      start + window - 1,
      start + window,
      end - 1,
      end,
      end + window - 1,
      end + window,
    ]) {
      if (c >= t0 && c <= t1) candidates.add(c);
    }
  }
  for (const t of candidates) {
    if (coverageAt(intervals, t, window) > maxDays) return true;
  }
  return false;
}

// spec §4.10, §2.4
export function dormancyFailures(
  history: readonly DormancyPeriod[],
  proposed: DormancyPeriod,
): string[] {
  for (const h of history) validate(h, "history period");
  validate(proposed, "proposed period");

  const cooldown = param("DORMANCY_COOLDOWN");
  const window = param("DORMANCY_ROLLING_WINDOW");
  const maxDays = param("DORMANCY_MAX_DAYS");

  const failures: string[] = [];

  if (history.some((h) => h.end > proposed.start)) failures.push("overlap");

  if (history.length > 0) {
    const latestEnd = Math.max(...history.map((h) => h.end));
    if (proposed.start - latestEnd < cooldown) failures.push("cooldown");
  }

  const intervals = mergeIntervals([...history, proposed]);
  if (exceedsMax(intervals, proposed, window, maxDays)) failures.push("max");

  return failures;
}

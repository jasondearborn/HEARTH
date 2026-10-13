// spec §6.2 — contested complaint pairs: symmetric retaliation discount evaluation
import { resolve } from "./params.js";

type ComplaintRecord = {
  readonly hash: string;
  readonly complainant: string;
  readonly target: string;
  readonly epoch: number;
};

const HASH = /^[0-9a-f]{64}$/;

const direction = (complainant: string, target: string): string =>
  complainant + "\u0000" + target;

// spec §6.2
// Record hashes of every complaint contested at epoch t. A complaint A→B is contested iff an
// existing (epoch ≤ t) complaint B→A lies within RETALIATION_WINDOW epochs; the flag is symmetric
// and never lapses as t grows. The result is independent of input order.
export function contestedAt(
  complaints: readonly ComplaintRecord[],
  t: number,
): Set<string> {
  const window = resolve("RETALIATION_WINDOW").value;

  const seen = new Set<string>();
  for (const c of complaints) {
    if (!HASH.test(c.hash))
      throw new RangeError(`invalid complaint hash: ${c.hash}`);
    if (seen.has(c.hash))
      throw new RangeError(`duplicate complaint hash: ${c.hash}`);
    seen.add(c.hash);
    if (!Number.isInteger(c.epoch) || c.epoch < 0)
      throw new RangeError(`epoch must be a non-negative integer: ${c.epoch}`);
  }

  const existing = complaints.filter((c) => c.epoch <= t);

  const byDirection = new Map<string, ComplaintRecord[]>();
  for (const c of existing) {
    const key = direction(c.complainant, c.target);
    const bucket = byDirection.get(key);
    if (bucket) bucket.push(c);
    else byDirection.set(key, [c]);
  }

  const contested = new Set<string>();
  for (const c of existing) {
    const opposite = byDirection.get(direction(c.target, c.complainant));
    if (!opposite) continue;
    for (const y of opposite) {
      if (y === c) continue;
      if (Math.abs(c.epoch - y.epoch) < window) {
        contested.add(c.hash);
        break;
      }
    }
  }
  return contested;
}

// spec §6.4 — adjudication state machine: case identity, CASE_WINDOW, case evaluation; §6.3 conviction gate
import { resolve } from "./params.js";

export interface AdjudicationInput {
  complaints: readonly {
    hash: string;
    complainant: string;
    target: string;
    epoch: number;
  }[];
  t: number;
  quorumAt: (openedEpoch: number) => number;
  eligible: (member: string, epoch: number) => boolean;
  contested: (hash: string, epoch: number) => boolean;
}

export type CaseStatus = "pending" | "convicted" | "dismissed";

export interface Case {
  target: string;
  openedEpoch: number;
  status: CaseStatus;
  closedEpoch: number | null;
  complaints: string[];
  counted: string[];
}

type Complaint = {
  hash: string;
  complainant: string;
  target: string;
  epoch: number;
};

const HEX64 = /^[0-9a-f]{64}$/;

const byEpochHash = (a: Complaint, b: Complaint): number =>
  a.epoch - b.epoch || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);

// Distinct, eligible, non-contested complainants in `joined` as of epoch `e` (§6.3).
function countAt(
  joined: readonly Complaint[],
  e: number,
  input: AdjudicationInput,
): string[] {
  const set = new Set<string>();
  for (const rec of joined) {
    if (rec.epoch > e) continue;
    if (!input.eligible(rec.complainant, e)) continue;
    if (input.contested(rec.hash, e)) continue;
    set.add(rec.complainant);
  }
  return [...set].sort();
}

export function adjudicate(input: AdjudicationInput): Case[] {
  const { complaints, t } = input;
  const window = resolve("CASE_WINDOW").value;

  const seen = new Set<string>();
  for (const rec of complaints) {
    if (!HEX64.test(rec.hash))
      throw new RangeError(`hash must be 64 lowercase hex chars: ${rec.hash}`);
    if (seen.has(rec.hash))
      throw new RangeError(`duplicate complaint hash: ${rec.hash}`);
    seen.add(rec.hash);
    if (!Number.isInteger(rec.epoch) || rec.epoch < 0)
      throw new RangeError(`epoch must be a non-negative integer: ${rec.epoch}`);
  }

  const byTarget = new Map<string, Complaint[]>();
  for (const rec of complaints) {
    if (rec.epoch > t) continue;
    let list = byTarget.get(rec.target);
    if (!list) {
      list = [];
      byTarget.set(rec.target, list);
    }
    list.push(rec);
  }

  const out: Case[] = [];
  for (const [target, list] of byTarget) {
    list.sort(byEpochHash);
    let i = 0;
    while (i < list.length) {
      const o = list[i]!.epoch;
      const quorum = input.quorumAt(o);
      const joined: Complaint[] = [];
      let convictedEpoch: number | null = null;

      const evalEnd = Math.min(t, o + window - 1);
      for (let e = o; e <= evalEnd; e++) {
        while (i < list.length && list[i]!.epoch === e) {
          joined.push(list[i]!);
          i++;
        }
        const counted = countAt(joined, e, input);
        if (counted.length >= quorum) {
          convictedEpoch = e;
          break;
        }
      }

      if (convictedEpoch !== null) {
        out.push({
          target,
          openedEpoch: o,
          status: "convicted",
          closedEpoch: convictedEpoch,
          complaints: joined.map((r) => r.hash),
          counted: countAt(joined, convictedEpoch, input),
        });
      } else if (t >= o + window) {
        out.push({
          target,
          openedEpoch: o,
          status: "dismissed",
          closedEpoch: o + window,
          complaints: joined.map((r) => r.hash),
          counted: countAt(joined, o + window - 1, input),
        });
      } else {
        out.push({
          target,
          openedEpoch: o,
          status: "pending",
          closedEpoch: null,
          complaints: joined.map((r) => r.hash),
          counted: countAt(joined, t, input),
        });
      }
    }
  }

  out.sort(
    (a, b) =>
      a.openedEpoch - b.openedEpoch ||
      (a.target < b.target ? -1 : a.target > b.target ? 1 : 0),
  );
  return out;
}

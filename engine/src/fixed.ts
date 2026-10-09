// spec §13.6, §5.1 — fixed-point reputation arithmetic
export type Fp = bigint;

// spec App. D: REP_SCALE
export const REP_SCALE: bigint = 1_000_000n;

export const LAMBDA: bigint = 992_328n; // spec §5.3, §13.6

export function roundDiv(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError("Division by zero");
  // Work with the exact rational n/d: make d positive, round |n|/d, restore sign.
  let num = n;
  let den = d;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const negative = num < 0n;
  const a = negative ? -num : num;
  let q = a / den;
  const r = a % den;
  // Round to nearest; on an exact tie (2r === den) round to even.
  if (2n * r > den || (2n * r === den && q % 2n === 1n)) {
    q += 1n;
  }
  return negative ? -q : q;
}

export function mul(a: bigint, b: bigint): bigint {
  return roundDiv(a * b, REP_SCALE);
}

export function div(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError("Division by zero");
  return roundDiv(a * REP_SCALE, b);
}

export function fromDecimal(s: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!match) throw new RangeError(`Invalid decimal string: ${s}`);
  const sign = match[1] ?? "";
  const integer = match[2] ?? "0";
  const fractional = match[3] ?? "";
  const magnitude =
    BigInt(integer) * REP_SCALE + BigInt(fractional.padEnd(6, "0"));
  return sign === "-" ? -magnitude : magnitude;
}

export function pow(base: bigint, k: number): bigint {
  if (!Number.isInteger(k) || k < 0)
    throw new RangeError("Exponent must be a non-negative integer");
  let acc = REP_SCALE;
  for (let i = 0; i < k; i++) {
    acc = mul(acc, base);
  }
  return acc;
}

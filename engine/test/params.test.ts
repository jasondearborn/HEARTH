// Appendix D transcription. spec App. D
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS, resolve, type Unit } from '../src/params.js';
import { fromDecimal } from '../src/fixed.js';

// dist/test/params.test.js -> repo root
const SPEC = readFileSync(new URL('../../../HEARTH-protocol-spec-v5.md', import.meta.url), 'utf8');
const PARAMS_SRC = readFileSync(new URL('../../src/params.ts', import.meta.url), 'utf8');

interface Row { names: string[]; dflt: string; status: string; evidence: string; section: string }

function appendixD(): Row[] {
  const start = SPEC.indexOf('## Appendix D');
  const end = SPEC.indexOf('\n## ', start + 1);
  assert.ok(start >= 0 && end > start, 'Appendix D not found');
  const rows: Row[] = [];
  for (const line of SPEC.slice(start, end).split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| Parameter') || line.startsWith('|---')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 5, `bad Appendix D row: ${line}`);
    const [nameCell, dflt, status, evidence, section] = cells as [string, string, string, string, string];
    const ticks = [...nameCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    rows.push({ names: ticks.length ? ticks : [nameCell], dflt, status, evidence, section });
  }
  return rows;
}

const ROWS = appendixD();
const stripParens = (s: string) => s.replace(/\([^)]*\)/g, '').trim();
const normStatus = (s: string) => (s === '—' ? 'retired' : stripParens(s));
const UNIT_WORDS: Record<string, Unit> = {
  epochs: 'epochs', epoch: 'epochs', days: 'days', h: 'hours', minutes: 'minutes',
  hops: 'hops', 'active members': 'count',
};

test('Appendix D parses to the expected number of rows', () => {
  assert.equal(ROWS.length, 84);
});

test('every Appendix D name is in PARAMS and vice versa', () => {
  const specNames = ROWS.flatMap((r) => r.names);
  assert.deepEqual([...Object.keys(PARAMS)].sort(), [...specNames].sort());
});

test('status, evidence and section are transcribed verbatim', () => {
  for (const row of ROWS) {
    for (const name of row.names) {
      const p = PARAMS[name];
      assert.ok(p, name);
      assert.equal(p.name, name);
      assert.equal(p.status, normStatus(row.status), `${name} status`);
      assert.equal(p.evidence, row.evidence, `${name} evidence`);
      assert.equal(p.section, row.section, `${name} section`);
    }
  }
});

test('plain numeric defaults match value and unit', () => {
  let checked = 0;
  for (const row of ROWS) {
    const d = stripParens(row.dflt);
    if (/[`×]/.test(d)) continue;
    const m = /^(\d+(?:\.\d+)?)(?:\s+(.+))?$/.exec(d);
    if (!m) continue;
    const unitWord = m[2];
    if (unitWord !== undefined && !(unitWord in UNIT_WORDS)) continue;
    for (const name of row.names) {
      const r = resolve(name);
      assert.equal(r.value, Number(m[1]), `${name} value`);
      if (unitWord !== undefined) assert.equal(r.unit, UNIT_WORDS[unitWord], `${name} unit`);
      checked++;
    }
  }
  assert.ok(checked >= 40, `only ${checked} rows checked`);
});

test('defaults that need reading by hand', () => {
  const cases: Array<[string, number, Unit]> = [
    ['B_VOUCH', 2, 'count'],
    ['KIN_STAKE_MULT', 1.5, 'multiplier'],
    ['BASE_UNIT', 0.08, 'ratio'],
    ['LINKAGE_HALF_LIFE', 90, 'days'],
    ['DISPUTE_HALFLIFE', 90, 'days'],
    ['BEACON_RETRACT_PENALTY', 0.25, 'ratio'],
    ['SPARK_EXPIRY_HORIZON', 2, 'epochs'],
    ['COMPLAINT_RATE_LIMIT', 1, 'count'],
    ['MLS_SEQUENCER_ROTATION_PERIOD', 1, 'epochs'],
    ['MLS_FAIRNESS_MULTIPLE', 3, 'multiplier'],
    ['SYNC_CHECKPOINT_WINDOW_K', 30, 'count'],
    ['REP_SCALE', 1_000_000, 'scale'],
    ['tier_multiplier(Member)', 1.0, 'multiplier'],
    ['tier_multiplier(Trusted)', 1.5, 'multiplier'],
    ['tier_multiplier(Steward-eligible)', 2.0, 'multiplier'],
    ['PROXIMITY_MULTIPLIER', 1.0, 'multiplier'],
    ['REMOTE_MULTIPLIER', 0.4, 'multiplier'],
    ['TIER_MEMBER', 0.1, 'ratio'],
    ['TIER_STEWARD_ELIGIBLE', 0.75, 'ratio'],
    ['P_dir', 0.25, 'ratio'],
    ['g', 0.35, 'ratio'],
  ];
  for (const [name, value, unit] of cases) {
    assert.deepEqual(resolve(name), { value, unit }, name);
  }
  const srf = resolve('SELF_RETRACT_FACTOR');
  assert.ok(Math.abs(srf.value - 0.1) < 1e-12, 'SELF_RETRACT_FACTOR = 0.4 x 0.25');
  assert.equal(srf.unit, 'ratio');
});

test('reused parameters are references, not re-literalized constants (App. D consistency note)', () => {
  const refs: Array<[string, string]> = [
    ['LINKAGE_HALF_LIFE', 'H'],
    ['DISPUTE_HALFLIFE', 'H'],
    ['BEACON_RETRACT_PENALTY', 'P_dir'],
    ['SELF_RETRACT_FACTOR', 'BEACON_RETRACT_PENALTY'],
    ['SPARK_EXPIRY_HORIZON', 'NULLIFIER_RETENTION_EPOCHS'],
  ];
  for (const [name, target] of refs) {
    const v = PARAMS[name]!.value;
    assert.equal(v.kind, 'ref', name);
    if (v.kind === 'ref') assert.equal(v.ref, target, name);
  }
  for (const p of Object.values(PARAMS)) {
    if (p.value.kind === 'ref') assert.ok(PARAMS[p.value.ref], `${p.name} -> ${p.value.ref}`);
  }
});

test('lists, unset, text and retired kinds', () => {
  assert.deepEqual(PARAMS['BEACON_RETRACT_ESCALATION_MULT']!.value,
    { kind: 'list', values: [1.0, 1.5, 2.0], unit: 'multiplier' });
  assert.deepEqual(PARAMS['RELAY_FRACTION_PLANNING']!.value,
    { kind: 'list', values: [0.1, 0.3], unit: 'ratio' });
  for (const n of ['B_E(Member)', 'B_E(Trusted)', 'B_E(Steward-eligible)', 'α',
    'APPEAL_DELIBERATION_WINDOW', 'MAILBOX_MAX_BYTES', 'MAILBOX_MAX_ENTRIES', 'RELAY_BUDGET_BY_TIER']) {
    assert.deepEqual(PARAMS[n]!.value, { kind: 'unset' }, n);
    assert.throws(() => resolve(n), Error, n);
  }
  assert.deepEqual(PARAMS['δ']!.value, { kind: 'retired' });
  assert.equal(PARAMS['δ']!.status, 'retired');
  assert.throws(() => resolve('δ'), Error);
  assert.deepEqual(PARAMS['Spark budget curve shape']!.value, { kind: 'text', text: 'linear-above-gate' });
  assert.throws(() => resolve('NO_SUCH_PARAM'), Error);
});

test('every numeric value converts exactly to fixed point (§13.6 rule 3)', () => {
  for (const p of Object.values(PARAMS)) {
    const v = p.value;
    const nums = v.kind === 'number' ? [v.value] : v.kind === 'list' ? v.values
      : v.kind === 'ref' ? [v.factor] : [];
    for (const x of nums) assert.doesNotThrow(() => fromDecimal(String(x)), `${p.name}: ${x}`);
  }
});

test('PARAMS is deeply frozen', () => {
  assert.ok(Object.isFrozen(PARAMS));
  for (const p of Object.values(PARAMS)) {
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.value), p.name);
    if (p.value.kind === 'list') assert.ok(Object.isFrozen(p.value.values), p.name);
  }
});

test('each entry carries its // spec App. D: <name> tag', () => {
  for (const name of Object.keys(PARAMS)) {
    assert.ok(PARAMS_SRC.includes(`// spec App. D: ${name}\n`), name);
  }
});

// Tests for the spec-traceability check (BACKLOG Next #1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTrace } from './check-trace.mjs';

const FIXTURE_SPEC = [
  '# Spec',
  '## 5. Reputation engine',
  '### 5.2 Ember issuance mechanics',
  '**5.2.2 Per-pair diminishing weight.** Repeat Embers...',
  '### 5.3 Decay',
  '## 13. Conformance',
  '### 13.6 Reputation arithmetic (all roles)',
  '## Appendix A — Member-level simulation evidence',
  '### A.10 Ember issuance mechanics (S8) — added 2026-10-07',
  '## Appendix D — Parameter table',
  '| Parameter | Default | Status | Evidence | Defined in § |',
  '|---|---|---|---|---|',
  '| `H` | 90 days | sim-backed | Appendix A.1 | §5.3 |',
  '| `B_E(Member)` / `B_E(Trusted)` | per-tier | provisional | none | §5.2.1 |',
  '| Spark budget curve shape | linear-above-gate | sim-backed | Appendix A.7 (S3) | §7.6 |',
  '## Appendix E — Version history',
  '| `NOT_A_PARAM` | 1 | provisional | none | §1 |',
  '',
].join('\n');

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'trace-'));
  writeFileSync(join(dir, 'spec.md'), FIXTURE_SPEC);
  mkdirSync(join(dir, 'src', 'sub'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'src', name), text);
  return { specPath: join(dir, 'spec.md'), roots: [join(dir, 'src')] };
}

test('valid tags of every form pass', () => {
  const opts = fixture({
    'a.ts': [
      '// spec §5.2.2',
      'const x = 1; // spec §5.2, §13.6',
      '// spec §5',
      '// spec App. D: H',
      '// spec App. D: B_E(Trusted)',
      '// spec App. D: Spark budget curve shape',
      '// spec App. A.10',
      '// spec App. D',
      '// spec §5.3, spec App. A',
      'const notATag = "spec §99";',
    ].join('\n'),
    'sub/b.mjs': '// spec §5.3\n',
  });
  const { errors, tags } = checkTrace(opts);
  assert.deepEqual(errors, []);
  assert.equal(tags, 10);
});

test('unknown sections, appendices and parameter names are reported with file:line', () => {
  const opts = fixture({
    'bad.ts': [
      'ok(); // spec §5.2',
      '// spec §5.9',
      '// spec App. D: NOPE',
      '// spec App. Q',
      '// spec App. A.11',
      '// spec App. D: NOT_A_PARAM',
      '// spec §5.2, §7.7',
    ].join('\n'),
  });
  const { errors } = checkTrace(opts);
  assert.equal(errors.length, 6, errors.join('\n'));
  assert.match(errors[0], /bad\.ts:2\b.*§5\.9/);
  assert.match(errors[1], /bad\.ts:3\b.*NOPE/);
  assert.match(errors[2], /bad\.ts:4\b.*App\. Q/);
  assert.match(errors[3], /bad\.ts:5\b.*A\.11/);
  assert.match(errors[4], /bad\.ts:6\b.*NOT_A_PARAM/);
  assert.match(errors[5], /bad\.ts:7\b.*§7\.7/);
});

test('a spec tag with no recognisable reference is malformed', () => {
  const { errors } = checkTrace(fixture({ 'm.ts': '// spec somewhere\n' }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /m\.ts:1\b.*malformed/);
});

test('only .ts and .mjs/.js files are scanned, node_modules and dist skipped', () => {
  const opts = fixture({ 'notes.md': '// spec §5.9\n' });
  mkdirSync(join(opts.roots[0], 'node_modules'), { recursive: true });
  writeFileSync(join(opts.roots[0], 'node_modules', 'x.ts'), '// spec §5.9\n');
  mkdirSync(join(opts.roots[0], 'dist'), { recursive: true });
  writeFileSync(join(opts.roots[0], 'dist', 'x.js'), '// spec §5.9\n');
  assert.deepEqual(checkTrace(opts).errors, []);
});

test('the real engine traces cleanly against the v5 spec', () => {
  const engine = fileURLToPath(new URL('..', import.meta.url));
  const { errors, tags } = checkTrace({
    specPath: join(engine, '..', 'HEARTH-protocol-spec-v5.md'),
    roots: [join(engine, 'src'), join(engine, 'test'), join(engine, 'scripts')],
  });
  assert.deepEqual(errors, []);
  assert.ok(tags >= 86, `only ${tags} tags`);
});

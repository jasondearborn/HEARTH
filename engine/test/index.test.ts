// spec §13.6 — package entry point: one import for the game and other clients
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as engine from '../src/index.js';
import * as fixed from '../src/fixed.js';
import * as params from '../src/params.js';
import * as embers from '../src/embers.js';
import * as independence from '../src/independence.js';
import * as ledger from '../src/ledger.js';
import * as penalty from '../src/penalty.js';
import * as aggregate from '../src/aggregate.js';
import * as connectivity from '../src/connectivity.js';
import * as admission from '../src/admission.js';
import * as quorum from '../src/quorum.js';
import * as bridge from '../src/bridge.js';
import * as dormancy from '../src/dormancy.js';
import * as complaint from '../src/complaint.js';
import * as contested from '../src/contested.js';
import * as caseModule from '../src/case.js';
import * as standing from '../src/standing.js';

test('index re-exports every module export, unchanged', () => {
  for (const mod of [fixed, params, embers, independence, ledger, penalty, aggregate, connectivity, admission, quorum, bridge, dormancy, complaint, contested, caseModule, standing]) {
    for (const [name, value] of Object.entries(mod)) {
      assert.equal((engine as Record<string, unknown>)[name], value, name);
    }
  }
  const all = new Set([fixed, params, embers, independence, ledger, penalty, aggregate, connectivity, admission, quorum, bridge, dormancy, complaint, contested, caseModule, standing].flatMap((m) => Object.keys(m)));
  assert.deepEqual(Object.keys(engine).sort(), [...all].sort());
});

test('package.json main and types point at built files', () => {
  // compiled to dist/test/, so the package root is two levels up
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8')) as { main: string; types: string };
  assert.ok(existsSync(root + pkg.main), pkg.main);
  assert.ok(existsSync(root + pkg.types), pkg.types);
});

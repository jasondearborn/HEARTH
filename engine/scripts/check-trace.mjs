// Checks that every spec-traceability tag in the engine points at a real spec section,
// appendix or Appendix D parameter.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TAG = /(?:^|[\s;){}])\/\/ spec\b(.*)$/;
const EXTENSIONS = ['.ts', '.mjs', '.js'];
const SKIPPED_DIRS = ['node_modules', 'dist'];

// Collect known section ids, appendix ids and Appendix D parameter names from the spec.
function parseSpec(specPath) {
  const sections = new Set();
  const appendices = new Set();
  const params = new Set();
  let inAppendixD = false;
  for (const line of readFileSync(specPath, 'utf8').split('\n')) {
    let m;
    if ((m = line.match(/^#{1,6} (\d+(?:\.\d+)*)\.?\s/))) sections.add(m[1]);
    if ((m = line.match(/^\*\*(\d+(?:\.\d+)+)\.?\s/))) sections.add(m[1]);
    if ((m = line.match(/^## Appendix ([A-Z])\b/))) appendices.add(m[1]);
    if ((m = line.match(/^#{3,4} ([A-Z]\.\d+(?:\.\d+)*)\s/))) appendices.add(m[1]);

    if (line.startsWith('## ')) inAppendixD = /^## Appendix D\b/.test(line);
    else if (inAppendixD && line.startsWith('| ') && !line.startsWith('| Parameter')) {
      const cell = line.split('|')[1].trim();
      const quoted = [...cell.matchAll(/`([^`]+)`/g)].map((q) => q[1]);
      for (const name of quoted.length ? quoted : [cell]) params.add(name);
    }
  }
  return { sections, appendices, params };
}

// Yield every .ts/.mjs/.js file under dir, in sorted order.
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.includes(entry.name)) yield* walk(full);
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}

// Return the problems with one tag's text (what follows the marker), as messages.
function checkTag(rest, known) {
  const param = rest.match(/^App\. D: (.+)$/);
  if (param) {
    const name = param[1].trim();
    return known.params.has(name) ? [] : [`unknown parameter App. D: ${name}`];
  }
  const problems = [];
  const sections = [...rest.matchAll(/§(\d+(?:\.\d+)*)/g)].map((m) => m[1]);
  const appendices = [...rest.matchAll(/App\. ([A-Z](?:\.\d+)*)/g)].map((m) => m[1]);
  for (const id of sections) if (!known.sections.has(id)) problems.push(`unknown section §${id}`);
  for (const id of appendices) if (!known.appendices.has(id)) problems.push(`unknown appendix App. ${id}`);
  if (!sections.length && !appendices.length) problems.push('malformed spec tag');
  return problems;
}

export function checkTrace({ specPath, roots }) {
  const known = parseSpec(specPath);
  const errors = [];
  let tags = 0;
  for (const root of roots) {
    for (const file of walk(root)) {
      const where = relative(process.cwd(), file);
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(TAG);
        if (!m) return;
        tags++;
        for (const message of checkTag(m[1].trim(), known)) errors.push(`${where}:${i + 1}: ${message}`);
      });
    }
  }
  return { errors, tags };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const engine = fileURLToPath(new URL('..', import.meta.url));
  const { errors, tags } = checkTrace({
    specPath: join(engine, '..', 'HEARTH-protocol-spec-v5.md'),
    roots: ['src', 'test', 'scripts'].map((d) => join(engine, d)),
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`spec trace ok: ${tags} tags`);
}

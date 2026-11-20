import {readFile, writeFile} from 'node:fs/promises';
import {replayFetch, reviewDrift} from '../src/drift.js';
import {fixtureNames, runFixture} from '../src/drift-fixtures.js';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : '';
const fixtureFlag = args.indexOf('--fixture');
const positional = args.find(arg => !arg.startsWith('--') && arg !== out);

function help() {
  console.log(`Usage:
  node scripts/drift.mjs --demo [--replay] [--out file]
  node scripts/drift.mjs --fixture <name> [--out file]
  node scripts/drift.mjs <audit-or-review.json> [--replay] [--out file]

Fixtures: ${fixtureNames.join(', ')}
Public reads are HTTPS GET requests to api.github.com and raw.githubusercontent.com.
The command sends no token, signature, transaction, or deployment.`);
}

if (args.includes('--help') || args.length === 0) {
  help();
  process.exit(args.includes('--help') ? 0 : 1);
}
if (outIndex >= 0 && !out) throw new Error('--out needs a file path.');

let report;
if (fixtureFlag >= 0) {
  report = (await runFixture(args[fixtureFlag + 1] || '')).report;
} else if (args.includes('--demo') || positional) {
  const file = args.includes('--demo') ? new URL('../public/evidence/demo.json', import.meta.url) : positional;
  const input = JSON.parse(await readFile(file, 'utf8'));
  const review = input.reviews?.[0] || input.review || input;
  const replay = args.includes('--replay');
  report = await reviewDrift(review, {
    fetchImpl: replay ? replayFetch(review) : undefined,
    mode: replay ? 'replay' : 'live-public-read',
    synthetic: false,
    observedAt: replay ? '2026-01-01T00:00:00.000Z' : undefined,
  });
} else {
  help();
  process.exit(1);
}

const text = `${JSON.stringify(report, null, 2)}\n`;
if (out) await writeFile(out, text);
process.stdout.write(text);

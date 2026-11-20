import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {canonical, createAudit, sha256} from '../src/audit.js';
import {
  BOUNDARIES, DRIFT_LIMITS, canonicalRawUrl, canonicalRefUrl, canonicalReleaseUrl, canonicalTagObjectUrl,
  httpResponse, replayFetch, resignSnapshot, reviewDrift, sealReview,
} from '../src/drift.js';
import {FIXTURES, runFixture} from '../src/drift-fixtures.js';

const archive = JSON.parse(fs.readFileSync(new URL('../public/evidence/demo.json', import.meta.url)));
const config = JSON.parse(fs.readFileSync(new URL('../public/deployment.json', import.meta.url)));
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const base = {repo:'example/widget', tag:'v1.2.3', commit:COMMIT, path:'docs/Migration.md', body:'Release line one.\nRelease line two.\n', document:'# Migration\n\nUse the new call.\n'};
const check = (report, id) => report.checks.find(item => item.id === id);
const hostsOf = report => report.requests.map(item => new URL(item.url).hostname);

test('synthetic no-drift fixture matches without calling the result authentic', async () => {
  const {report, review} = await runFixture('no-drift');
  const before = canonical(review.snapshot);
  assert.equal(report.status, 'NO_DRIFT');
  assert.equal(report.synthetic, true);
  assert.equal(report.mode, 'offline-fixture');
  assert.equal(report.maliceInferred, false);
  assert.equal(report.authenticityInferred, false);
  assert.equal(report.contractWrite, false);
  assert.equal(report.frozenBytesUnchanged, true);
  assert.equal(report.frozenSnapshotDigestAfter, review.snapshot.digest);
  assert.equal(canonical(review.snapshot), before);
  assert.deepEqual(report.boundaries, BOUNDARIES);
  assert.match(report.trust, /not proof the frozen snapshot was authentic/);
  assert.match(report.challengeNote, /SYNTHETIC EXAMPLE/);
  assert.match(report.challengeNote, /does not become a new on-chain source/);
  assert.ok(report.challengeNote.length <= 1800);
  assert.deepEqual(report.checks.map(item => item.status), ['MATCH', 'MATCH', 'MATCH', 'MATCH']);
  assert.equal(hostsOf(report).every(host => host === 'api.github.com' || host === 'raw.githubusercontent.com'), true);
});

test('repeated synthetic runs keep the same report digest', async () => {
  const first = (await runFixture('no-drift')).report;
  const second = (await runFixture('no-drift')).report;
  assert.equal(first.digest, second.digest);
});

test('tag movement is drift and the pinned commit document stays a separate result', async () => {
  const {report} = await runFixture('tag-moved');
  const pointer = check(report, 'tag_pointer');
  const pinned = check(report, 'pinned_document');
  const tip = check(report, 'tag_tip_document');
  assert.equal(report.status, 'DRIFT');
  assert.equal(pointer.status, 'CHANGED');
  assert.equal(pointer.reason, 'tag-pointer-changed');
  assert.equal(pointer.commitUnchanged, false);
  assert.equal(pointer.observedCommit, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(pinned.status, 'MATCH');
  assert.equal(tip.status, 'CONTEXT');
  assert.equal(tip.sameTextAsFrozen, false);
  assert.notEqual(tip.status, 'CHANGED');
  assert.match(tip.detail, /not a change to the frozen commit bytes/);
  assert.match(report.detail, /not a finding of malice/);
  assert.doesNotMatch(JSON.stringify(report), /fastify/);
});

test('a moved tag whose new tip cannot be read is still a pointer change', async () => {
  const {review} = await FIXTURES['tag-moved'].build();
  const replay = replayFetch(review);
  const moved = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const report = await reviewDrift(review, {fetchImpl: async url => {
    if (url === canonicalRawUrl(review.repo, moved, review.changelog_path)) return httpResponse({status:404, body:'missing tip'});
    if (url === canonicalRefUrl(review.repo, review.tag)) return httpResponse({body: JSON.stringify({ref:`refs/tags/${review.tag}`, object:{type:'commit', sha:moved}})});
    return replay(url);
  }, observedAt:'2026-01-01T00:00:00.000Z', synthetic:true, syntheticLabel:'tip missing', mode:'offline-fixture'});
  assert.equal(report.status, 'DRIFT');
  assert.equal(check(report, 'pinned_document').status, 'MATCH');
  assert.equal(check(report, 'tag_tip_document').status, 'UNAVAILABLE');
  assert.equal(check(report, 'tag_tip_document').notAChange, true);
});

test('edited synthetic release notes produce a reproducible diff', async () => {
  const {report, body} = await runFixture('notes-changed');
  const notes = check(report, 'release_body');
  assert.equal(report.status, 'DRIFT');
  assert.equal(notes.status, 'CHANGED');
  assert.equal(notes.observedSha256, await sha256(body));
  assert.notEqual(notes.observedSha256, notes.frozenSha256);
  assert.match(notes.diff, /Release line two was edited in this synthetic fixture/);
  assert.equal(notes.observedText, undefined);
  assert.equal(check(report, 'release_record').status, 'MATCH');
  assert.equal(check(report, 'tag_pointer').status, 'MATCH');
  assert.equal(check(report, 'pinned_document').status, 'MATCH');
});

test('a different document at the frozen commit URL is drift, not a vulnerability finding', async () => {
  const {report, document} = await runFixture('document-changed');
  const doc = check(report, 'pinned_document');
  assert.equal(doc.status, 'CHANGED');
  assert.equal(doc.observedSha256, await sha256(document));
  assert.match(doc.detail, /not proof of a vulnerability/);
  assert.equal(check(report, 'tag_pointer').status, 'MATCH');
});

test('release HTTP 404 is incomplete and is not recorded as a change', async () => {
  const {report} = await runFixture('release-unavailable');
  for (const id of ['release_body', 'release_record']) {
    const item = check(report, id);
    assert.equal(item.status, 'UNAVAILABLE');
    assert.equal(item.reason, 'http-error');
    assert.equal(item.httpStatus, 404);
    assert.equal(item.notAChange, true);
  }
  assert.equal(check(report, 'tag_pointer').status, 'MATCH');
  assert.equal(check(report, 'pinned_document').status, 'MATCH');
  assert.equal(report.status, 'INCOMPLETE');
  assert.notEqual(report.status, 'DRIFT');
  assert.match(report.detail, /not recorded as content changes/);
});

test('pinned document HTTP 404 leaves the frozen bytes unchanged and unedited', async () => {
  const {report, review} = await runFixture('document-unavailable');
  const doc = check(report, 'pinned_document');
  assert.equal(doc.status, 'UNAVAILABLE');
  assert.equal(doc.httpStatus, 404);
  assert.equal(doc.notAChange, true);
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(review.snapshot.sources[1].text.includes('Use the new call.'), true);
});

test('network failure and HTTP 403 stay unavailable', async () => {
  const review = await sealReview(base);
  const denied = await reviewDrift(review, {fetchImpl: async () => { throw new TypeError('offline'); }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(denied.status, 'INCOMPLETE');
  assert.equal(check(denied, 'release_body').reason, 'network-error');
  assert.equal(check(denied, 'release_body').notAChange, true);
  const limited = await reviewDrift(review, {fetchImpl: async () => httpResponse({status:403, body:'rate limit'}), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(limited, 'tag_pointer').status, 'UNAVAILABLE');
  assert.equal(check(limited, 'tag_pointer').httpStatus, 403);
  assert.notEqual(limited.status, 'DRIFT');
});

test('redirects are refused, including same-host and link-local targets', async () => {
  const {report} = await runFixture('redirect-refused');
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.refusedRedirects[0].followed, false);
  assert.equal(report.refusedRedirects[0].locationHost, '169.254.169.254');
  assert.equal(report.requests.some(item => item.url.includes('169.254')), false);
  assert.equal(check(report, 'release_body').reason, 'redirect-refused');
  assert.equal(check(report, 'release_body').notAChange, true);
  const review = await sealReview(base);
  let calls = 0;
  const replay = replayFetch(review);
  const moved = await reviewDrift(review, {fetchImpl: async url => {
    calls += 1;
    if (url === canonicalReleaseUrl(review.repo, review.tag)) return httpResponse({status:302, headers:{Location:'https://api.github.com/repos/example/widget/releases/tags/v9.9.9'}});
    return replay(url);
  }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(calls, 3);
  assert.equal(check(moved, 'release_body').reason, 'redirect-refused');
  assert.equal(moved.requests.filter(item => item.purpose === 'release').length, 1);
});

test('opaque and unreadable release payloads are not edits', async () => {
  const review = await sealReview(base);
  const replay = replayFetch(review);
  const opaque = await reviewDrift(review, {fetchImpl: async url => url === canonicalReleaseUrl(review.repo, review.tag) ? {status:0, type:'opaqueredirect', headers:{get:()=>null}, arrayBuffer: async () => new ArrayBuffer(0)} : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(opaque, 'release_body').reason, 'redirect-refused');
  const junk = await reviewDrift(review, {fetchImpl: async url => url === canonicalReleaseUrl(review.repo, review.tag) ? httpResponse({body:'<html>nope</html>'}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(junk, 'release_body').reason, 'not-json');
  assert.equal(junk.status, 'INCOMPLETE');
});

test('oversize, non-UTF-8, draft, and mismatched tag responses are unavailable', async () => {
  const review = await sealReview(base);
  const replay = replayFetch(review);
  const release = canonicalReleaseUrl(review.repo, review.tag);
  const raw = canonicalRawUrl(review.repo, review.commit_sha, review.changelog_path);
  let reads = 0;
  const sized = await reviewDrift(review, {fetchImpl: async url => {
    if (url === raw) return {status:200, headers:{get:name => name.toLowerCase() === 'content-length' ? String(DRIFT_LIMITS.document + 50) : null}, arrayBuffer: async () => { reads += 1; return new ArrayBuffer(0); }};
    return replay(url);
  }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(reads, 0);
  assert.equal(check(sized, 'pinned_document').reason, 'oversize');
  assert.equal(check(sized, 'pinned_document').status, 'UNAVAILABLE');
  const hugeDoc = await reviewDrift(review, {fetchImpl: async url => url === raw ? httpResponse({body:'m'.repeat(DRIFT_LIMITS.document + 1)}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(hugeDoc, 'pinned_document').reason, 'oversize');
  const notes = 'n'.repeat(DRIFT_LIMITS.body + 1);
  const hugeNotes = await reviewDrift(review, {fetchImpl: async url => url === release ? httpResponse({body: JSON.stringify({id:42, tag_name:review.tag, name:review.tag, published_at:'2024-05-01T00:00:00Z', prerelease:false, draft:false, body:notes})}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(hugeNotes, 'release_body').reason, 'unreadable-release');
  assert.notEqual(check(hugeNotes, 'release_body').status, 'CHANGED');
  const binary = await reviewDrift(review, {fetchImpl: async url => url === raw ? httpResponse({body: Uint8Array.of(0xff, 0xfe, 0xfd)}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(binary, 'pinned_document').reason, 'not-utf8');
  const releaseObject = {id:42, tag_name:review.tag, name:review.tag, published_at:'2024-05-01T00:00:00Z', prerelease:false, draft:true, body:review.snapshot.release.body};
  const draft = await reviewDrift(review, {fetchImpl: async url => url === release ? httpResponse({body: JSON.stringify(releaseObject)}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(draft, 'release_body').reason, 'unpublished-release');
  releaseObject.draft = false; releaseObject.tag_name = 'other';
  const mismatch = await reviewDrift(review, {fetchImpl: async url => url === release ? httpResponse({body: JSON.stringify(releaseObject)}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(mismatch, 'release_record').reason, 'tag-mismatch');
  assert.equal(mismatch.status, 'INCOMPLETE');
});

test('a changed release id with the same notes is record drift only', async () => {
  const review = await sealReview(base);
  const replay = replayFetch(review);
  const body = JSON.stringify({id:99, tag_name:review.tag, name:review.tag, published_at:review.snapshot.release.published_at, prerelease:false, draft:false, body:review.snapshot.release.body});
  const report = await reviewDrift(review, {fetchImpl: async url => url === canonicalReleaseUrl(review.repo, review.tag) ? httpResponse({body}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(report.status, 'DRIFT');
  assert.equal(check(report, 'release_body').status, 'MATCH');
  assert.equal(check(report, 'release_record').status, 'CHANGED');
  assert.deepEqual(check(report, 'release_record').changedFields, ['id']);
});

test('re-annotated tag pointing at the same commit does not claim the commit tree changed', async () => {
  const tagSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const review = await sealReview({...base, tagChain:[{type:'tag', sha:tagSha}, {type:'commit', sha:COMMIT}]});
  const replay = replayFetch(review);
  const next = 'cccccccccccccccccccccccccccccccccccccccc';
  const report = await reviewDrift(review, {fetchImpl: async url => {
    if (url === canonicalRefUrl(review.repo, review.tag)) return httpResponse({body: JSON.stringify({ref:`refs/tags/${review.tag}`, object:{type:'tag', sha:next}})});
    if (url === canonicalTagObjectUrl(review.repo, next)) return httpResponse({body: JSON.stringify({sha:next, object:{type:'commit', sha:COMMIT}})});
    return replay(url);
  }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  const pointer = check(report, 'tag_pointer');
  assert.equal(report.status, 'DRIFT');
  assert.equal(pointer.reason, 'tag-object-changed');
  assert.equal(pointer.commitUnchanged, true);
  assert.equal(pointer.observedCommit, COMMIT);
  assert.match(pointer.detail, /reviewed commit tree was not reported as changed/);
  assert.equal(check(report, 'pinned_document').status, 'MATCH');
  assert.equal(check(report, 'tag_tip_document'), undefined);
});

test('cyclic and non-hex tag objects infer no new commit and request no escaped path', async () => {
  const review = await sealReview(base);
  const replay = replayFetch(review);
  const loop = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const cyclic = await reviewDrift(review, {fetchImpl: async url => {
    if (url === canonicalRefUrl(review.repo, review.tag)) return httpResponse({body: JSON.stringify({ref:`refs/tags/${review.tag}`, object:{type:'tag', sha:loop}})});
    if (url === canonicalTagObjectUrl(review.repo, loop)) return httpResponse({body: JSON.stringify({sha:loop, object:{type:'tag', sha:loop}})});
    return replay(url);
  }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(cyclic, 'tag_pointer').status, 'UNAVAILABLE');
  assert.equal(check(cyclic, 'tag_pointer').observedCommit, null);
  assert.notEqual(cyclic.status, 'DRIFT');
  const poisoned = await reviewDrift(review, {fetchImpl: async url => {
    if (String(url).includes('..')) throw new Error('Escaped path was fetched.');
    if (url === canonicalRefUrl(review.repo, review.tag)) return httpResponse({body: JSON.stringify({ref:`refs/tags/${review.tag}`, object:{type:'tag', sha:'../admin'}})});
    return replay(url);
  }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(poisoned, 'tag_pointer').reason, 'unreadable-tag');
  assert.equal(poisoned.requests.some(item => item.url.includes('..')), false);
});

test('untrusted recorded URLs and unsafe identity fetch nothing', async () => {
  const {report} = await runFixture('untrusted-url');
  assert.equal(report.status, 'UNTRUSTED');
  assert.equal(report.reason, 'non-canonical-url');
  assert.equal(report.requests.length, 0);
  const review = await sealReview(base);
  review.snapshot.sources[0].url = 'http://169.254.169.254/latest/meta-data';
  const stale = await reviewDrift(review, {fetchImpl: async () => { throw new Error('fetched'); }, observedAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(stale.reason, 'digest-mismatch');
  assert.equal(stale.requests.length, 0);
  const cases = [
    [{...base, path:'../secret'}, /relative path/],
    [{...base, tag:'v1/../../admin'}, /unsupported characters/],
    [{...base, commit:COMMIT.toUpperCase()}, /lowercase hexadecimal/],
    [{...base, repo:'https://evil.example/widget'}, /owner\/name/],
    [{...base, repo:'owner/name@evil'}, /owner\/name/],
  ];
  for (const [partial, pattern] of cases) {
    const forged = await sealReview({...base, ...partial});
    await resignSnapshot(forged.snapshot);
    const result = await reviewDrift(forged, {fetchImpl: async () => { throw new Error('fetched'); }, observedAt:'2026-01-01T00:00:00.000Z'});
    assert.equal(result.status, 'UNTRUSTED');
    assert.equal(result.requests.length, 0);
    assert.match(result.detail, pattern);
  }
});

test('an owner string that looks like an address is still requested only from GitHub hosts', async () => {
  const review = await sealReview({...base, repo:'127.0.0.1/metadata'});
  const calls = [];
  const report = await reviewDrift(review, {fetchImpl: async (url, init) => {
    calls.push({url, init});
    return replayFetch(review)(url);
  }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport', url:'http://169.254.169.254/latest/meta-data'});
  assert.equal(report.status, 'NO_DRIFT');
  assert.deepEqual([...new Set(calls.map(call => new URL(call.url).hostname))], ['api.github.com', 'raw.githubusercontent.com']);
  assert.equal(calls.some(call => call.url.includes('169.254') || call.url.startsWith('http://127.0.0.1')), false);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.equal(calls[0].init.headers['User-Agent'], 'ReleaseProof-DriftReview');
});

test('tag characters that change path meaning are percent-encoded', async () => {
  for (const tag of ['v1+build', 'rc/1']) {
    const review = await sealReview({...base, tag});
    const seen = [];
    await reviewDrift(review, {fetchImpl: async url => { seen.push(url); return replayFetch(review)(url); }, observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
    assert.ok(seen.includes(canonicalReleaseUrl(review.repo, tag)));
    assert.equal(seen.some(url => url.includes('/tags/v1+') || url.includes('/tags/rc/1')), false);
  }
});

test('frozen fastify evidence replays as no drift without claiming a live upstream observation', async () => {
  const review = archive.reviews[0];
  const fingerprint = canonical(review.snapshot);
  const report = await reviewDrift(review, {fetchImpl: replayFetch(review), mode:'replay', synthetic:false, observedAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(report.status, 'NO_DRIFT');
  assert.equal(report.mode, 'replay');
  assert.equal(report.synthetic, false);
  assert.equal(report.frozenSnapshotDigest, '7af4ed36d53e9e1250813fc7421567516986412476eae0eb728cb6a96e6cbbc0');
  assert.equal(report.authenticityInferred, false);
  assert.equal(canonical(review.snapshot), fingerprint);
  assert.equal(JSON.stringify(report).includes('V5 Migration Guide'), false);
  assert.equal(JSON.stringify(report).includes('add missing route shorthands'), false);
});

test('a consistent audit package can be rechecked without mutating it', async () => {
  const bundle = await createAudit({review:archive.reviews[0], challenges:archive.challenges, config, mode:'recorded'});
  const before = canonical(bundle);
  const report = await reviewDrift(bundle, {fetchImpl: replayFetch(bundle.review), mode:'replay', synthetic:false, observedAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(report.status, 'NO_DRIFT');
  assert.equal(canonical(bundle), before);
  assert.match(report.useInChallenge, /existing challenge form/);
});

test('missing snapshot and empty successful document are classified separately', async () => {
  const missing = await reviewDrift({repo:'example/widget'}, {fetchImpl: async () => { throw new Error('fetched'); }, observedAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(missing.status, 'UNTRUSTED');
  assert.equal(missing.reason, 'missing-snapshot');
  assert.equal(missing.requests.length, 0);
  const review = await sealReview(base);
  const replay = replayFetch(review);
  const raw = canonicalRawUrl(review.repo, review.commit_sha, review.changelog_path);
  const emptied = await reviewDrift(review, {fetchImpl: async url => url === raw ? httpResponse({body:'\n'}) : replay(url), observedAt:'2026-01-01T00:00:00.000Z', mode:'injected-transport'});
  assert.equal(check(emptied, 'pinned_document').status, 'CHANGED');
  assert.match(check(emptied, 'pinned_document').detail, /not a finding of malice/);
});

test('deployed contract bytes remain the accepted source commitment', async () => {
  const code = fs.readFileSync(new URL('../contracts/releaseproof.py', import.meta.url));
  assert.equal(await sha256(code), config.sourceSha256);
});

test('CLI fixtures and replay run offline and reject missing arguments', () => {
  const run = extra => spawnSync(process.execPath, ['scripts/drift.mjs', ...extra], {encoding:'utf8'});
  const moved = run(['--fixture', 'tag-moved']);
  assert.equal(moved.status, 0, moved.stderr);
  const movedReport = JSON.parse(moved.stdout);
  assert.equal(movedReport.status, 'DRIFT');
  assert.equal(movedReport.synthetic, true);
  const trusted = run(['--fixture', 'untrusted-url']);
  assert.equal(JSON.parse(trusted.stdout).status, 'UNTRUSTED');
  const replay = run(['--demo', '--replay']);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).status, 'NO_DRIFT');
  assert.equal(JSON.parse(replay.stdout).mode, 'replay');
  const help = run([]);
  assert.equal(help.status, 1);
  assert.match(help.stdout, /--fixture/);
});

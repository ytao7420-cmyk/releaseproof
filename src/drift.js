// Upstream drift review. Compares a frozen snapshot with current public GitHub
// reads. It does not mutate that snapshot, send a transaction, or decide malice.
import {canonical, sha256} from './audit.js';

export const DRIFT_SCHEMA = 'releaseproof-drift-v1';
export const BOUNDARIES = [
  'Drift records a byte or pointer difference. It leaves malice, vulnerability, and upgrade safety unproven.',
  'HTTP 404, timeouts, non-UTF-8 bodies, oversize bodies, and refused redirects are unavailability. Unavailability is not a content change.',
  'A match means these public reads returned the same decoded text at observation time. It is not proof the frozen snapshot was authentic, complete, or published by the rightful author.',
  'The frozen snapshot, revision history, and contract records stay unchanged. This review sends no transaction and opens no challenge.',
  'Fetches are HTTPS GET requests to api.github.com and raw.githubusercontent.com only, rebuilt from the frozen repository, tag, commit, and document path. Package URLs and redirect targets are not followed.',
];
const USE_IN_CHALLENGE = 'A person can paste challengeNote into the existing challenge form. The contract still reconsiders the original frozen sources. This report does not become a new on-chain source and does not by itself revise a conclusion.';
const HOSTS = new Set(['api.github.com', 'raw.githubusercontent.com']);
const SAFE = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~');
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG = /^[A-Za-z0-9_./+-]+$/;
const PATH = /^[A-Za-z0-9_./-]+$/;
const SHA = /^[0-9a-f]{40}$/;
const JSON_LIMIT = 250000;
const BODY_LIMIT = 24000;
const DOC_LIMIT = 32000;
export const DRIFT_LIMITS = {json: JSON_LIMIT, body: BODY_LIMIT, document: DOC_LIMIT};
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const bytesOf = text => new TextEncoder().encode(text).length;
const partsOk = (value, re) => typeof value === 'string' && re.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');

export function segment(value) {
  let out = '';
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte);
    out += SAFE.has(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}
export const canonicalReleaseUrl = (repo, tag) => `https://api.github.com/repos/${repo}/releases/tags/${segment(tag)}`;
export const canonicalRefUrl = (repo, tag) => `https://api.github.com/repos/${repo}/git/ref/tags/${segment(tag)}`;
export const canonicalTagObjectUrl = (repo, sha) => `https://api.github.com/repos/${repo}/git/tags/${sha}`;
export const canonicalRawUrl = (repo, commit, path) => `https://raw.githubusercontent.com/${repo}/${commit}/${path.split('/').map(segment).join('/')}`;
export const canonicalHtmlUrl = (repo, tag) => `https://github.com/${repo}/releases/tag/${segment(tag)}`;

export function assertPublicGithubUrl(url, {repo, kind, commit} = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('URL rejected.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) throw new Error('URL rejected.');
  if (!HOSTS.has(parsed.hostname) || parsed.host !== parsed.hostname) throw new Error('URL rejected.');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.includes(':')) throw new Error('URL rejected.');
  if (kind === 'api' && !parsed.pathname.startsWith(`/repos/${repo}/`)) throw new Error('URL rejected.');
  if (kind === 'raw' && !parsed.pathname.startsWith(`/${repo}/${commit}/`)) throw new Error('URL rejected.');
  return parsed;
}

export function httpResponse({status = 200, body = '', headers = {}} = {}) {
  const encoded = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const table = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    headers: {get: name => table.get(String(name).toLowerCase()) ?? null},
    arrayBuffer: async () => encoded.slice().buffer,
  };
}

function extractReview(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.schema === 'releaseproof-audit-v1' && input.review?.snapshot) return input.review;
  if (input.review?.snapshot) return input.review;
  if (input.snapshot && input.repo) return input;
  return null;
}
async function digestOf(value) {
  const copy = {...value};
  delete copy.digest;
  return sha256(canonical(copy));
}
function reject(reason, detail) {
  return {ok: false, reason, detail};
}
function identityError(review) {
  const repo = review?.repo;
  const tag = review?.tag;
  const commit = review?.commit_sha;
  const path = review?.changelog_path;
  if (typeof repo !== 'string' || repo.length > 180 || !REPO.test(repo) || repo.split('/').some(part => part === '.' || part === '..')) return 'Repository must be owner/name without a URL.';
  if (typeof tag !== 'string' || tag.length > 128 || !partsOk(tag, TAG)) return 'Release tag contains unsupported characters.';
  if (!SHA.test(commit || '')) return 'Commit must be forty lowercase hexadecimal characters.';
  if (typeof path !== 'string' || path.length > 220 || !partsOk(path, PATH)) return 'Document path must be a relative path inside the repository.';
  return '';
}
async function validateFrozen(review) {
  const shape = identityError(review);
  if (shape) return reject('identity-rejected', shape);
  const snapshot = review.snapshot;
  if (!snapshot || snapshot.repo !== review.repo || snapshot.commit_sha !== review.commit_sha) return reject('identity-rejected', 'Snapshot identity differs from the frozen review.');
  if (snapshot.release?.tag_name !== review.tag) return reject('identity-rejected', 'Snapshot release tag differs from the frozen review.');
  let expectedDigest;
  try { expectedDigest = await digestOf(snapshot); } catch { return reject('digest-mismatch', 'Frozen snapshot cannot be canonicalized.'); }
  if (snapshot.digest !== expectedDigest) return reject('digest-mismatch', 'Frozen snapshot digest does not match its bytes.');
  const sources = snapshot.sources;
  if (!Array.isArray(sources) || sources.length !== 2 || sources[0]?.id !== 'release' || sources[1]?.id !== 'migration') return reject('identity-rejected', 'Frozen snapshot needs the release and migration sources.');
  const [releaseSource, migrationSource] = sources;
  if (typeof releaseSource.text !== 'string' || typeof migrationSource.text !== 'string') return reject('identity-rejected', 'Frozen sources are not text.');
  if (releaseSource.text !== snapshot.release.body) return reject('source-hash-mismatch', 'Frozen release body and release source differ.');
  if (releaseSource.sha256 !== await sha256(releaseSource.text) || migrationSource.sha256 !== await sha256(migrationSource.text)) return reject('source-hash-mismatch', 'Frozen source hash does not match its text.');
  const chain = snapshot.tag_chain;
  if (!Array.isArray(chain) || chain.length < 1 || chain.length > 4) return reject('identity-rejected', 'Frozen tag chain is missing or too deep.');
  if (chain.some((entry, index) => !entry || !SHA.test(entry.sha || '') || entry.type !== (index === chain.length - 1 ? 'commit' : 'tag'))) return reject('identity-rejected', 'Frozen tag chain does not resolve to the pinned commit.');
  if (chain.at(-1).sha !== review.commit_sha) return reject('identity-rejected', 'Frozen tag chain ends at a different commit.');
  const urls = {
    release: canonicalReleaseUrl(review.repo, review.tag),
    ref: canonicalRefUrl(review.repo, review.tag),
    raw: canonicalRawUrl(review.repo, review.commit_sha, review.changelog_path),
    html: canonicalHtmlUrl(review.repo, review.tag),
  };
  if (releaseSource.url !== urls.release || migrationSource.url !== urls.raw) return reject('non-canonical-url', 'Recorded source URL is not the canonical public GitHub URL. It was not fetched.');
  if (snapshot.release.html_url !== urls.html) return reject('non-canonical-url', 'Recorded release page URL is not the canonical GitHub release URL.');
  for (const url of [urls.release, urls.ref, urls.raw]) assertPublicGithubUrl(url, {repo: review.repo, kind: url === urls.raw ? 'raw' : 'api', commit: review.commit_sha});
  return {ok: true, urls, releaseSource, migrationSource};
}

export function boundedDiff(before, after, limit = 24) {
  if (before === after) return {changed: false, diff: '', truncated: false};
  const left = before.split('\n');
  const right = after.split('\n');
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let endLeft = left.length - 1;
  let endRight = right.length - 1;
  while (endLeft >= start && endRight >= start && left[endLeft] === right[endRight]) { endLeft -= 1; endRight -= 1; }
  const removed = left.slice(start, endLeft + 1);
  const added = right.slice(start, endRight + 1);
  const lines = [`@@ frozen ${start + 1},${removed.length} observed ${start + 1},${added.length} @@`];
  const clip = line => line.length > 180 ? `${line.slice(0, 180)}…` : line;
  for (const line of removed.slice(0, limit)) lines.push(`-${clip(line)}`);
  for (const line of added.slice(0, Math.max(0, limit - Math.min(removed.length, limit)))) lines.push(`+${clip(line)}`);
  const truncated = removed.length + added.length > limit;
  if (truncated) lines.push(`# diff truncated; ${removed.length} frozen lines and ${added.length} observed lines differ in this span`);
  return {changed: true, diff: lines.join('\n').slice(0, 4000), truncated};
}

function locationHost(location, base) {
  try { return new URL(location, base).hostname || 'unreadable'; } catch { return 'unreadable'; }
}
async function readLimited(response, limit) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > limit) return {ok: false, reason: 'oversize', bytes: declared};
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.byteLength > limit) return {ok: false, reason: 'oversize', bytes: raw.byteLength};
  try { return {ok: true, text: new TextDecoder('utf-8', {fatal: true}).decode(raw), bytes: raw.byteLength}; }
  catch { return {ok: false, reason: 'not-utf8', bytes: raw.byteLength}; }
}
function unavailable(reason, detail, extra = {}) {
  return {status: 'UNAVAILABLE', reason, detail, notAChange: true, frozenSha256: extra.frozenSha256 ?? null, observedSha256: null, httpStatus: extra.httpStatus ?? null, diff: null, diffTruncated: false, changedFields: []};
}
function baseCheck(id, title, extra) {
  return {id, title, status: 'MATCH', reason: 'match', detail: 'Observed text matches the frozen bytes.', notAChange: false, httpStatus: extra.httpStatus ?? 200, diff: null, diffTruncated: false, changedFields: [], ...extra};
}

export function challengeNote(report) {
  const lines = [
    report.synthetic ? `SYNTHETIC EXAMPLE (${report.syntheticLabel || 'offline fixture'}). This is not an observation of a public upstream.` : 'Public upstream drift observation.',
    `Status: ${report.status}`,
    `Repository: ${report.repo || 'unavailable'} tag ${report.tag || 'unavailable'} commit ${report.commitSha || 'unavailable'}`,
    `Frozen snapshot digest: ${report.frozenSnapshotDigest || 'unavailable'}`,
    ...((report.checks || []).map(check => `- ${check.id}: ${check.status}${check.reason && check.reason !== 'match' ? ` (${check.reason})` : ''}${check.observedCommit ? ` observed commit ${check.observedCommit}` : ''}`)),
    ...BOUNDARIES,
    USE_IN_CHALLENGE,
  ];
  let note = lines.join('\n');
  if (note.length > 1800) note = `${note.slice(0, 1750)}\n…note truncated; full checks remain in the drift report.`;
  return note;
}

function shell(review, options, status, reason, detail) {
  return {
    schema: DRIFT_SCHEMA,
    synthetic: options.synthetic === true,
    syntheticLabel: options.syntheticLabel || '',
    mode: options.mode || (options.fetchImpl ? 'injected-transport' : 'live-public-read'),
    observedAt: options.observedAt || new Date().toISOString(),
    status,
    reason,
    detail,
    reviewId: typeof review?.id === 'string' ? review.id : '',
    repo: review?.repo || '',
    tag: review?.tag || '',
    commitSha: review?.commit_sha || '',
    documentPath: review?.changelog_path || '',
    frozenSnapshotDigest: review?.snapshot?.digest || '',
    frozenSnapshotDigestAfter: review?.snapshot?.digest || '',
    frozenBytesUnchanged: true,
    maliceInferred: false,
    authenticityInferred: false,
    contractWrite: false,
    checks: [],
    requests: [],
    refusedRedirects: [],
    boundaries: BOUNDARIES,
    useInChallenge: USE_IN_CHALLENGE,
    trust: BOUNDARIES.join(' '),
  };
}

async function completeChecks(report) {
  for (const check of report.checks) {
    if (typeof check.observedText === 'string' && !check.observedSha256) check.observedSha256 = await sha256(check.observedText);
    delete check.observedText;
  }
}
async function seal(report) {
  await completeChecks(report);
  delete report.digest;
  report.challengeNote = challengeNote(report);
  const body = {...report};
  delete body.digest;
  report.digest = await sha256(canonical(body));
  const again = {...report};
  delete again.digest;
  if (report.digest !== await sha256(canonical(again))) throw new Error('Drift report digest failed.');
  return report;
}

export async function reviewDrift(input, options = {}) {
  const original = extractReview(input);
  if (!original?.snapshot) return seal(shell(original, options, 'UNTRUSTED', 'missing-snapshot', 'Frozen snapshot is missing. Nothing was fetched.'));
  let fingerprint;
  try { fingerprint = canonical(original.snapshot); }
  catch { return seal(shell(original, options, 'UNTRUSTED', 'digest-mismatch', 'Frozen snapshot cannot be canonicalized. Nothing was fetched.')); }
  const working = structuredClone(original);
  const report = shell(working, options, 'NO_DRIFT', 'match', 'Public reads match the frozen snapshot.');
  const validated = await validateFrozen(working);
  if (!validated.ok) {
    report.status = 'UNTRUSTED';
    report.reason = validated.reason;
    report.detail = `${validated.detail} Nothing was fetched.`;
    if (canonical(original.snapshot) !== fingerprint) throw new Error('Frozen snapshot was modified.');
    return seal(report);
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeout = options.timeoutMs ?? 20000;
  const signal = options.signal || AbortSignal.timeout(timeout);
  const headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'ReleaseProof-DriftReview'};
  if (typeof window !== 'undefined') delete headers['User-Agent'];
  const init = () => ({method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: {...headers}, signal});

  async function get(url, purpose, kind, commit = working.commit_sha) {
    assertPublicGithubUrl(url, {repo: working.repo, kind, commit});
    report.requests.push({purpose, url});
    let response;
    try { response = await fetchImpl(url, init()); }
    catch (error) { return {failure: unavailable('network-error', `The public read failed before a response (${String(error?.name || 'Error')}). This is unavailability, not a content change.`)}; }
    const status = Number(response?.status) || 0;
    const redirected = response?.type === 'opaqueredirect' || status === 0 || REDIRECTS.has(status);
    if (redirected) {
      const refusal = {from: url, httpStatus: status, locationHost: locationHost(response?.headers?.get?.('location') || '', url), followed: false};
      report.refusedRedirects.push(refusal);
      return {failure: unavailable('redirect-refused', 'The public host returned a redirect. The target was not followed, and this is not a content change.', {httpStatus: status || null})};
    }
    if (status !== 200) return {failure: unavailable('http-error', `HTTP ${status} from a public GitHub read. This is unavailability, not a content change.`, {httpStatus: status})};
    let limited;
    try { limited = await readLimited(response, purpose === 'pinned-document' || purpose === 'tag-tip-document' ? DOC_LIMIT : JSON_LIMIT); }
    catch (error) { return {failure: unavailable('network-error', `The public response could not be read (${String(error?.name || 'Error')}). This is unavailability, not a content change.`, {httpStatus: 200})}; }
    if (!limited.ok) return {failure: unavailable(limited.reason, limited.reason === 'oversize' ? 'The public response exceeds the capture size limit. It was not compared and is not recorded as a change.' : 'The public response is not UTF-8 text. It was not compared and is not recorded as a change.', {httpStatus: 200})};
    return {text: limited.text, httpStatus: 200};
  }
  function parseJson(text) {
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' && !Array.isArray(value) ? {ok: true, value} : {ok: false};
    } catch { return {ok: false}; }
  }

  const releaseRead = await get(validated.urls.release, 'release', 'api');
  const releaseChecks = releaseOutcome(releaseRead, working, validated.releaseSource);
  report.checks.push(releaseChecks.body, releaseChecks.record);

  const tagRead = await readTag(get, parseJson, working);
  report.checks.push(tagRead.check);

  const docRead = await get(validated.urls.raw, 'pinned-document', 'raw');
  report.checks.push(documentOutcome(docRead, validated.migrationSource));

  if (tagRead.check.status === 'CHANGED' && tagRead.check.observedCommit && tagRead.check.observedCommit !== working.commit_sha) {
    const tipUrl = canonicalRawUrl(working.repo, tagRead.check.observedCommit, working.changelog_path);
    const tip = await get(tipUrl, 'tag-tip-document', 'raw', tagRead.check.observedCommit);
    report.checks.push(tipOutcome(tip, validated.migrationSource));
  }

  const required = report.checks.filter(check => check.id !== 'tag_tip_document');
  if (required.some(check => check.status === 'CHANGED')) {
    report.status = 'DRIFT';
    report.reason = 'difference';
    report.detail = 'At least one public read differs from the frozen snapshot. The difference is not a finding of malice or vulnerability.';
  } else if (required.some(check => check.status === 'UNAVAILABLE')) {
    report.status = 'INCOMPLETE';
    report.reason = 'unavailable';
    report.detail = 'At least one public read was unavailable. Unavailable reads are not recorded as content changes.';
  } else {
    report.status = 'NO_DRIFT';
    report.reason = 'match';
    report.detail = 'The public release, tag pointer, and pinned document matched the frozen snapshot at observation time. A match is not proof of authenticity.';
  }
  report.frozenSnapshotDigestAfter = working.snapshot.digest;
  if (canonical(original.snapshot) !== fingerprint || working.snapshot.digest !== original.snapshot.digest) throw new Error('Frozen snapshot was modified.');
  report.frozenBytesUnchanged = true;
  return seal(report);
}

function releaseOutcome(read, review, source) {
  const titles = {body: 'Release notes body', record: 'Release record'};
  const blank = (id, failure) => ({id, title: titles[id === 'release_body' ? 'body' : 'record'], ...failure, frozenSha256: id === 'release_body' ? source.sha256 : null});
  if (read.failure) return {body: blank('release_body', read.failure), record: blank('release_record', read.failure)};
  const parsed = (() => { try { return JSON.parse(read.text); } catch { return null; } })();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const failure = unavailable('not-json', 'The release endpoint did not return a JSON object. This is unavailability, not a content change.', {httpStatus: 200, frozenSha256: source.sha256});
    return {body: blank('release_body', failure), record: blank('release_record', failure)};
  }
  if (parsed.draft !== false || parsed.tag_name !== review.tag) {
    const reason = parsed.draft !== false ? 'unpublished-release' : 'tag-mismatch';
    const detail = reason === 'unpublished-release'
      ? 'The endpoint did not return a published release for the frozen tag. This is not recorded as an edit.'
      : 'The endpoint returned a different tag_name. This response was not treated as the frozen release.';
    const failure = unavailable(reason, detail, {httpStatus: 200, frozenSha256: source.sha256});
    return {body: blank('release_body', failure), record: blank('release_record', failure)};
  }
  let name = parsed.name;
  if (name == null || name === '') name = review.tag;
  const body = parsed.body == null ? '' : parsed.body;
  const published = parsed.published_at;
  const comparable = typeof body === 'string' && bytesOf(body) <= BODY_LIMIT && typeof name === 'string' && name.length <= 300 && typeof published === 'string' && published.length > 0 && published.length <= 80 && typeof parsed.prerelease === 'boolean' && Number.isSafeInteger(parsed.id) && parsed.id > 0;
  if (!comparable) {
    const failure = unavailable('unreadable-release', 'The published release payload is missing required fields or exceeds the notes limit. It was not recorded as an edit.', {httpStatus: 200, frozenSha256: source.sha256});
    return {body: blank('release_body', failure), record: blank('release_record', failure)};
  }
  const bodyCheck = baseCheck('release_body', titles.body, {frozenSha256: source.sha256, observedSha256: null, httpStatus: 200, frozenBytes: bytesOf(source.text), observedBytes: bytesOf(body)});
  if (body === source.text) bodyCheck.observedSha256 = source.sha256;
  else {
    const diff = boundedDiff(source.text, body);
    Object.assign(bodyCheck, {status: 'CHANGED', reason: 'body-changed', detail: 'The published release notes differ from the frozen text. This is a byte difference, not a finding of malice.', observedText: body, diff: diff.diff, diffTruncated: diff.truncated, changedFields: ['body']});
  }
  const frozenRecord = {id: review.snapshot.release.id, name: review.snapshot.release.name, published_at: review.snapshot.release.published_at, prerelease: review.snapshot.release.prerelease};
  const observedRecord = {id: parsed.id, name, published_at: published, prerelease: parsed.prerelease};
  const changedFields = Object.keys(frozenRecord).filter(key => frozenRecord[key] !== observedRecord[key]);
  const record = baseCheck('release_record', titles.record, {frozenSha256: null, observedSha256: null, httpStatus: 200, frozenRecord, observedRecord, detail: 'The published release id, name, publication time, and prerelease flag match the frozen record.'});
  if (changedFields.length) Object.assign(record, {status: 'CHANGED', reason: 'record-changed', detail: `The published release record differs in: ${changedFields.join(', ')}. A record difference is not a finding of malice.`, changedFields});
  return {body: bodyCheck, record};
}

function documentOutcome(read, source) {
  if (read.failure) return {id: 'pinned_document', title: 'Pinned commit document', ...read.failure, frozenSha256: source.sha256};
  if (read.text === source.text) return baseCheck('pinned_document', 'Pinned commit document', {frozenSha256: source.sha256, observedSha256: source.sha256, frozenBytes: bytesOf(source.text), observedBytes: bytesOf(read.text)});
  if (!read.text.trim()) {
    const diff = boundedDiff(source.text, read.text);
    return {id: 'pinned_document', title: 'Pinned commit document', status: 'CHANGED', reason: 'body-changed', detail: 'The commit-pinned document response is empty and differs from the frozen text. Empty text here is an observed difference, not a finding of malice.', notAChange: false, frozenSha256: source.sha256, observedSha256: null, observedText: read.text, httpStatus: 200, diff: diff.diff, diffTruncated: diff.truncated, changedFields: ['text'], frozenBytes: bytesOf(source.text), observedBytes: 0};
  }
  if (bytesOf(read.text) > DOC_LIMIT) return {id: 'pinned_document', title: 'Pinned commit document', ...unavailable('oversize', 'The pinned document exceeds the capture size limit. It was not compared and is not recorded as a change.', {httpStatus: 200, frozenSha256: source.sha256})};
  const diff = boundedDiff(source.text, read.text);
  return {id: 'pinned_document', title: 'Pinned commit document', status: 'CHANGED', reason: 'body-changed', detail: 'The document at the frozen commit URL differs from the frozen text. A difference at an immutable commit URL is a hosting inconsistency to investigate, not proof of a vulnerability.', notAChange: false, frozenSha256: source.sha256, observedSha256: null, observedText: read.text, httpStatus: 200, diff: diff.diff, diffTruncated: diff.truncated, changedFields: ['text'], frozenBytes: bytesOf(source.text), observedBytes: bytesOf(read.text)};
}

function tipOutcome(read, source) {
  if (read.failure) return {id: 'tag_tip_document', title: 'Document at the tag current tip', ...read.failure, supplemental: true, detail: 'The document at the moved tag tip could not be read. This does not change the pinned-commit comparison.'};
  const same = read.text === source.text;
  const diff = same ? null : boundedDiff(source.text, read.text);
  const check = {id: 'tag_tip_document', title: 'Document at the tag current tip', status: 'CONTEXT', reason: same ? 'same-text' : 'different-tip', detail: same ? 'The file at the tag current commit has the same text as the frozen document. This context does not alter the pinned-commit result.' : 'The file at the tag current commit differs from the frozen document. This describes the new tip only. It is not a change to the frozen commit bytes and is not a finding of malice.', notAChange: true, supplemental: true, sameTextAsFrozen: same, frozenSha256: source.sha256, observedSha256: same ? source.sha256 : null, httpStatus: 200, diff: diff?.diff ?? null, diffTruncated: diff?.truncated ?? false, changedFields: []};
  if (!same) check.observedText = read.text;
  return check;
}

async function readTag(get, parseJson, review) {
  const ref = await get(validatedUrl(review), 'tag-ref', 'api');
  if (ref.failure) return {check: {id: 'tag_pointer', title: 'Tag pointer', ...ref.failure, frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
  const parsed = parseJson(ref.text);
  if (!parsed.ok || parsed.value.ref !== `refs/tags/${review.tag}`) {
    return {check: {id: 'tag_pointer', title: 'Tag pointer', ...unavailable('unreadable-tag', 'The tag reference payload does not match the frozen tag. No new commit was inferred.', {httpStatus: 200}), frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
  }
  const chain = [];
  let object = parsed.value.object;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!object || !SHA.test(object.sha || '') || (object.type !== 'commit' && object.type !== 'tag')) {
      return {check: {id: 'tag_pointer', title: 'Tag pointer', ...unavailable('unreadable-tag', 'The tag reference did not resolve to a commit. No pointer change was inferred.', {httpStatus: 200}), frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
    }
    if (chain.some(entry => entry.sha === object.sha)) {
      return {check: {id: 'tag_pointer', title: 'Tag pointer', ...unavailable('unreadable-tag', 'The tag reference repeats an object. No pointer change was inferred.', {httpStatus: 200}), frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
    }
    chain.push({type: object.type, sha: object.sha});
    if (object.type === 'commit') break;
    if (depth === 3) return {check: {id: 'tag_pointer', title: 'Tag pointer', ...unavailable('unreadable-tag', 'The annotated tag chain is too deep. No pointer change was inferred.', {httpStatus: 200}), frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
    const nextUrl = canonicalTagObjectUrl(review.repo, object.sha);
    const next = await get(nextUrl, 'tag-object', 'api');
    if (next.failure) return {check: {id: 'tag_pointer', title: 'Tag pointer', ...next.failure, frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
    const tagObject = parseJson(next.text);
    if (!tagObject.ok || tagObject.value.sha !== object.sha) return {check: {id: 'tag_pointer', title: 'Tag pointer', ...unavailable('unreadable-tag', 'The annotated tag object did not match its requested SHA. No pointer change was inferred.', {httpStatus: 200}), frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
    object = tagObject.value.object;
  }
  const observedCommit = chain.at(-1)?.type === 'commit' ? chain.at(-1).sha : null;
  if (!observedCommit) return {check: {id: 'tag_pointer', title: 'Tag pointer', ...unavailable('unreadable-tag', 'The tag reference did not resolve to a commit. No pointer change was inferred.', {httpStatus: 200}), frozenCommit: review.commit_sha, observedCommit: null, commitUnchanged: null}};
  const frozenChain = review.snapshot.tag_chain;
  const sameChain = chain.length === frozenChain.length && chain.every((entry, index) => entry.type === frozenChain[index].type && entry.sha === frozenChain[index].sha);
  const commitUnchanged = observedCommit === review.commit_sha;
  if (commitUnchanged && sameChain) {
    return {check: baseCheck('tag_pointer', 'Tag pointer', {frozenCommit: review.commit_sha, observedCommit, frozenChain, observedChain: chain, commitUnchanged: true, detail: 'The tag still resolves to the frozen commit.'})};
  }
  return {check: {id: 'tag_pointer', title: 'Tag pointer', status: 'CHANGED', reason: commitUnchanged ? 'tag-object-changed' : 'tag-pointer-changed', detail: commitUnchanged ? 'The tag object chain changed and the resolved commit stayed the same. The reviewed commit tree was not reported as changed.' : 'The tag now resolves to a different commit. A moved tag is a pointer change, not by itself a vulnerability.', notAChange: false, frozenSha256: null, observedSha256: null, httpStatus: 200, diff: null, diffTruncated: false, changedFields: commitUnchanged ? ['tag_chain'] : ['commit'], frozenCommit: review.commit_sha, observedCommit, frozenChain, observedChain: chain, commitUnchanged}};
}
function validatedUrl(review) { return canonicalRefUrl(review.repo, review.tag); }

export async function resignSnapshot(snapshot) {
  snapshot.digest = await digestOf(snapshot);
  return snapshot;
}

export async function sealReview(partial) {
  const review = {
    id: partial.id || 'synthetic-review',
    repo: partial.repo,
    tag: partial.tag,
    commit_sha: partial.commit,
    changelog_path: partial.path,
    integration_context: partial.integration || 'Synthetic fixture. Not a public upstream observation.',
    snapshot: {
      repo: partial.repo,
      commit_sha: partial.commit,
      release: {
        id: partial.releaseId ?? 42,
        tag_name: partial.tag,
        name: partial.name ?? partial.tag,
        published_at: partial.publishedAt ?? '2024-05-01T00:00:00Z',
        prerelease: partial.prerelease === true,
        html_url: canonicalHtmlUrl(partial.repo, partial.tag),
        body: partial.body,
      },
      tag_chain: partial.tagChain || [{type: 'commit', sha: partial.commit}],
      sources: [
        {id: 'release', url: canonicalReleaseUrl(partial.repo, partial.tag), sha256: await sha256(partial.body), text: partial.body},
        {id: 'migration', url: canonicalRawUrl(partial.repo, partial.commit, partial.path), sha256: await sha256(partial.document), text: partial.document},
      ],
    },
  };
  review.snapshot.digest = await digestOf(review.snapshot);
  return review;
}

export function replayFetch(review) {
  const snapshot = review.snapshot;
  const release = snapshot.release;
  const document = snapshot.sources.find(source => source.id === 'migration').text;
  const map = new Map();
  map.set(canonicalReleaseUrl(review.repo, review.tag), httpResponse({body: JSON.stringify({id: release.id, tag_name: release.tag_name, name: release.name, published_at: release.published_at, prerelease: release.prerelease, draft: false, body: release.body})}));
  map.set(canonicalRefUrl(review.repo, review.tag), httpResponse({body: JSON.stringify({ref: `refs/tags/${review.tag}`, object: {sha: snapshot.tag_chain[0].sha, type: snapshot.tag_chain[0].type}})}));
  for (let index = 0; index < snapshot.tag_chain.length - 1; index += 1) {
    const entry = snapshot.tag_chain[index];
    const next = snapshot.tag_chain[index + 1];
    map.set(canonicalTagObjectUrl(review.repo, entry.sha), httpResponse({body: JSON.stringify({sha: entry.sha, object: {sha: next.sha, type: next.type}})}));
  }
  map.set(canonicalRawUrl(review.repo, review.commit_sha, review.changelog_path), httpResponse({body: document}));
  return async url => map.get(url) || httpResponse({status: 404, body: 'missing from replay'});
}


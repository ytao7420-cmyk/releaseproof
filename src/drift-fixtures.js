// Synthetic offline examples. Names and texts are invented. They are not observations of fastify/fastify or any other public upstream.
import {canonicalReleaseUrl, canonicalRawUrl, canonicalRefUrl, httpResponse, replayFetch, resignSnapshot, reviewDrift, sealReview} from './drift.js';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const MOVED = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const base = {
  repo: 'example/widget',
  tag: 'v1.2.3',
  commit: COMMIT,
  path: 'docs/Migration.md',
  body: 'Release line one.\nRelease line two.\n',
  document: '# Migration\n\nUse the new call.\n',
};
const OBSERVED_AT = '2026-01-01T00:00:00.000Z';

async function sealed(partial = {}) {
  return sealReview({...base, ...partial, integration: 'Synthetic fixture. Not a public upstream observation.'});
}
function releaseJson(review, body = review.snapshot.release.body) {
  const release = review.snapshot.release;
  return JSON.stringify({id: release.id, tag_name: release.tag_name, name: release.name, published_at: release.published_at, prerelease: release.prerelease, draft: false, body});
}

export const FIXTURES = {
  'no-drift': {
    label: 'no change',
    async build() {
      const review = await sealed();
      return {review, fetchImpl: replayFetch(review)};
    },
  },
  'tag-moved': {
    label: 'tag moved',
    async build() {
      const review = await sealed();
      const replay = replayFetch(review);
      const ref = canonicalRefUrl(review.repo, review.tag);
      const tip = canonicalRawUrl(review.repo, MOVED, review.changelog_path);
      const fetchImpl = async url => {
        if (url === ref) return httpResponse({body: JSON.stringify({ref: `refs/tags/${review.tag}`, object: {type: 'commit', sha: MOVED}})});
        if (url === tip) return httpResponse({body: '# Migration\n\nThis text exists only at the moved tip.\n'});
        return replay(url);
      };
      return {review, fetchImpl, movedCommit: MOVED};
    },
  },
  'notes-changed': {
    label: 'notes changed',
    async build() {
      const review = await sealed();
      const replay = replayFetch(review);
      const release = canonicalReleaseUrl(review.repo, review.tag);
      const body = 'Release line one.\nRelease line two was edited in this synthetic fixture.\n';
      const fetchImpl = async url => url === release ? httpResponse({body: releaseJson(review, body)}) : replay(url);
      return {review, fetchImpl, body};
    },
  },
  'document-changed': {
    label: 'pinned document changed',
    async build() {
      const review = await sealed();
      const replay = replayFetch(review);
      const raw = canonicalRawUrl(review.repo, review.commit_sha, review.changelog_path);
      const document = '# Migration\n\nSynthetic replacement at the same commit URL.\n';
      const fetchImpl = async url => url === raw ? httpResponse({body: document}) : replay(url);
      return {review, fetchImpl, document};
    },
  },
  'document-unavailable': {
    label: 'pinned document 404',
    async build() {
      const review = await sealed();
      const replay = replayFetch(review);
      const raw = canonicalRawUrl(review.repo, review.commit_sha, review.changelog_path);
      const fetchImpl = async url => url === raw ? httpResponse({status: 404, body: 'not found'}) : replay(url);
      return {review, fetchImpl};
    },
  },
  'release-unavailable': {
    label: 'release 404',
    async build() {
      const review = await sealed();
      const replay = replayFetch(review);
      const release = canonicalReleaseUrl(review.repo, review.tag);
      const fetchImpl = async url => url === release ? httpResponse({status: 404, body: 'not found'}) : replay(url);
      return {review, fetchImpl};
    },
  },
  'untrusted-url': {
    label: 'untrusted recorded URL',
    async build() {
      const review = await sealed();
      review.snapshot.sources[1].url = 'http://169.254.169.254/latest/meta-data';
      await resignSnapshot(review.snapshot);
      const fetchImpl = async () => { throw new Error('Untrusted fixture must not fetch.'); };
      return {review, fetchImpl};
    },
  },
  'redirect-refused': {
    label: 'redirect refused',
    async build() {
      const review = await sealed();
      const replay = replayFetch(review);
      const release = canonicalReleaseUrl(review.repo, review.tag);
      const fetchImpl = async url => {
        if (String(url).includes('169.254.169.254')) throw new Error('Redirect target was fetched.');
        if (url === release) return httpResponse({status: 302, headers: {Location: 'http://169.254.169.254/latest/meta-data'}, body: ''});
        return replay(url);
      };
      return {review, fetchImpl};
    },
  },
};

export const fixtureNames = Object.keys(FIXTURES);

export async function runFixture(name) {
  const fixture = FIXTURES[name];
  if (!fixture) throw new Error(`Unknown drift fixture. Use one of: ${fixtureNames.join(', ')}.`);
  const built = await fixture.build();
  const report = await reviewDrift(built.review, {fetchImpl: built.fetchImpl, synthetic: true, syntheticLabel: fixture.label, mode: 'offline-fixture', observedAt: OBSERVED_AT});
  return {report, review: built.review, ...built};
}

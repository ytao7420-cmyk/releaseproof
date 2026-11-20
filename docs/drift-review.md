# ReleaseProof v0.3: upstream drift review

## What this adds

The accepted project freezes a GitHub release, tag resolution, and commit-pinned document once. After that freeze, the contract does not read those URLs again. The accepted v0.2 audit pack checks the frozen package against itself and against the configured contract. Neither of those answers a later question: do the public release notes, the tag pointer, or the document at the pinned commit still match the frozen bytes?

v0.3 writes a separate drift report. It keeps the frozen snapshot, revision history, contract address, and contract source unchanged. The report is local evidence a person can paste into the existing challenge form. The contract still reconsiders the original frozen sources. This report does not become a new on-chain source, does not open a challenge by itself, and has not been submitted to Portal.

The contract test `test_independent_source_drift_cannot_freeze_a_snapshot` is a different check. It stops the one-time freeze when validators observe different bytes during that transaction. It does not recheck a snapshot after the review exists.

## What a report can say

| Check | Match | Changed | Unavailable |
| --- | --- | --- | --- |
| Release notes body | Same decoded text | Byte difference, with a bounded line diff and both SHA-256 values | The read could not be compared |
| Release record | Same id, name, publication time, and prerelease flag | One or more of those fields differ | The read could not be compared |
| Tag pointer | The tag still resolves to the frozen commit | The tag resolves to another commit, or the annotated-tag object changed while the commit stayed the same | No new commit is inferred |
| Pinned document | Same text at the frozen commit URL | Different text at that URL | The read could not be compared |

When the tag moves, the report may also include the document at the new tip as context. That context does not rewrite the pinned-commit result. A 404 for the new tip can sit beside a real pointer change.

Overall status:

- `NO_DRIFT`: the four required reads matched.
- `DRIFT`: at least one required read differed.
- `INCOMPLETE`: nothing differed, and at least one required read was unavailable.
- `UNTRUSTED`: the frozen record failed local checks, so nothing was fetched.

## Boundaries

- Drift is a byte or pointer difference. It leaves malice, vulnerability, and upgrade safety unproven.
- HTTP 404, timeouts, non-UTF-8 bodies, oversize bodies, and refused redirects are unavailability. Unavailability is not a content change.
- A match means these public reads returned the same decoded text at observation time. It is not proof the frozen snapshot was authentic, complete, or published by the rightful author.
- Package URLs are not fetched. Redirect targets are not followed, including same-host redirects, because a browser cannot safely expose the `Location` header and a redirect can change path.
- Requests are HTTPS GET to `api.github.com` and `raw.githubusercontent.com` only. The command sends no token, `Authorization` header, signature, or transaction.
- An empty successful document is a byte difference. A missing response is not.

## Reproduce

From the repository root, with Node.js 22.12 or newer:

```sh
npm ci
npm test
node scripts/drift.mjs --fixture no-drift
node scripts/drift.mjs --fixture tag-moved
node scripts/drift.mjs --fixture notes-changed
node scripts/drift.mjs --fixture document-unavailable
node scripts/drift.mjs --fixture untrusted-url
node scripts/drift.mjs --fixture redirect-refused
node scripts/drift.mjs --demo --replay
node scripts/drift.mjs --demo
```

`--fixture` and `--demo --replay` stay offline. `--demo` performs the live public read of the archived Fastify review. Fixture names are `no-drift`, `tag-moved`, `notes-changed`, `document-changed`, `document-unavailable`, `release-unavailable`, `untrusted-url`, and `redirect-refused`. Every fixture uses the invented repository `example/widget`. None of them is an observation of Fastify or any other public project.

In the app, stay on **Recorded evidence**. The Fastify review loads with no wallet. The **Upstream drift review** panel is under the portable audit panel.

1. Choose **Synthetic: tag moved**. Expect **Drift observed**, repository `example/widget`, tag pointer `CHANGED`, pinned document `MATCH`, and a tip context that is not labeled as a change to the frozen commit.
2. Choose **Synthetic: source 404**. Expect **Read incomplete**, pinned document `UNAVAILABLE` with HTTP 404, and no changed check.
3. Choose **Synthetic: untrusted URL**. Expect **Not fetched**.
4. Choose **Synthetic: redirect refused**. Expect **Read incomplete** and `redirect-refused`.
5. Choose **Synthetic: no change**. Expect **No drift observed**.
6. Choose **Recheck public GitHub**. The browser sends the three public GETs. Record the status that actually appears. On 2026-11-20 the CLI observation was `NO_DRIFT`; a later run can differ, and a match still is not authenticity.
7. **Copy challenge note** only copies text. It does not connect a wallet or send a transaction. Pasting that note into the existing challenge form remains a separate, explicit action.

## Live observation

`public/evidence/drift-observation.json` is the CLI result at `2026-11-20T17:15:51.688Z`.

- Status: `NO_DRIFT`
- Mode: `live-public-read`
- Review: `demo-fastify-v5-upgrade-v1`
- Frozen snapshot digest: `7af4ed36d53e9e1250813fc7421567516986412476eae0eb728cb6a96e6cbbc0`
- Report digest: `0a70e409a3202828c135cd65eb11e55d4b31b6f165b9301d0655facc0682e70b`
- Release body SHA-256, before and after the read: `3c33cbaf0e91b5d4b88f9989221a3bff119bb66033a41a79ba6b80019486303b`
- Pinned document SHA-256, before and after the read: `82a9baee33208bd2f2035bf7ac00b37caef411589de6b2c4a8edce53057bd382`
- Tag `v5.0.0` still resolved to `6bde7d7b0a51010d56df901cab9be5d9351b0d91`

No public upstream change was invented for this file. The synthetic changed, unavailable, and untrusted cases live only in the offline fixtures.

## Static build and GitHub Pages

`npm run build` writes a root-relative bundle to `dist/` for the existing site. `npm run build:pages` writes `dist-pages/` with base `/releaseproof/`. The two builds are separate. This branch does not deploy to `https://releaseproof-genlayer-57.sales136152.chatgpt.site` and does not change its DNS.

The Pages workflow is `.github/workflows/pages.yml`. The published project site is https://ytao7420-cmyk.github.io/releaseproof/, recorded in [Pages](pages.md). Pull requests only run CI. The existing host is a separate deployment.

## What remains separate

A person can paste a challenge note into the existing challenge form. Doing so is a separate action. The drift report is not an on-chain record, and this repository does not submit it to Portal.

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

`npm run build` writes a root-relative Vite bundle to `dist/`. `npm run preview` serves that bundle. This repository does not change the existing public host `https://releaseproof-genlayer-57.sales136152.chatgpt.site`, and this branch does not publish it.

A later GitHub Pages publish can reuse that build. It is not enabled here.

- For a user or organization site served at the domain root, keep Vite's default base `/` and upload `dist/` with a manually dispatched workflow.
- For a project site at `https://<owner>.github.io/releaseproof/`, set Vite `base` to `/releaseproof/` for that publish only. Using that base on the current root host would break asset paths.
- Pages should be triggered by hand, not on every push, until a parent decides to publish.

```yaml
name: pages
on:
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

That workflow is documentation only. It is not installed under `.github/workflows`, and it does not retarget the existing site.

## What remains for a parent

- Browser QA of the recorded-mode panel, using the steps above. No wallet and no transaction are required.
- Decide whether to publish `dist/` and whether that publish is the existing host or a new GitHub Pages site.
- Decide whether a human should paste a drift note into the existing challenge flow. This branch does not do that, does not merge, and does not mark the report as accepted on Portal or on-chain.

# GitHub Pages entry

The project site is published at https://ytao7420-cmyk.github.io/releaseproof/. It is a second public entry. The existing site stays at https://releaseproof-genlayer-57.sales136152.chatgpt.site with root asset paths. This repository does not deploy to that host and does not change its DNS.

## Two public entries

| Entry | Address | Asset base | Publisher |
| --- | --- | --- | --- |
| Existing site | https://releaseproof-genlayer-57.sales136152.chatgpt.site | `/` | Unchanged |
| GitHub Pages project site | https://ytao7420-cmyk.github.io/releaseproof/ | `/releaseproof/` | `.github/workflows/pages.yml` after `CI` succeeds on `main` |

`npm run build` keeps the root base used by the existing site. `npm run build:pages` is the only build that sets Vite's base to `/releaseproof/`.

The Pages source is GitHub Actions. The public Pages API reports `build_type: workflow`, an empty custom domain, and `https://ytao7420-cmyk.github.io/releaseproof/`. The first workflow attempt failed while Pages was not enabled. Attempt 2 succeeded.

## Published deployment

- Workflow: https://github.com/ytao7420-cmyk/releaseproof/actions/runs/44788684011
- Attempt: 2
- Commit: `ca0d328e60f74c67a3761928ca9c14709c6d4658`
- Result: success
- Run window: `2026-11-20T18:14:48Z` to `2026-11-20T18:15:32Z` (44 seconds)
- Jobs: `build project site` and `deploy project site` both succeeded
- The workflow repeats the 78 JavaScript tests and 41 Python tests, builds with base `/releaseproof/`, and uploads only that directory
- Permissions are `contents: read`, `pages: write`, and `id-token: write`. It uses no secrets, does not write the contract, and does not send a transaction

`Pages` does not run for pull requests. It runs after `CI` succeeds on `main`, or when someone starts it by hand from `main`.

## Anonymous read-back

Checked without a browser session or credentials on 2026-11-20:

| URL | HTTP | Bytes |
| --- | --- | --- |
| https://ytao7420-cmyk.github.io/releaseproof/ | 200 | 881 |
| https://ytao7420-cmyk.github.io/releaseproof/assets/index-aLLXtccJ.js | 200 | 614417 |
| https://ytao7420-cmyk.github.io/releaseproof/assets/index-CWj4MntV.css | 200 | 41171 |
| https://ytao7420-cmyk.github.io/releaseproof/assets/ccip-C339ifxa.js | 200 | 2888 |
| https://ytao7420-cmyk.github.io/releaseproof/logo.svg | 200 | 449 |
| https://ytao7420-cmyk.github.io/releaseproof/evidence/demo.json | 200 | 70004 |
| https://ytao7420-cmyk.github.io/releaseproof/evidence/drift-observation.json | 200 | 7317 |
| https://ytao7420-cmyk.github.io/releaseproof/deployment.json | 200 | 655 |
| https://releaseproof-genlayer-57.sales136152.chatgpt.site/ | 200 | separate root site |

The HTML title is `ReleaseProof — Evidence before upgrade`. Its script and stylesheet use the `/releaseproof/assets/` prefix. The JavaScript bundle contains the upstream drift review: `Recheck frozen evidence against public GitHub`, the synthetic fixture buttons, `Copy challenge note`, schema `releaseproof-drift-v1`, and the statement that a match is not proof of authenticity. It loads recorded evidence from `/releaseproof/evidence/demo.json`. The published drift observation is `NO_DRIFT` at `2026-11-20T17:15:51.688Z` (`2026-11-21 01:15:51` Beijing time) for Fastify v5.0.0. The existing site still serves its own HTML and does not reference `/releaseproof/assets/`. Its contract address remains `0xd76aa609ae29461303aBDae59974FbC7aAbC27A7`.

## Browser acceptance on the published site

The published Pages site was checked in Recorded evidence, read only, with no wallet connection and no transaction.

- **Recheck public GitHub** for the recorded Fastify v5.0.0 snapshot: release notes, release record, tag pointer, and pinned document each returned HTTP 200 and matched. Overall status `NO_DRIFT`.
- **Synthetic: tag moved**: `DRIFT`.
- **Synthetic: source 404**: `INCOMPLETE`.
- **Synthetic: untrusted URL**: `UNTRUSTED`, and nothing was fetched.
- **Synthetic: redirect refused**: `INCOMPLETE`.
- **Copy challenge note** copied the note. It did not open a challenge.

These synthetic results use `example/widget`. They are not claims about Fastify. `NO_DRIFT` records that those four public reads matched at observation time. It does not prove the frozen snapshot was authentic, and the report is not an on-chain record.

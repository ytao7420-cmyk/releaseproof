# GitHub Pages entry

**Status: 待验证.** This document describes the additional project site. It has not been confirmed by an anonymous read of a public bundle. The existing site stays where it is.

## Two public entries

| Entry | Address | Asset base | Who publishes it |
| --- | --- | --- | --- |
| Existing site | https://releaseproof-genlayer-57.sales136152.chatgpt.site | `/` | Unchanged. This repository does not deploy to it and does not change its DNS. |
| GitHub Pages project site | https://ytao7420-cmyk.github.io/releaseproof/ | `/releaseproof/` | `.github/workflows/pages.yml`, only after `CI` succeeds on `main` |

`npm run build` keeps the root base used by the existing site. `npm run build:pages` is the only build that sets Vite's base to `/releaseproof/`.

On 2026-11-20 an anonymous request to the Pages URL returned HTTP 404, and the repository field `has_pages` was false. An anonymous request to the existing site returned HTTP 200. Those observations are the pre-publish baseline.

## When the workflow runs

`Pages` does not run for pull requests. It runs when either:

- the `CI` workflow finishes with success for a commit on `main`, or
- someone starts `Pages` by hand from the `main` branch.

A manual start from any other branch is skipped. The job checks out the CI commit when CI triggered it. It repeats the 78 JavaScript tests and 41 Python tests, builds `dist-pages`, and uploads only that directory. It uses `contents: read`, `pages: write`, and `id-token: write`. It uses no secrets and does not write the contract, send a transaction, or call Portal.

## Repository setting required before a public page can exist

The workflow file cannot turn the site on by itself. A repository admin needs to set this in GitHub, after this workflow is on `main`:

1. Open `https://github.com/ytao7420-cmyk/releaseproof/settings/pages`.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Leave the custom domain empty. Do not point `releaseproof-genlayer-57.sales136152.chatgpt.site` at GitHub Pages.

If the first deploy fails because that source was still unset, enable it and run the `Pages` workflow again from `main`. Do not treat a green `CI` run as a published site.

## Anonymous read-back after publish

Replace the asset name with the one in the HTML. A successful page is HTTP 200 on the HTML and on the JavaScript bundle, and the HTML must reference `/releaseproof/assets/`:

```sh
curl -fsS -D - -o /tmp/releaseproof-pages.html https://ytao7420-cmyk.github.io/releaseproof/
grep -o '/releaseproof/assets/[^"]*' /tmp/releaseproof-pages.html
curl -fsS -o /dev/null -w '%{http_code}\n' "https://ytao7420-cmyk.github.io/releaseproof$(grep -o '/assets/[^"]*\.js' /tmp/releaseproof-pages.html | head -n 1)"
```

Until those requests succeed, this entry stays 待验证. The existing site is a separate deployment and is not evidence that Pages is live.

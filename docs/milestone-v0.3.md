# Milestone draft: v0.3 upstream drift review

This is a draft for a later Portal milestone. It was not submitted to Portal. It does not ask for the v0.2 work to be reviewed again.

## Delta from Accepted v0.2

Accepted v0.2, contribution `253615` at commit `7f6290c77d377bb20e565e8dc9b26b937a0f8487`, verifies a portable audit package: export and local import, hash checks in the browser and the Node CLI, citation and acknowledgement history, and a comparison of deployed source bytes with the configured RPC. That comparison reads the contract. It does not read GitHub again.

v0.3 starts after that freeze. It rebuilds the public release, tag, and commit-pinned document URLs from the frozen repository, tag, commit, and path, fetches them with HTTPS GET, and writes a separate report. The frozen snapshot, revision history, and contract records stay in place.

The contract test that rejects disagreeing source reads applies only while the snapshot is being frozen. After capture, the contract does not fetch the upstream again. v0.3 is that later, off-chain re-read.

## What the report may say

- `DRIFT`: a public read returned different release text, release record fields, tag pointer, or pinned-document bytes. A difference leaves malice, vulnerability, and upgrade safety unproven.
- `INCOMPLETE`: a required read was unavailable. HTTP 404, timeout, non-UTF-8, oversize, and a refused redirect are unavailability. They are not edits.
- `NO_DRIFT`: the required public reads matched the frozen text at the observation time. A match is not proof that the frozen snapshot was authentic, complete, or published by the rightful author.
- `UNTRUSTED`: the frozen record failed local checks, so no request was sent.

A person may paste the report note into the existing challenge form. The contract still reconsiders the original frozen sources. The report is not an on-chain source and does not by itself revise a conclusion.

## Evidence

- Application tests: 78 JavaScript tests, including the previous 55 and 23 drift cases. Contract tests: 41 Python tests. The contract source hash remains `9ce594109400f427d16381501d44154e296600d031fd85caebc381c31e88a262`.
- Offline fixtures use the invented repository `example/widget`. They demonstrate change, no change, unavailability, and untrusted URL or redirect boundaries. They are not observations of a public upstream.
- The archived Fastify v5.0.0 snapshot was read from public GitHub at `2026-11-20T17:15:51.688Z`, which is `2026-11-21 01:15:51` Beijing time. The result was `NO_DRIFT`. The file is `public/evidence/drift-observation.json`, digest `0a70e409a3202828c135cd65eb11e55d4b31b6f165b9301d0655facc0682e70b`. No public upstream change is claimed. The match is not an authenticity proof, and it does not say the upstream cannot change later.

## Public entry

The additional site is https://ytao7420-cmyk.github.io/releaseproof/. It was published from `main` commit `ca0d328e60f74c67a3761928ca9c14709c6d4658` by Pages workflow attempt 2, https://github.com/ytao7420-cmyk/releaseproof/actions/runs/44788684011, which succeeded in 44 seconds. Anonymous reads returned HTTP 200 for the HTML, the JavaScript bundle, and the stylesheet. The bundle contains the drift-review controls. The existing site remains https://releaseproof-genlayer-57.sales136152.chatgpt.site. See [the Pages record](pages.md).

Browser use of that published page, in Recorded evidence and without a wallet, saw `NO_DRIFT` for the recorded Fastify v5.0.0 snapshot after four HTTP 200 reads. The synthetic tag-moved case was `DRIFT`, the synthetic document 404 was `INCOMPLETE`, the untrusted URL was `UNTRUSTED` and was not fetched, and the refused redirect was `INCOMPLETE`. Copying the challenge note did not submit a challenge.

## Out of scope

No new contract method or transaction is part of this milestone. The report is not on-chain. This draft has not been submitted to Portal. The existing site address is unchanged, and the Pages site does not replace it.

# ReleaseProof

Verifiable upgrade reviews on GenLayer: freeze official release evidence, evaluate the integration impact, challenge a conclusion, and retain the full revision history.

## Why GenLayer is central

An upgrade review depends on interpreting external documentation, not just comparing version strings. ReleaseProof uses a real Intelligent Contract to fetch GitHub release metadata, resolve its tag to an expected commit, and freeze a migration document from that commit. Validators independently establish the source snapshot and then interpret its impact on the stated application. Runtime, API and deployment conclusions have bounded statuses and original-source citations. A different wallet can challenge a specific revision; a second consensus transaction records a new revision without overwriting its parent.

The interface supports recorded evidence and real Studionet actions, including wallet connection, pending transaction recovery, execution checks, state read-back, source inspection, challenges and creator acknowledgement.

## Deployment

- Network: GenLayer Studionet, chain ID `61999`.
- Contract: `0xd76aa609ae29461303aBDae59974FbC7aAbC27A7`.
- Deployment transaction: `0x61befbdcf30bfcdfdb98787f627d58aa1eb5ea47ba715e504f8e7e316decafc9`.
- Contract source SHA-256: `9ce594109400f427d16381501d44154e296600d031fd85caebc381c31e88a262`.
- Deployer: `0x981Db43295d6Bc605D8977caF27Bdce1D5fFF273` (project-controlled auxiliary test wallet).
- Source: [releaseproof](https://github.com/ytao7420-cmyk/releaseproof).

Deployment execution succeeded with majority agreement; its saved deployment record reports `ACCEPTED`. The final contract completed a six-transaction live workflow through the SDK harness: create, capture sources, assess, challenge, resolve, and acknowledge. At the archive timestamp, four transactions were `FINALIZED` and two were `ACCEPTED`; all six had successful contract execution and majority agreement.

Website: [ReleaseProof](https://releaseproof-genlayer-57.sales136152.chatgpt.site). The build was deployed successfully and public access enabled on 2026-10-16 UTC. See the [validation record](docs/validation.md) for transaction hashes and the distinction between SDK execution and browser checks.

## Reproduce on Windows

Install Node.js 22.12 or newer and Python 3. Clone this repository, then in PowerShell:

```powershell
npm ci
npm run dev
```

Open the printed local URL in Chrome. Recorded mode needs no wallet. Live mode uses MetaMask on Studionet and submits zero-value test transactions. If a transaction times out, use the displayed pending recovery action instead of resubmitting it.

To test or build:

```powershell
npm test
python -m unittest discover -s tests -p "test_*.py"
npm run build
```

`scripts/live-test.mjs` runs the project-operated two-wallet demonstration against the address in `public/deployment.json`. It creates fresh test-only keys in ignored `.local/`, resumes recorded hashes, verifies read-backs and writes a public evidence archive. These actors are controlled by the project; they are not independent reviewers or customers. Never use funded mainnet keys with the test harness or publish `.local/`.

## Demonstration

The preset uses the real Fastify v5.0.0 release and its migration guide pinned to commit `6bde7d7b0a51010d56df901cab9be5d9351b0d91`. The integration context is synthetic: a Node.js 18 service using the old `reply.redirect(301, url)` signature. The challenge is deliberately test input, not a claim endorsed by the project.

The [recorded evidence](public/evidence/demo.json), captured at `2026-10-16T21:56:57.260Z`, shows:

- Runtime and API: `NEEDS_CHANGE`; deployment: `UNKNOWN`.
- A different project-controlled wallet challenged the runtime finding with a false Node.js 18 support claim. Consensus rejected that challenge and retained the original assessment in revision 2.
- The creator acknowledged revision 2. Revision 1, the original source documents, citations and source commitments remained available.
- The harness verified source SHA-256 values, the snapshot digest, revision digest links, exact quoted source spans and acknowledgement read-back.

Initial assessment passed with three agreeing validators, one disagreement and one idle validator. This was majority agreement, not unanimity. Outcomes and transaction states are retained as observed rather than relabeled to match expectations.

## Verification

The contract suite remains **41 Python tests**. The application suite is **78 JavaScript tests**: the 55 v0.2 audit and receipt tests, plus 23 upstream drift tests. Python uses explicit SDK stubs; JavaScript uses receipt fixtures and simulated RPC/wallet providers. The separate live archive demonstrates real network execution. Chrome read-only inspection of the final deployment confirmed revision 2, creator acknowledgement, both revisions, the rejected challenge and unchanged findings. A complete six-step browser write workflow on the final deployment has not been verified; earlier-version browser writes are identified separately in [validation](docs/validation.md).

## v0.2: Portable audit packs

Export or import a complete review archive, independently verify its source hashes, revision links, challenge records and acknowledgements, then compare it with the configured live contract. Offline consistency is not authenticity: a rehashed fabricated package can only be rejected using an independent reference. The online check also verifies the deployed contract source bytes.

The verifier distinguishes package-head acknowledgement from live-head acknowledgement, matches the contract's Python whitespace normalization, and rejects invented resolution fields on pending challenges.

The [audit pack guide](docs/audit-pack.md) includes the CLI and trust boundaries. The [published audit package](public/evidence/audit-package.json) matched the current live contract on 2026-10-19; see [the read-only RPC result](public/evidence/audit-check.json). This release changes the application and verification tooling; the existing contract is unchanged.

## v0.3: Upstream drift review

A frozen snapshot stays frozen. Drift review reads the current public GitHub release, tag, and commit-pinned document, then writes a separate report. It can show that a tag now points at another commit, that release notes or the pinned document bytes differ, or that a read was unavailable. HTTP 404, timeouts, and refused redirects stay unavailable; they are not edits. A match records the same text at observation time and is not proof of authenticity. A difference is not a finding of malice or a vulnerability.

The browser panel works in recorded mode with no wallet. The same checks run from the CLI. Synthetic fixtures use the invented repository `example/widget`. The one live observation of the archived Fastify snapshot, taken at `2026-11-20T17:15:51.688Z`, was `NO_DRIFT`. That file is [drift-observation.json](public/evidence/drift-observation.json). It does not claim Fastify is unchanged forever, and it does not replace the accepted audit package.

```sh
node scripts/drift.mjs --fixture tag-moved
node scripts/drift.mjs --demo --replay
node scripts/drift.mjs --demo
```

No token, contract write, or deployment is involved. The existing contract address is unchanged. See [the drift review guide](docs/drift-review.md) for the parent QA path, trust boundaries, and a GitHub Pages build plan that leaves the current public host alone.

## Limits

This is an advisory prototype. It does not prove package authenticity, inspect application source, execute a migration, certify safety or control deployment. The three dimensions can remain UNKNOWN when evidence is insufficient. Validators independently derive decisions and check the proposed source citations semantically; they do not agree on free-form reasoning text. Model disagreement can prevent completion.

A challenge reconsiders the same frozen evidence; it cannot add new sources. Any other wallet can consume the three challenge slots, and a pending challenge blocks acknowledgement until resolved. There is no anti-griefing guarantee or expiry. Different wallets do not establish independent people. Only public source material and synthetic integration contexts should be submitted; contract state is public.

See [architecture](docs/architecture.md) for source binding, consensus and revision semantics. Local stub tests do not substitute for network execution or prove model accuracy.

## License and attribution

ReleaseProof code is MIT licensed. The demonstration preserves Fastify source documentation under its MIT license; see [Fastify attribution](docs/FASTIFY-LICENSE.txt). GenLayer and Fastify are upstream projects, not endorsers of this application.

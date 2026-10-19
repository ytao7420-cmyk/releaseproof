# ReleaseProof v0.2: portable audit packages

## New capability

The accepted v0.1 workspace could display chain records and compare revisions, but an independent reviewer could not export a self-contained review or verify a received package. v0.2 adds JSON export/import, a browser verifier and the same verifier as a Node CLI. A live comparison checks the configured deployed source hash, review identity, frozen evidence, revision prefix, challenge records and acknowledgement membership. No wallet, signing, new deployment or change to existing contract records is required.

The local verifier recomputes source, snapshot, revision and package hashes; checks original citation spans, parent links, deterministic verdicts, challenge targets and resolutions, pending pointers and acknowledgement bounds. It accepts assessed records with at most four revisions and packages up to 2 MB.

## Reproduce

1. Open the public workspace and select the recorded Fastify review.
2. At **Portable evidence**, choose **Export current review**.
3. Import the downloaded JSON. Expect **CONSISTENT**, two revisions, two sources, one challenge, package revision acknowledged.
4. Choose **Compare with live contract**. The recorded example currently matches the configured Studionet contract. Later valid state additions produce **HISTORICAL MATCH** instead of claiming the old package is current.
5. Change a citation quote or source text in a copy and import it. Verification must reject the modified content.
6. Run the CLI offline and optionally perform read-only RPC comparison:

```sh
npm test
node scripts/audit.mjs audit.json --export-demo
node scripts/audit.mjs audit.json
node scripts/audit.mjs audit.json --online
```

`--export-demo` writes the caller-named output file. The browser import remains local. Online checks send only the review ID to the preconfigured RPC, never arbitrary URLs or credentials from an imported package. The contract source is read from that same configured address.

## Trust boundaries

- **CONSISTENT** establishes internal structural and cryptographic consistency only. An attacker can rewrite a bundle and all of its hashes together. This is not a signature or proof that the source existed on-chain.
- **CURRENT_MATCH** establishes equality with the current records returned by the configured RPC and matching deployed source bytes at observation time. **HISTORICAL_MATCH** establishes the included immutable history and acknowledgement claims are present, while the live record has progressed.
- RPC reads are not an independently verified state-root or validator-signature proof. A malicious RPC can misrepresent data. No multi-RPC quorum claim is made.
- Neither check proves upgrade safety, scientific truth, correctness of the LLM interpretation, or successful installation. Existing contract limitations remain.
- The fixture contains public upstream materials and synthetic integration details. Demonstration wallets are project-controlled.

## Validation evidence

Tests include real recorded data, recomputed-hash forgery, changed live code, invented citations, stale acknowledgements, wrong network/contract, reordered revisions, missing/duplicate challenges, changed counterclaim and bounded parser cases. See `public/evidence/audit-check.json` for the actual read-only RPC comparison result and `public/evidence/audit-package.json` for the reproducible package.

Validation on 2026-10-19: all 55 JavaScript tests passed; production build succeeded. Chrome exported the recorded review, imported the saved package, displayed CONSISTENT, then completed a real read-only RPC comparison and displayed CURRENT MATCH (two revisions, two sources, one challenge, latest revision acknowledged). Contract Python code is unchanged from the accepted project.


## Review fixes included in the final v0.2 build

- Package revision and its acknowledgement are reported separately from the live current revision and its acknowledgement. An older acknowledged package cannot imply a newer live revision was acknowledged.
- Counterclaim digests reproduce Python `str.split()` whitespace semantics, including U+0085 and U+001C–U+001F, while retaining U+FEFF. This avoids rejecting legitimate on-chain Unicode counterclaims.
- Pending challenges must target the package head and contain the contract's exact empty resolution defaults: empty outcome/reason/citations and resolution revision zero. A fabricated pending adjudication cannot receive a historical RPC match.

Nine regression tests cover these fixes, including a formerly accepted fabricated pending decision, valid pending-to-resolved history, distinct historical/live acknowledgement states, and Unicode normalization. The final read-only CLI comparison is recorded in `public/evidence/audit-check.json`; it includes both package and live acknowledgement fields. No contract write or redeployment was needed.

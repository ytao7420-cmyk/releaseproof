# ReleaseProof architecture

ReleaseProof is a public, advisory record of dependency-upgrade reasoning. It does not install packages, block deployments, hold funds, or certify software as safe.

## Trust problem

A release announcement can change, a tag can point somewhere unexpected, and one reviewer's explanation can omit relevant migration details. ReleaseProof separates where evidence came from, what the validators concluded, and which revision a project owner acknowledged.

## Evidence capture

The review freezes repository, release tag, expected commit SHA, migration-document path, and integration context. The capture transaction independently fetches:

1. GitHub's release-by-tag API.
2. The Git ref and any bounded annotated-tag chain.
3. The migration document at the verified full commit SHA on raw.githubusercontent.com.

The expected commit must match the tag's resolved commit. The canonical snapshot retains release identity, body, resolved commit, source URLs, text and SHA-256 digests. Mutable counters are excluded. Oversized or unavailable documents produce explicit failure, not an assertion of compatibility. GitHub hosting establishes the named repository's content, not the legal identity of its authors.

## Two consensus phases

Capture establishes agreement on a normalized evidence snapshot. Assessment operates on those frozen bytes, so a release-note edit between model calls cannot silently change the question.

Each validator independently evaluates runtime, API and deployment impact. Bounded statuses are NEEDS_CHANGE, NO_CHANGE and UNKNOWN. Source citations reference the frozen source ID and line numbers; code reconstructs quoted text and computes the overall advisory verdict. Free-form explanation is not used to decide equivalence. A positive or negative conclusion without adequate source support must not become an invented fact.

Consensus compares independently generated dimension statuses. A second validator prompt checks whether the proposed original-source citations support those statuses in context; it must return explicit true booleans for all required checks. Challenge resolution additionally requires independently matching outcomes and validates the challenge citations. Different valid source selections may agree. Free-form explanation wording is not agreed. Model disagreement can still prevent completion; a failed transaction must be inspected rather than presented as a completed review.

## Revision and challenge model

An initial assessment creates revision 1. A different wallet can challenge a particular revision with an explicit explanation. The challenge binds the base revision and digest. Only one challenge is pending at a time, with a bounded lifetime count per review. Resolution is permissionless and runs a new independent consensus assessment against the original context and frozen sources. It creates an append-only revision linked to its parent and records whether the challenge was upheld, rejected or inconclusive.

Acknowledgement is a separate action by the review creator, tied to an exact revision number. It records a human decision; it does not elevate an AI finding into a software-safety guarantee. Wallet distinction is not proof that two people are independent.

This prototype has a known public-participation limitation: another wallet can consume its three challenge slots, and a pending challenge blocks acknowledgement until resolution. There is no expiry or economic deterrent. Do not use it as a release gate or claim resistance to hostile participation. Rejected and inconclusive challenges retain the previous findings byte-for-byte while appending the resolution record; an upheld challenge must change at least one dimension status.

## Browser transaction lifecycle

The application selects MetaMask via EIP-6963, confirms chain61999, and submits zero-value Studionet transactions. It records each pending hash before waiting, distinguishes consensus acceptance from successful VM execution, reads back the expected contract state and supports resuming pending transactions after refresh. Recorded evidence is visibly distinct from live network data.

A FINALIZED lifecycle label alone is insufficient: Studio can finalize a MAJORITY_DISAGREE outcome. The application checks the consensus result, execution receipt and resulting contract state. Historical acknowledgements remain recoverable when later revisions have also been acknowledged.

## Test boundaries

Local stub tests exercise state transitions, input normalization, provenance binding, citation structure, disagreement and access rules. They do not prove model accuracy or actual network consensus. Live evidence records real transaction hashes, execution outcomes, votes and contract read-backs. Any auxiliary actors used by the project are labeled self-controlled test wallets.

## Sources

- [GenLayer SDK API](https://sdk.genlayer.com/v0.2.9/api/genlayer.html)
- [GenLayer equivalence principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)
- [GitHub Releases API](https://docs.github.com/en/rest/releases/releases)
- [GitHub Git references API](https://docs.github.com/en/rest/git/refs)
- [GitHub annotated tags API](https://docs.github.com/en/rest/git/tags)
- [Fastify v5.0.0](https://github.com/fastify/fastify/releases/tag/v5.0.0)

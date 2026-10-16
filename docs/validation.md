# Validation record

## Local checks

**41 Python tests and 22 JavaScript tests passed.** Commands:

```sh
python3 -m unittest discover -s tests -p 'test_contract.py' -v
npm test
```

Contract rules are tested with explicit GenLayer stubs, including source identity and tag binding, hash reconstruction, immutable snapshots, citation bounds, disagreeing validators, challenge ownership/staleness, historical preservation and acknowledgements. Regression cases accept different valid citation selections only after a separate substantive evidence check and reject unsupported citations despite matching status labels. Challenge normalization is tested repeatedly to ensure the leader/validator/re-read transformation preserves the result; incomplete top-level challenge output remains an error. These tests do not execute real GenVM, models or HTTP sources, and do not establish live model quality.

The browser chain module is tested with simulated RPC/wallet providers for failed execution, consensus disagreement, pending recovery, historical acknowledgements and account changes. A regression reproduces successful execution followed by a transient read-back failure, then recovers the saved transaction even after a newer revision is acknowledged. Recovery checks the historical acknowledgement list and never sends a duplicate transaction. The receipt parser requires successful execution evidence; a finalized lifecycle status alone is insufficient.

## Final deployment and live workflow

The final deployed source SHA-256 is `9ce594109400f427d16381501d44154e296600d031fd85caebc381c31e88a262`.

- Network: GenLayer Studionet, chain `61999`.
- Contract: `0xd76aa609ae29461303aBDae59974FbC7aAbC27A7`.
- Deployment: `0x61befbdcf30bfcdfdb98787f627d58aa1eb5ea47ba715e504f8e7e316decafc9`.
- Auxiliary deployer: `0x981Db43295d6Bc605D8977caF27Bdce1D5fFF273`, controlled by this project.
- Deployment manifest: [deployment.json](../public/deployment.json), reporting `ACCEPTED` and `MAJORITY_AGREE` at its observation.
- Evidence archive: [demo.json](../public/evidence/demo.json), recorded at `2026-10-16T21:56:57.260Z`.

The SDK harness completed all six workflow transactions against this final contract. Every row below records `execution: SUCCESS`, `consensusResult: MAJORITY_AGREE`, and `leaderOnly: false`. Statuses are the archived observations, not assertions about their later lifecycle.

| Action | Transaction hash | Archived status | Votes: agree / disagree / idle |
| --- | --- | --- | --- |
| Create review | `0x953ccbdc8a7433d0d19f25006d42ddd6d522d8fda0c43c322e0dd6c2ba521b96` | FINALIZED | 3 / 0 / 2 |
| Freeze official sources | `0x4f33c1c47bbf2b00715b9f7b9a263cb2445c505f5925634f143fb631f838ccbe` | FINALIZED | 3 / 0 / 2 |
| Assess integration | `0xb2ba22b13b7a333cfa1a0b9990f0650671c45ef5f992163456e650ae1fc1ffda` | FINALIZED | 3 / 1 / 1 |
| Open challenge | `0xd4a42d48dd6cd7dcb71b38f3cc8c4974672375e6b0f1eed58cd337befe7bb78a` | FINALIZED | 5 / 0 / 0 |
| Resolve challenge | `0xc034be59a5b1a79d4eaca97da65b3dda54f7311de3522ca3a73c194e95b9b053` | ACCEPTED | 3 / 0 / 2 |
| Acknowledge revision | `0xcfcd5876b7a4726b6a65781cc1a41b83dc954401f826845499f028481fff2621` | ACCEPTED | 5 / 0 / 0 |

An idle validator is not an agreeing vote. The initial assessment's explicit disagreement remains in the archive; no unanimity claim is made.

The review `demo-fastify-v5-upgrade-v1` uses the upstream Fastify v5.0.0 release and `docs/Guides/Migration-Guide-V5.md` at commit `6bde7d7b0a51010d56df901cab9be5d9351b0d91`. It records `NEEDS_CHANGE` for runtime and API and `UNKNOWN` for deployment. The challenge `demo-fastify-v5-node18-claim-v1` was `REJECTED`. Revision 2 preserves the original assessment, links to revision 1, and is acknowledged by the creator. Both workflow actors are project-controlled test wallets:

- Creator: `0x38607De3D292Ebdf2836106BDd1bd26CfE33b1Cb`.
- Challenger: `0xBB2a56ff52CaAd90FF3f4ED496e25f3ffe864525`.

The harness recomputed these commitments from the exact archived text and canonical JSON:

| Commitment | SHA-256 |
| --- | --- |
| Release notes text | `3c33cbaf0e91b5d4b88f9989221a3bff119bb66033a41a79ba6b80019486303b` |
| Commit-pinned migration document | `82a9baee33208bd2f2035bf7ac00b37caef411589de6b2c4a8edce53057bd382` |
| Frozen snapshot | `7af4ed36d53e9e1250813fc7421567516986412476eae0eb728cb6a96e6cbbc0` |
| Revision 1 | `4fbf8ec385ae905214a0247e96887b09543c5dbb06b72094851e2d576974cd9b` |
| Revision 2 | `42ed7f5e602f15fdb3114757c8a7890b3e4f88fcda9a9f3e2304d006f3c3d920` |

It also checked that revision 2's parent equals revision 1's digest, each displayed quotation is the exact source span selected by its line IDs, and acknowledgement state reads back as revision 2. These checks establish integrity of the observed record, not factual accuracy of every model judgment.

## Browser and publication status

The six-step final workflow above was executed through the SDK harness. A live Chrome read-only inspection of the final contract confirmed revision 2, creator acknowledgement of revision 2, both historical revisions, the rejected challenge, the parent digest and unchanged findings in the revision comparison. The local inspection evidence is `artifacts/releaseproof-revision-proof.png` in the task workspace.

No browser write transaction was sent to this final deployment during that inspection. A complete six-step Chrome/MetaMask write workflow on the final deployment has **not** been verified in this record. Earlier-version connection, review creation and citation highlighting are documented below and must not be presented as final-deployment browser write coverage.

The production build was deployed successfully and public access enabled on 2026-10-16 UTC: `https://releaseproof-genlayer-57.sales136152.chatgpt.site`. The recorded-evidence mode on the final local build was also inspected in Chrome and matched the live revision 2 and acknowledgement state.

## Development failure that informed the final design

An earlier contract at `0x23eae0bb66f5A32e1Eef4F4E01165a64d60E5d2f` successfully created the review and captured official sources, but assessment transaction `0x340dfc5af789b9b4c078a3e89c00552bb0cedd56148a714306df9602764358c3` failed to reach agreement. The leader executed successfully, while three validators disagreed and two were idle. The transaction was initially UNDETERMINED and later FINALIZED with `result_name: MAJORITY_DISAGREE`. It is **not** a successful assessment.

That version required identical source-line selections, making equivalent findings vulnerable to citation-selection differences. The replacement retains independent status/outcome derivation and adds a separate semantic check of proposed original-source citations; it no longer requires identical valid citation sets. This is a liveness improvement, not proof that every future model review will agree.

The original contract source SHA-256 was `7be21f5041424f8ce20833223924d54998deaf7b5b8efb5846de14c6cf60a0bd`. The live application's deployment manifest identifies the replacement source and contract. Different citation selections were a diagnosed liveness risk, but individual independent model answers were not exposed by the failed receipt, so that risk is not asserted as the only cause of every disagreement.

A second version at `0xfE49aEfA5098b13e2250E211Bb001772a1d5b7af` passed source capture and initial assessment but failed challenge resolution at `0xa82f1ffcec7caf556310c13a45ec9985b31da12693ecf0382486d73ab3af1cdc`. Across leader rotations the observed errors included invalid challenge outcome and a citations-array schema error. Raw model outputs were not retained, so the precise malformed values are unknown. The prompt combined an initial-assessment output instruction with a different challenge-output instruction. The final version uses a dedicated challenge prompt with one complete schema, explicit array bounds and the same strict evidence checks. Valid-result repeated normalization is covered by a regression test.

During local browser QA on that earlier version, MetaMask connection and review creation succeeded (`0x67a3bd640c7ba7664af51cc30ccdf45514646b69d1face1cf4435bb3877db816`). Clicking a runtime citation opened the commit-pinned source and highlighted the original lines. These earlier checks are recorded separately from the final deployment's end-to-end archive.

## Evidence boundaries

The application contains public upstream evidence and a synthetic integration scenario. Both demonstration wallets are controlled by this project. A completed test establishes observed behavior at the recorded time, not independent adoption, commercial usage, a security audit, an accepted contribution or a payout.

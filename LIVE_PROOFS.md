# StudioNet proof

[Contract address](https://explorer-studio.genlayer.com/address/0x50809c3c04e7713F15968bE7e419A191B138cFe5) ·
[Pinned source](https://github.com/stoneforger10/prose-resource-bank/blob/11cb37e9fb1f6d66317c6c3604fde2de267a21c9/contracts/ProseResourceBank.py) ·
[Pinned specification](https://github.com/stoneforger10/prose-resource-bank/blob/11cb37e9fb1f6d66317c6c3604fde2de267a21c9/fixtures/bank.json) ·
[Receipt and state journal](PROOFS.json)

The seven transactions finalized with `MAJORITY_AGREE` and recorded validator execution. The deliberately unsafe request finalized with a GenVM `ERROR` and committed no state. Both job controllers were temporary accounts funded by the StudioNet test faucet.

| Transaction | GenVM result | Verified outcome |
| --- | --- | --- |
| [Deploy](https://explorer-studio.genlayer.com/tx/0x60170f1cfd6e78eb008be4381faa40e86dae9558a693ba2dd56e3945db9c82f7) | `SUCCESS` | Deployed source matched the pinned source. |
| [Open bank](https://explorer-studio.genlayer.com/tx/0xcffe7c5c6599f471e20da5bfba2d4d9daab77f2f5ce4f5fcfb584a891060c578) | `SUCCESS` | Validators agreed on capacity `[3,2]` and maxima `[[3,2],[2,2]]`. The returned source text matched the pinned fixture. |
| [A requests `[1,1]`](https://explorer-studio.genlayer.com/tx/0xf4a4c8a6a44a0480a5869d7423e2115b5ff58ce27aa7e8dfd3de59c757d81405) | `SUCCESS` | Granted. Free units `[2,1]`. Safe order A, B. |
| [B requests `[1,1]`](https://explorer-studio.genlayer.com/tx/0x5f0d8a23d0f58205043c93367d33abddfd839236cd16ceec9d18ae0537e10b52) | `ERROR` | Rejected because the tentative state has no safe order. Holdings and free units were unchanged. |
| [A finishes](https://explorer-studio.genlayer.com/tx/0x768c3945ee552ae904db830bbda702ae4825ac1da07c0a47575ef232d4f7387e) | `SUCCESS` | Released `[1,1]`. Free units `[3,2]`. |
| [B requests `[1,1]` again](https://explorer-studio.genlayer.com/tx/0x727e1847dae05c794923ecd57a87ac1c9043d323a75c71166a3afd28d1301e25) | `SUCCESS` | Granted. Free units `[2,1]`. Safe order B. |
| [B finishes](https://explorer-studio.genlayer.com/tx/0x976e81c95ec1352eccdcdc418f96780229c886fa8c2d4640eecf48d2f998313f) | `SUCCESS` | Released `[1,1]`. Free units `[3,2]`. Both jobs are closed. |

Bank key `c6f1f016d7f3a0d15fddc6e6d7bd29aff782b9cbefe2b8c67c358616ffd4d7fe`

Fixture SHA-256 `beff26ae8d645748e747000b04d8ced4aa2a382767181e0c21b1c5deca8b2fc6`

Deployed source SHA-256 (LF-normalized) `e8899ac04dc17c81e142667762b31ed1203f89f564f4f768e348a9d22f4a68f5`

Recheck receipts, deployed source, exact specification and final state using `npm ci` and `node scripts/live.mjs --verify-only`. Earlier state snapshots were captured immediately after each corresponding finalized transaction.

Local verification passed GenVM lint and four tests. The exhaustive test checks all 961 allocation states for two resources of capacity two and two jobs against an independent enumeration of completion schedules.

# ProseResourceBank — Deadlock Avoidance from Published Resource Claims

**Contribution type** Builder → Intelligent Contracts

ProseResourceBank admits requests to a shared pool of modeled resources. Each bank binds a published resource specification to a roster of job controllers. Those controllers can request units, inspect the safe completion order, and return their allocations by finishing their jobs.

GenLayer's leader and validators independently fetch the commit-pinned specification and verify its SHA-256. Each extracts the stated capacities and per-job maximum claims from the full prose. Validators compare the exact canonical result, including every capacity and claim. Those numbers determine what the bank can grant. If validators disagree, the interpretation does not commit. An agreed `UNKNOWN` result blocks allocation.

Before granting units, the contract simulates the request and checks for a safe completion order with the Banker's algorithm. The example specification gives jobs A and B access to three lathe units and two kiln units. After A takes one of each, B's identical request fits the free pool but would leave both jobs short of a kiln unit. The bank refuses it. Once A releases its allocation, B can make the same request successfully.

The demonstration uses synthetic resource units. The bank enforces accounting and deadlock avoidance under the agreed claims. Physical availability and real job completion are outside the model.

Seven finalized StudioNet transactions demonstrate specification consensus, the unsafe-request rejection with unchanged state, the successful retry after release, and restoration of the full pool. The deployed source matched the pinned GitHub source. GenVM lint and four local tests passed, including 961 allocation cases checked exhaustively.

[GitHub repository](https://github.com/stoneforger10/prose-resource-bank) ·
[StudioNet deployment](https://explorer-studio.genlayer.com/address/0x50809c3c04e7713F15968bE7e419A191B138cFe5) ·
[Live proofs](https://github.com/stoneforger10/prose-resource-bank/blob/main/LIVE_PROOFS.md)

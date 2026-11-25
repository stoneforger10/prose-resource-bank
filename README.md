# ProseResourceBank

An Intelligent Contract for deadlock avoidance in a finite pool of modeled resources. A commit-pinned JSON document provides resource and job names plus a natural-language specification of total capacity and maximum simultaneous job claims.

## How it works

On first registration, the leader and validating executions independently fetch the committed document, verify its SHA-256, parse its rosters, and ask an LLM to extract capacities and maximum claims in roster order. The validator accepts only an exact match on the full observation and canonical interpretation. A consensus-agreed `UNKNOWN` result stays readable and cannot grant resources.

Each bank binds the immutable specification to a roster of controllers. Any caller can register a bank. Only the controller assigned to a job can request units for it or finish it. For each request, the contract takes the proposed allocation and uses the Banker's algorithm to find a completion sequence. A request that fits the free pool can still fail if it would strand all remaining jobs. Finishing a job frees its allocation and closes that job. Reopening the same bank returns the original key and preserves its state.

## Contract calls

| Call | Result |
| --- | --- |
| `open_bank(coordinate, sha256, controllers_json)` | Bank key. Use `owner/repo/<40-character-commit>/path.json` and one distinct address per job. |
| `get_specification(key)` | Pinned URL, exact source text, parsed document, and agreed interpretation. |
| `get_bank(key)` | Controller roster, holdings, finished flags, free resources, and safe order as zero-based job indices. |
| `request(key, units_json)` | Safe order after the accepted allocation. Requests are vectors in resource roster order. |
| `finish(key)` | Units released by the caller's completed job. |

Each bank supports up to four resources and four jobs. Its units are bookkeeping entries. The safety guarantee applies to the committed specification and assumes jobs can finish within their declared maximum and voluntarily release their holdings. Model agreement does not guarantee extraction accuracy or establish real-world inventory.

## Example

The fixture declares three lathe units and two kiln units, with maxima of `[3,2]` and `[2,2]` for jobs A and B. A can take `[1,1]` first. B's `[1,1]` request would leave `[1,0]` free, with both jobs still needing a kiln unit to reach their maxima. The bank refuses the request. After A finishes, B can take the same units.

Run `python -m pytest tests -q` after installing `requirements-dev.txt`.

[Submission](SUBMISSION.md) · [StudioNet proof and receipt links](LIVE_PROOFS.md)

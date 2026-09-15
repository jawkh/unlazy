# Token economy

Spend model attention on implementation and judgment. Move repeated, deterministic verification into commands and keep orchestration context narrow.

## Keep enforcement cheap

- **Use runnable checks.** External command execution does not itself require model inference. The agent still spends context on the command, returned output, failure interpretation, and evidence review.
- **Cap evidence.** Store the resolved environment facts and decisive output, not a full build log.
- **Keep the Stop hook scan-only.** The hook itself does not call a model. A block causes another agent continuation, which does consume model work, so keep the six-block no-progress guard and make each block actionable.
- **Use sequential checks by default.** Raise `--jobs` only for independent checks when wall-clock savings justify harder failure diagnosis.

## Keep contexts focused

- Give a leaf the shared contract and its own ledger, not the driver's transcript or unrelated leaf outputs.
- Keep `SKILL.md` limited to the core workflow. Load method, gate, orchestration, and parallel references only when the selected mode needs them.
- Append events to `status.log`. Do not repeatedly regenerate a large plan when one line records the event.
- Summarize a long command result into decisive evidence while retaining the full log outside the prompt when debugging needs it.

## Spend stronger reasoning on leverage points

Use capable reasoning and enough effort for the actual uncertainty in:

- contracts and architecture
- security and compatibility boundaries
- branch integration
- manual high-risk gates
- interpreting verification failures and disputed evidence

Running an established check or reading its result does not by itself require
another frontier reviewer. Respect user model choices and runtime-resolved
preferences; verify supported overrides before using them. Use lower-effort or
faster execution for mechanical transformations only after the pattern and gates
are fixed and the same quality bar can be met.

Give reasoning models the outcome, constraints, source context, and evidence
contract rather than a script for their internal thinking. Use a qualified
different family when independent judgment is worthwhile. Do not require
maximum effort, model diversity, or multiple reviews on every leaf.

## Avoid false economy

Do not save time by skipping approval, negative controls, parent re-verification, or integration gates. Those checks exist because a fast false completion costs more than a direct failure.

Proactively orchestrate sizeable independent work when overlap or separate
judgment outweighs coordination cost. Keep small, coupled work direct. Stop at
the completed contract, not at the point where no further improvement is
imaginable.

## Measurement claims

Earlier unlazy documentation gave exact token and effort ratios from a six-run exploratory comparison. The raw prompts, traces, outputs, and scoring records are not present in this repository, so those numbers are not reproducible here. Do not use them as product guarantees. A protocol for a future reproducible rerun is in [../research/validation-protocol.md](../research/validation-protocol.md).

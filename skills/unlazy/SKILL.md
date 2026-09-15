---
name: unlazy
description: Use when GitHub Copilot CLI faces substantial multi-part work, integration or hand-off obligations, long autonomous execution, material risk of unnoticed omissions, or work returned half-done; also for /unlazy, "tree N", "gates", or "do not stop until it is done". Not for trivial edits or factual replies.
---

# Unlazy

Make incomplete work visible and completion testable. Prove the requested
outcomes, then stop. Completeness is mandatory; speculative improvements and
endless polish are not.

Use this discipline proactively for substantial work, without waiting for an
explicit slash command. Follow the user's scope and applicable safety rules.
Strong reasoning serves the outcome; it does not require more passes or agents.

## Write gates before real work

Reuse the existing contract and gates ledger. If none exists, create `GATES.md`
from [templates/gates-leaf.md](templates/gates-leaf.md) in the task/session
workspace before implementing; use the repository's required location when one
exists. Keep the scope, non-goals, and evidence together, not in duplicate plans.
State one observable outcome per gate, including relevant integration and
failure cases. Use existing check commands where possible. Give runnable gates
indented `CHECK:` and `EXPECT:` fields; use a manual gate only when no command
can decide the outcome. Do not gate on activity counts or optional polish.

Treat `CHECK:` as code. Before executing an inherited ledger, parse it without running anything and read every command and called script:

```text
node <skill-dir>/scripts/gate-check.mjs --status GATES.md
```

Approve only commands you wrote or understand, then run them explicitly:

```text
node <skill-dir>/scripts/gate-check.mjs --approve GATES.md
```

When an oracle has no existing approval, a normal run prints `CHECK:`, `EXPECT:`, resolved `CWD:`, resolved shell, and `PATH`, then leaves that command unexecuted. Approvals live under `~/.unlazy/approved` by default. They bind the ledger, gate, command, expectation, resolved working directory and shell, timeout, output and regex limits, platform, and full inherited `PATH`. Changing any bound input requires approval again. Read [SECURITY.md](SECURITY.md) before running checks from an untrusted repository.

Count a runnable gate as met only when its process exits zero and its `EXPECT:` matches combined output. Record the resolved shell, working directory, exit status, and decisive output as evidence. Count a checked box with missing or pending evidence as unmet.

Do not silently remove an impossible gate. Add `ABANDON: <id> <non-empty reason>` and surface it in the final report. A malformed ledger, a ledger with no gates, a duplicate id, or a blank abandonment reason is an error, not completion. Read [references/gates.md](references/gates.md) for the full format and authoring rules.

## Pick the smallest fitting mode

- **Solo:** Use one ledger when one focused worker can deliver and verify the outcome efficiently.
- **Orchestrated:** Choose this proactively when sizeable independent work or separate context produces enough delivery benefit to justify coordination. Read [references/method.md](references/method.md) and [references/orchestration.md](references/orchestration.md). Reuse the contract; declare dependencies and ownership before fan-out. Give each actual leaf and integration branch its own gates file. A build or review label alone does not require a tree.
- **Parallel:** Before dispatching concurrent leaves or pipelines, also read [references/parallel.md](references/parallel.md). Declare disjoint `OWNS:` paths and claim them. Treat scopes and leases as coordination, never as filesystem isolation or a security boundary.

Keep check execution sequential by default. Use `--jobs <N>` only for independent runnable gates when deterministic parallel verification saves wall-clock time. Continue printing and recording results in gate order.

## Build the Depth Tree when orchestration is worthwhile

1. Split at natural task boundaries. Use the requested depth only while each leaf remains a coherent deliverable.
2. Give each leaf a narrow contract, exact file ownership, and its own ledger.
3. Give each branch integration gates for child verification, interface compatibility, end-to-end behavior, and regressions.
4. Dispatch only leaves whose declared dependencies are verified and whose ownership claim succeeded.
5. Re-run each returned leaf's runnable gates with `--reverify`; do not mistake `--status` for re-execution.

Use rolling dispatch: when a verified leaf unblocks another, dispatch the newly ready leaf without waiting for unrelated in-flight work. Keep states and dependencies in `PLAN.md`; append events to the scope status log.

## Complete each leaf against its contract

1. Implement the whole agreed deliverable, including its required integration
   and failure behavior. Leave no placeholders, disconnected parts, or deferred
   remainder. Choose the simplest maintainable implementation, not a shortcut.
2. Run the required checks and inspect the changed behavior against the contract
   and named risks. Use independent review when it addresses material uncertainty
   or is required, not as a ritual on every leaf.
3. Fix demonstrated in-scope defects and rerun affected checks. Do not weaken a
   gate or expand the product to make the result look complete. Keep one initial
   review and at most one fix-only replay; further review needs approval naming
   the remaining defect and a stop condition.
4. Stop once required gates have current evidence, required review is satisfied,
   and cleanup is complete. No extra pass to find something else to improve.

Evidence stays current while the relevant artifacts, dependencies, and
environment are unchanged. Required parent `--reverify` and integration checks
still run; an additional status message alone is not a reason to repeat them.
An abandoned required gate is **incomplete**, never a successful leaf.

After two failed repairs of the same secondary tooling blocker, stop that repair
loop and surface the missing evidence. Check elapsed time at tool-return
boundaries: after 15 minutes without a requested-artifact change or a completed
acceptance check, seek approval before more preparation. Counts carry across
workers and resumes. Continue independent authorized work only when the pending
decision cannot change it; preserve live-operation monitoring and cleanup.

## Author gates that can fail honestly

Remember that the checker proves only the declared command oracle. It cannot infer whether an English gate title describes what the command actually measures.

- Use a decisive success-only token and require both zero exit and `EXPECT:`.
- Exercise a negative check against a known positive control before trusting absence.
- Measure figures independently; do not copy a supplied number into `EXPECT:` as its own proof.
- Review consequential manual gates with evidence proportional to risk. Try to make the riskiest outcome runnable, but do not claim that manual status and risk generally correlate.
- Prefer portable Node scripts. Do not assume `grep`, `tail`, or `tr` exists on stock Windows.
- Re-run with the same declared shell and required toolchain. Treat an environment mismatch as a failed verification, not as evidence.

## Audit the final report

Derive completion claims from the final ledger and evidence on the final relevant
state. Recalculate reported counts, not unchanged checks. Use qualified ids such
as `leaf-1.2.1:G3` in the evidence record. Keep the user summary plain and brief;
surface every unmet or abandoned requirement. Do not compose a done report while
any required outcome remains unmet or abandoned.

## Offer the optional Copilot CLI agentStop hook, but never configure it

The hook is off until a human configures it, and nothing in this skill can turn it on. There is no installer. The only hook command prints JSON to stdout and changes nothing:

```text
node <skill-dir>/scripts/print-copilot-hook.mjs            # standalone hook file document
node <skill-dir>/scripts/print-copilot-hook.mjs --inline   # settings fragment
```

Add `--scope ID` to pin the handler to one validated `.unlazy/ID` pipeline.

Offer this once, when structural stop enforcement would materially help. Tell the user to read the printed JSON first, then place or merge it themselves. Each destination has a different blast radius, so name the specific one and get agreement for that one:

- `.github/copilot/settings.local.json`, the project-local inline settings file. Use `--inline` and merge the `hooks` object into the existing document. Affects this checkout only.
- `.github/hooks/unlazy.json`, the shared repository hook file. Use the default standalone document. It is committed, so every collaborator and the cloud coding agent loads it.
- `~/.copilot/hooks/unlazy.json`, or `$COPILOT_HOME/hooks/unlazy.json` when `COPILOT_HOME` is set: the user hook file. Use the default standalone document. Affects every project this user opens.

Merging is the user's own work. If the destination already has an `agentStop` array, they must add unlazy's handler to that array instead of replacing it, or the handlers already there disappear. Advise them to keep their own copy of the file first, because nothing here makes a backup.

Removal is also by hand: edit the same file, delete the handler whose `env.UNLAZY_HOOK_OWNER` is `unlazy-agent-stop-hook`, and delete the file itself only when unlazy's handler was its only content. No command performs any of this.

The hook answers Copilot CLI's `agentStop` event with `{"decision":"block","reason":"..."}` while this session's resolved pipeline has unmet gates, and with `{"decision":"allow"}` otherwise. It reads ledgers only; it never runs a `CHECK:` command. Its session-keyed progress guard releases after six consecutive blocks on one unchanged ledger state; ledger progress resets that count, so a session that keeps changing content can instead hit Copilot CLI's own override after eight consecutive continuations, which ends the turn either way.

Copilot CLI reads hook configuration when it starts, so tell the user to restart the CLI after adding or removing the hook. Keep `.github/copilot/settings.local.json`, `.unlazy/`, and `.unlazy-hook-state.json` in the project's ignore rules. The printed handler records this machine's absolute Node and skill paths, so shared and user files are usually not portable to another machine. Read [SECURITY.md](SECURITY.md) and [GHCP-ADAPTATION.md](GHCP-ADAPTATION.md) before choosing a destination.

## Spend attention where it compounds

Keep leaf briefs to the contract, ownership, and one ledger. Append status instead
of rewriting history. Use stronger reasoning for uncertain decisions and difficult
integration; use faster execution for well-specified mechanical leaves only when
the same quality bar holds. Respect runtime model/effort preferences and permitted
overrides. Read [references/token-economy.md](references/token-economy.md) when
model or context allocation needs it.

Do not create gates for a trivial edit or factual reply. Use this discipline when the cost of quiet incompleteness justifies the ledger.

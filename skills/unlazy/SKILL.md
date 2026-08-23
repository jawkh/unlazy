---
name: unlazy
description: Enforces completion discipline for substantial autonomous work by writing acceptance gates before execution, decomposing work with the Depth Tree, running approved checks, and re-verifying evidence before reporting. Use when GitHub Copilot CLI faces a long or multi-part task, work that has returned half-done, an exhaustive audit or build, parallel leaves or pipelines, or explicit triggers such as /unlazy, "tree N", "gates", and "do not stop until it is done".
---

# Unlazy

Make incomplete work visible and make completion testable. Prove outcomes against a ledger instead of relying on a confident done report.

## Write gates before real work

Create `GATES.md` from [templates/gates-leaf.md](templates/gates-leaf.md) before implementing. State one observable outcome per gate. Give every runnable gate an indented `CHECK:` and `EXPECT:`; use a manual gate only when no command can decide the outcome.

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

- **Solo:** Use one `GATES.md` for a focused task that fits one working session.
- **Orchestrated:** For a build or deep review, read [references/method.md](references/method.md) and [references/orchestration.md](references/orchestration.md). Write the contract and tree before fan-out. Give every leaf and branch its own gates file.
- **Parallel:** Before dispatching concurrent leaves or pipelines, also read [references/parallel.md](references/parallel.md). Declare disjoint `OWNS:` paths and claim them. Treat scopes and leases as coordination, never as filesystem isolation or a security boundary.

Keep check execution sequential by default. Use `--jobs <N>` only for independent runnable gates when deterministic parallel verification saves wall-clock time. Continue printing and recording results in gate order.

## Build the Depth Tree

1. Split at natural task boundaries. Use the requested depth only while each leaf remains a coherent deliverable.
2. Give each leaf a narrow contract, exact file ownership, and its own ledger.
3. Give each branch integration gates for child verification, interface compatibility, end-to-end behavior, and regressions.
4. Dispatch only leaves whose declared dependencies are verified and whose ownership claim succeeded.
5. Re-run each returned leaf's runnable gates with `--reverify`; do not mistake `--status` for re-execution.

Use rolling dispatch: when a verified leaf unblocks another, dispatch the newly ready leaf without waiting for unrelated in-flight work. Keep states and dependencies in `PLAN.md`; append events to the scope status log.

## Work each leaf in four passes

1. Implement the complete deliverable. Leave no placeholders or deferred remainder.
2. Re-read it as a domain expert and replace the cheap version of each part.
3. Hunt correctness, integration, portability, performance, and evidence defects. Fix what you find.
4. Apply low-cost polish, then repeat until a full improvement pass finds nothing.

Finish a leaf only after the pass is clean and every gate is met with evidence or visibly abandoned.

## Author gates that can fail honestly

Remember that the checker proves only the declared command oracle. It cannot infer whether an English gate title describes what the command actually measures.

- Use a decisive success-only token and require both zero exit and `EXPECT:`.
- Exercise a negative check against a known positive control before trusting absence.
- Measure figures independently; do not copy a supplied number into `EXPECT:` as its own proof.
- Review consequential manual gates with evidence proportional to risk. Try to make the riskiest outcome runnable, but do not claim that manual status and risk generally correlate.
- Prefer portable Node scripts. Do not assume `grep`, `tail`, or `tr` exists on stock Windows.
- Re-run with the same declared shell and required toolchain. Treat an environment mismatch as a failed verification, not as evidence.

## Audit the final report

Re-measure every number and completion claim immediately before reporting. Use qualified ids such as `leaf-1.2.1:G3`. Report the measured met, unmet, and abandoned counts and surface every abandonment. Do not compose a done report while any required gate remains unmet.

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

Keep leaf briefs to the contract and one ledger. Append status instead of rewriting history. Use stronger reasoning for design, integration, and verification; use cheaper execution only for genuinely mechanical leaves. Read [references/token-economy.md](references/token-economy.md) for the detailed rules.

Do not create gates for a trivial edit or factual reply. Use this discipline when the cost of quiet incompleteness justifies the ledger.

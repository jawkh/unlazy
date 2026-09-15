# Orchestrated mode

Choose orchestrated mode proactively when sizeable independent work or separate
context improves delivery enough to justify coordination. Context exhaustion is
not a prerequisite. Keep the driver responsible for dispatch, required
re-verification, integration, and the root outcome.

## Declare states and paths

Use these leaf states only:

- `WAITING`: one or more ids in `Needs` are not yet `VERIFIED`
- `READY`: dependencies are verified and ownership is available
- `IN-FLIGHT`: dispatched and not yet independently verified
- `VERIFIED`: parent re-verification passed and manual gates were reviewed
- `ABANDONED`: at least one required gate has a recorded handoff; never treat this as full completion

Use `OPEN`, `VERIFIED`, or `ABANDONED` for branches. Store leaf ledgers as `gates/leaf-<id>.md` and integration ledgers as `gates/node-<id>.md`. Do not label a branch path as `leaf-*`.

## Driver loop

1. **Plan before fan-out.** Reuse the contract. Create or update `.unlazy/<scope>/PLAN.md`, `.unlazy/<scope>/GATES.md`, and one ledger per actual leaf and integration branch. Record necessary interfaces, toolchain, dependencies, and ownership, not a second implementation specification.
2. **Inspect and approve checks.** Run `gate-check --status` on every inherited ledger. Review each `CHECK:`, `EXPECT:`, and `CWD:`, including called scripts. Determine the shell and inherited `PATH`; a new oracle with no exact approval prints its resolved values during a normal run without executing. Use `--approve` only after inspection, and do not treat normal mode as a dry run once approval exists.
3. **Claim every concurrent leaf.** Run:

   ```text
   node <skill-dir>/scripts/gate-check.mjs --scope <scope> --leaf leaf-1.2.1 --claim
   ```

   A refused claim means the split is not safe for concurrent dispatch. Change the plan or run the work sequentially; never bypass the refusal.
4. **Dispatch ready leaves.** Give each leaf the shared contract, ownership, dependencies, its ledger, remaining limits, and the contract-based stop rule in `SKILL.md`. Use native task/fleet tools with runtime-supported model routing. Do not leak unrelated histories or require a fixed number of improvement passes.
5. **Verify each return independently.** Re-run the returned leaf's runnable gates, including already checked gates:

   ```text
   node <skill-dir>/scripts/gate-check.mjs --root . --cwd . --reverify .unlazy/<scope>/gates/leaf-1.2.1.md
   ```

   `--status` alone is not re-verification. If an approved oracle changed, inspect it and approve the new oracle before continuing. Review manual evidence against the named risk; add a negative probe when that risk warrants it, not merely to fill a quota.
6. **Append status and roll forward.** Record the result without rewriting history:

   ```text
   node <skill-dir>/scripts/gate-check.mjs --scope <scope> --log "leaf-1.2.1 verified"
   ```

   Mark the leaf `VERIFIED`, promote newly unblocked leaves from `WAITING` to `READY`, and dispatch them without waiting for unrelated in-flight leaves.
7. **Integrate bottom-up.** Work each `node-*.md` ledger only after its dependencies are verified. Reuse the driver's child re-verification from step 5 if the relevant state is unchanged; rerun affected gates after integration changes. Run the branch's required interface, end-to-end, and regression checks.
8. **Release and report.** Release scope leases on completion or abort. Claim completion only when the root ledger is met. Report unmet or abandoned requirements as incomplete; recalculate reported counts. Do not add a polish pass after acceptance.

## Check concurrency

Gate checks run sequentially by default (`--jobs 1`). This is the easiest transcript to debug and is the compatibility behavior.

Use `--jobs <N>` only when runnable gates are independent and parallel execution reduces wall-clock time:

```text
node <skill-dir>/scripts/gate-check.mjs --root . --cwd . --reverify --jobs 4 .unlazy/<scope>/gates/leaf-1.1.1.md .unlazy/<scope>/gates/leaf-1.1.2.md
```

The limit is rolling: start another check when one finishes instead of waiting for a fixed batch. Output and file updates remain deterministic in ledger order. `--jobs` controls command execution, not subagent dispatch and not dependency readiness.

## Rolling dispatch

Treat dispatch as a loop:

```text
while an unverified leaf remains:
  if a blocker limit is reached:
    pause affected dispatch and report the required decision
    preserve live-operation monitoring and cleanup
  dispatch READY leaves with claimed ownership whose contract and safety
    cannot change under the pending decisions
  if no leaf is IN-FLIGHT:
    report the unmet requirements and stop
  wait for the next leaf to return
  reverify that leaf and review its manual evidence
  append status and update its declared state
  promote each WAITING leaf whose Needs are all VERIFIED
```

Do not invent a dependency during dispatch. Add it to `PLAN.md`, correct the affected states, and record the change. Prefer independent leaves, but do not force independence where an interface must be established first.

## Verification hierarchy

1. **Leaf self-check:** catches ordinary incompleteness but remains self-certification.
2. **Parent `--reverify`:** executes each runnable oracle again instead of trusting old or manually written evidence.
3. **Branch integration:** catches locally correct children that do not compose.
4. **Optional agentStop hook:** blocks the driver from ending its turn while its resolved pipeline remains unmet. It scans ledgers; it does not execute checks or validate their meaning. It is off until a human places its configuration by hand — `scripts/print-copilot-hook.mjs` only prints the JSON. Copilot CLI then loads it from `.github/copilot/settings.local.json`, `.github/hooks/*.json`, or `~/.copilot/hooks/*.json`, and it fires on the top-level agent turn. A built-in general-purpose subagent does not emit its own stop event, so a dispatched leaf is still verified by its parent, never by the hook.

The parent must use the same required toolchain and declared shell. If the environment differs, record and resolve the mismatch instead of accepting old evidence.

## Manual gates

Automation cannot prove every user-facing or judgment-heavy outcome. For each manual gate:

- cite the exact artifact, location, measurement, or reviewer decision
- review consequences, not only visual polish
- obtain independent review for high-risk outcomes when feasible
- keep the gate unmet if evidence is ambiguous

Do not call a leaf `VERIFIED` merely because every runnable gate passed.

## When not to orchestrate

Stay solo for small work or an inseparable investigation. Do not split one file
among concurrent writers. Orchestration must earn its planning and integration
cost; do not reject useful parallel work merely because one agent could
eventually finish it.

# GHCP adaptation record

What changed when the upstream `unlazy` skill was packaged for GitHub Copilot CLI, and what still does not carry over. Read this before configuring the optional hook.

## Source pin

| Field | Value |
| --- | --- |
| Upstream project | `unlazy` (version 2.1.0) |
| Reviewed commit | `754d9a68109e39b836cc72a39fb9a823f9d6b613` |
| Target runtime | GitHub Copilot CLI 1.0.80 |
| Validated platform | macOS only |

Every carried-over file is byte-identical to that commit unless it is listed under "Deterministic changes" below.

## Selected payload

Carried over unchanged: `LICENSE`, `references/gates.md`, `references/method.md`, `references/parallel.md`, `references/token-economy.md`, `research/validation-protocol.md`, `scripts/gate-check.mjs`, `scripts/lib/gates.mjs`, `scripts/lib/regex-worker.mjs`, `templates/PLAN.md`, `templates/gates-leaf.md`, `templates/gates-node.md`.

Carried over and edited: `SKILL.md`, `SECURITY.md`, `references/orchestration.md`.

Added here: `scripts/copilot-stop-hook.mjs`, `scripts/print-copilot-hook.mjs`, this file.

## Excluded payload

| Excluded | Why |
| --- | --- |
| `scripts/stop-hook.mjs`, `scripts/install-hooks.mjs` | Claude Code Stop-hook feature and its installer; declined for this runtime |
| `tests/**`, `.github/workflows/test.yml` | Upstream development harness, not skill runtime |
| `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `.gitignore`, `package.json` | Repository scaffolding, not skill runtime |
| `agents/openai.yaml` | Another vendor's agent manifest |

Nothing in this payload reads or writes Claude configuration.

## Deterministic changes

1. `SKILL.md` frontmatter now names GitHub Copilot CLI instead of Codex. The `/unlazy` command trigger and the natural-language triggers are kept. The `$unlazy` trigger is dropped because this runtime has no such prefix.
2. `SKILL.md` replaces the Claude Stop-hook section with an optional Copilot CLI `agentStop` section. It says the hook stays off until a human configures it by hand, names every destination, and says a CLI restart is needed.
3. `SECURITY.md` restates the hook section against Copilot CLI event names and file locations, and replaces the installer section with a manual-configuration section. The ambient-permission warning and the review-then-approve model for `CHECK:` lines are unchanged.
4. `references/orchestration.md` renames the Stop hook to the `agentStop` hook, records where the runtime loads it from, and notes that a human places it there.
5. `scripts/copilot-stop-hook.mjs` is a port of the upstream Stop hook. It keeps the scope and session resolution, unmet and invalid gate detection, the serialized per-session progress state, the six-block no-progress release, and the fail-open behavior when state cannot be updated safely. It reads `sessionId`, `cwd`, and `stop_hook_active`, accepts the snake_case spellings too, writes exactly one compact decision to stdout, and sends diagnosis to stderr. It never executes a gate.
6. **The upstream installer was not ported.** `scripts/print-copilot-hook.mjs` replaces it and is a printer, not a mutator. It emits one compact `agentStop` document to stdout: `{"version":1,"hooks":{...}}` by default, or `{"hooks":{...}}` with `--inline`. The handler carries absolute packaged Node and script paths, a `bash` command and a `powershell` command with POSIX and PowerShell quoting, the stable `env.UNLAZY_HOOK_OWNER` marker, and a bounded `timeoutSec` of 20. `--scope ID` is validated by the same `validateScopeId` the rest of the skill uses. The script opens no file for writing and makes no network call; it imports only `node:path`, `node:url`, and that shared validator. A rejected invocation prints to stderr, exits 2, and writes nothing to stdout.
7. The destination is chosen and edited by a human, so this payload no longer resolves `COPILOT_HOME` or a user home directory at all. The documented user-level location remains the one Copilot CLI reads: `$COPILOT_HOME/hooks/unlazy.json` when `COPILOT_HOME` is set, and `<user home>/.copilot/hooks/unlazy.json` otherwise. A configured `COPILOT_HOME` replaces the default outright and never gains an extra `.copilot` segment.

## Gaps

These are real limits, not to-do items.

1. **Nothing configures the hook for you.** There is no install, uninstall, merge, or backup command in this payload. `print-copilot-hook.mjs` prints JSON and stops. A human reads it, chooses a destination, edits that file, and later edits it again to remove the hook. Nothing detects a repeated edit, refuses a symlinked destination, checks the destination's shape, or keeps a copy of what was there before.
2. **A careless manual merge can overwrite sibling handlers.** The printed document describes only unlazy's own handler. If the destination file already defines `hooks.agentStop`, unlazy's handler has to be added to that array. Pasting the printed document over the existing `hooks` object, or over the existing array, silently removes handlers another tool depends on. Nothing warns about this, because nothing is watching the file.
3. **The printed handler is machine-specific.** It embeds this machine's absolute Node executable and the absolute path to this copy of `copilot-stop-hook.mjs`. Put in the shared `.github/hooks/unlazy.json` or in a user-level hook file, it runs only where those exact paths exist, and it exposes local directory names to anyone who reads the file.
4. **Two different release counters, and the platform one wins.** Unlazy releases after six consecutive blocks on one unchanged ledger state. Ledger content progress resets that count, so an unlazy release is not guaranteed to come first: a session that keeps changing its ledgers can reach Copilot CLI's runaway guard instead, which overrides any hook after eight consecutive block continuations and ends the turn. Unlazy has no say in that decision.
5. **Windows is unvalidated.** The printed handler includes a `powershell` command and the code paths for it exist, but no live Windows run has verified the hook, the quoting, the `%USERPROFILE%\.copilot` location, or the state file behavior. Treat Windows as unsupported until someone validates it.
6. **Cloud agent sees only the committed repository file.** A cloud coding agent loads repository hooks from `.github/hooks/*.json` by default. The project-local `.github/copilot/settings.local.json` destination is invisible to it, and so is a user-level hook file under a home directory.
7. **Subagents do not stop-check.** Built-in general-purpose subagents do not emit their own stop events. The hook only guards the top-level agent turn. A dispatched leaf is still verified by its parent's `--reverify`, never by the hook.
8. **Blocking is not verification.** `agentStop` can force another turn. It cannot check that a gate's English title matches what its command measures, and it does not sandbox `CHECK:` commands. The safety boundary is still human review and approval, as described in `SECURITY.md`.
9. **A restart is required.** Copilot CLI reads hook configuration when it starts. Adding, changing, or removing the hook does nothing until the CLI is restarted.
10. **No Claude support is included.** No Claude settings file, Claude Stop hook, or Claude installer ships in this payload, and nothing here reads or writes a Claude configuration path.
11. **A release is silent.** The `agentStop` allow decision has no message field, and the parity contract requires stdout to be one compact decision. So the six-block release prints no explanation. The sixth block's reason announces that it is the last enforced continuation for that ledger state, which is the only channel the agent actually reads.
12. **`stop_hook_active` is advisory here.** The hook reads it and includes it in stderr diagnosis, but it does not change the counter. Letting the platform flag adjust unlazy's own per-session count would only weaken the guard, so the count stays keyed to session and ledger content.
13. **Two stale references remain in an out-of-scope file.** `references/parallel.md` still describes the `--bind` session binding in Claude Code terms, and still says the hook "may be pinned with installer `--scope`" even though the installer is gone. That file was outside the edit scope of this adaptation. Both mechanisms are runtime-neutral: a binding maps a session id to a scope, and `--scope` is now a flag on the printed handler rather than on an installer.

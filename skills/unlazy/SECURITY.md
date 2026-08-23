# Security model

Unlazy executes repository-described checks. Its safety boundary is explicit review and approval, not command sandboxing.

## `CHECK:` lines are code

`gate-check.mjs` runs each `CHECK:` through a shell with the checker's user permissions and inherited environment. A command can access files, network connections, credentials, and developer tools available to that process.

Before using an inherited ledger:

1. Run `node <skill-dir>/scripts/gate-check.mjs --status <gate-file>` to parse and display status without executing checks.
2. Read every `CHECK:`, `EXPECT:`, and `CWD:`. Inspect any script called by a check, including generated or ignored files.
3. Determine the shell from `--shell`, `UNLAZY_SHELL`, or the platform default, and inspect the inherited `PATH`. For a new oracle with no exact approval, normal mode prints the resolved values without running it. Normal mode is not a universal dry run because an existing exact approval permits execution.
4. Run with `--approve` only when the complete resolved oracle is expected and understood.

Approval records live under `~/.unlazy/approved` by default. `UNLAZY_APPROVAL_DIR` may select another real directory, but the checker rejects a directory inside the repository. An approval is specific to the absolute ledger and gate, exact command and expectation, resolved working directory and shell, timeout, output and regex limits, platform, and full inherited `PATH`. A change to any bound input requires review and approval again. An approval is consent to execute; it is not evidence that the command matches the English gate title.

Approval does not snapshot files that a command invokes. If a referenced script, generated file, executable, or dependency changes while the approved command text remains the same, inspect it again before running the command.

Approval and lease locks fail closed instead of being stolen automatically. If an owning process terminates unexpectedly, verify the PID recorded in that specific lock is no longer running and that no operation can still own it before removing the abandoned lock manually. Do not bulk-delete lock directories while unlazy is active.

Do not run untrusted checks merely to learn what they do. Review them as source first. Use a disposable environment or stronger sandbox when source trust is uncertain.

## Shell and environment

Shell resolution follows `--shell`, then `UNLAZY_SHELL`, then Node's platform default. The child inherits the current environment, including `PATH`. Changing the terminal used to launch unlazy can change which external tools resolve, especially on Windows.

Prefer repository-owned Node scripts and explicit `CWD:` values. A shell override does not install missing utilities, clean the environment, or restrict command access. The execution transcript shows the resolved `PATH`, capped for display. Persisted evidence includes resolved shell, working directory, exit status, a short `PATH` fingerprint, and decisive output so environment differences remain visible without storing the full machine-specific path.

See [references/gates.md](references/gates.md) for the full shell and success contract.

## Scopes and leases are not a sandbox

Scopes limit unlazy's gate discovery, log target, hook association, and lease labels. Ownership leases coordinate tools that voluntarily use the protocol. Neither mechanism prevents a process from reading or writing another path.

Separate worktrees can reduce ordinary path contention, but they may still share external caches and services. Use operating-system, container, or virtual-machine isolation for untrusted code. See [references/parallel.md](references/parallel.md).

## agentStop hook and local state

The optional Copilot CLI `agentStop` hook scans ledgers and writes progress state. It does not execute `CHECK:` commands and does not judge whether a gate title matches its oracle. It emits Copilot CLI's documented `{"decision":"block","reason":"..."}` while the resolved session pipeline has unmet gates, and releases after six consecutive blocks on one unchanged ledger state. Any change to the ledger content resets that count, so a session whose ledgers keep changing can reach Copilot CLI's own runaway guard instead: the CLI overrides any hook after eight consecutive block continuations and ends the turn. The platform cap wins whenever the two limits disagree.

The hook reads only `sessionId`, `cwd`, and `stop_hook_active` from the event payload. It writes one compact decision to stdout and sends fail-open diagnosis to stderr. Runtime and binding files live under `.unlazy/` in scoped mode. Legacy mode may use `.unlazy-hook-state.json`. Keep both paths in the project's ignore rules. Session ids in bindings are routing values, not secrets or authentication tokens.

## Hook configuration is manual

Nothing in this payload configures Copilot CLI. There is no installer and no uninstaller. `scripts/print-copilot-hook.mjs` writes one compact JSON document to stdout and exits; it opens no file for writing, makes no network call, and leaves the project, the user's home directory, and `$COPILOT_HOME` byte-identical. A rejected invocation prints a diagnostic to stderr, exits 2, and writes nothing to stdout.

Placing the printed document is the user's decision and the user's work. Three destinations exist and they have different blast radii:

- `.github/copilot/settings.local.json`, the project-local inline settings file. Use `--inline` and merge the `hooks` object in. Affects one checkout.
- `.github/hooks/unlazy.json`, the shared repository hook file. Use the default standalone document. It is committed, every collaborator loads it, and it is the only hook location a cloud coding agent loads by default.
- `~/.copilot/hooks/unlazy.json`, or `$COPILOT_HOME/hooks/unlazy.json` when `COPILOT_HOME` is set: the user hook file. Use the default standalone document. Affects every project this user opens.

Treat the shared and user destinations as consequential and confirm the specific file before editing it.

A manual merge is unguarded. If the destination file already defines `hooks.agentStop`, add unlazy's handler to that array; replacing the array or the whole `hooks` object silently drops handlers another tool depends on. Nothing here validates the destination's shape, refuses a symlinked path, keeps a backup copy, or detects a repeated edit. Keep your own copy of any file you are about to change, and review the diff before committing a hook file.

The printed handler contains the absolute Node executable and the absolute path to this copy of `copilot-stop-hook.mjs`. Those paths can expose local directory names, and they make the shared and user files machine-specific: a collaborator whose Node or skill lives elsewhere gets a handler that does not run. Prefer the project-local inline destination and keep `.github/copilot/settings.local.json` in the project's ignore rules.

Each printed handler carries a stable ownership marker, `env.UNLAZY_HOOK_OWNER` set to `unlazy-agent-stop-hook`. It exists so a human editing the file can identify unlazy's handler. To remove the hook, delete that handler by hand, and delete the file only if unlazy's handler was its only content. Copilot CLI loads hook configuration at startup, so restart the CLI after adding or removing the hook.

## Evidence and logs

Command output can contain private paths or other sensitive text. Gate evidence is deliberately capped, but it is still written into the ledger. Design checks to emit a concise success marker and avoid printing secrets. Review ledgers and status logs before committing or sharing them.

Unlazy does not intentionally collect telemetry or send approval, gate, or hook-state records to a service. A `CHECK:` command can perform its own network or logging activity because it is arbitrary code.

## Reporting a vulnerability

For ordinary defects, open a GitHub issue with a minimal reproduction. For a vulnerability whose reproduction would expose a secret or enable abuse, use GitHub's private vulnerability reporting for this repository if it is available. If it is not available, open a minimal issue asking the maintainer for a private contact method and omit sensitive details until a private channel exists.

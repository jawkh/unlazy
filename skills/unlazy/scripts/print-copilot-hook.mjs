#!/usr/bin/env node
// Print unlazy's GitHub Copilot CLI agentStop hook configuration. Zero dependencies. Node 16+.
//
// This script only prints JSON to stdout. It never inspects, changes, or
// removes hook configuration anywhere. A human reads the printed document and
// places or merges it by hand.

import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScopeId } from "./lib/gates.mjs";

const HOOK_SCRIPT = "copilot-stop-hook.mjs";
const UNLAZY_FLAG = "--unlazy";
const TIMEOUT_SEC = 20;

// Copilot CLI passes a command handler's `env` object to the hook process, so
// this stable marker is a documented field rather than an invented one. It
// exists so a human editing a hook file by hand can recognise unlazy's handler.
const OWNER_ENV_KEY = "UNLAZY_HOOK_OWNER";
const OWNER_ENV_VALUE = "unlazy-agent-stop-hook";

const USAGE = `usage: print-copilot-hook.mjs [--scope ID] [--inline]

  default     one standalone hook file document: {"version":1,"hooks":{...}}
  --inline    one settings fragment: {"hooks":{...}}
  --scope ID  pin the hook to one validated .unlazy/ID pipeline

This command prints and changes nothing. Read the JSON, then place or merge it
yourself into exactly one of:

  .github/copilot/settings.local.json   --inline, this checkout only
  .github/hooks/unlazy.json             default, committed and shared
  ~/.copilot/hooks/unlazy.json          default, every project for this user

Copilot CLI loads hook configuration at startup; restart it afterwards.`;

function fail(message) {
  process.stderr.write("print-copilot-hook: " + message + "\n" + USAGE + "\n");
  process.exit(2);
}

const args = process.argv.slice(2);
let scope = null;
let inline = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") {
    process.stderr.write(USAGE + "\n");
    process.exit(0);
  }
  if (arg === "--inline") {
    if (inline) fail("duplicate --inline");
    inline = true;
    continue;
  }
  if (arg === "--scope") {
    if (scope !== null) fail("duplicate --scope");
    scope = args[++index];
    if (!scope) fail("--scope needs a pipeline id");
    continue;
  }
  fail("unknown option " + arg);
}
if (scope !== null) {
  const invalid = validateScopeId(scope);
  if (invalid) fail(invalid);
}

// Copilot CLI runs a command handler from the session's working directory, so
// both the interpreter and this skill's packaged hook must be absolute.
const script = fileURLToPath(new URL("./" + HOOK_SCRIPT, import.meta.url));
const node = process.execPath;
if (!isAbsolute(node) || !isAbsolute(script)) {
  fail("refusing to print a handler whose command path is not absolute");
}

const posixQuote = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'";
const powerQuote = (value) => "'" + String(value).replace(/'/g, "''") + "'";
const flags = " " + UNLAZY_FLAG + (scope ? " --scope " + scope : "");
const handler = {
  type: "command",
  bash: posixQuote(node) + " " + posixQuote(script) + flags,
  powershell: "& " + powerQuote(node) + " " + powerQuote(script) + flags,
  env: { [OWNER_ENV_KEY]: OWNER_ENV_VALUE },
  timeoutSec: TIMEOUT_SEC,
};

// stdout carries exactly one compact JSON document and no prose, so the output
// can be piped straight into a viewer or a diff.
const hooks = { agentStop: [handler] };
process.stdout.write(JSON.stringify(inline ? { hooks } : { version: 1, hooks }) + "\n");

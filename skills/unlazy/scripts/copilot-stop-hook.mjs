#!/usr/bin/env node
// GitHub Copilot CLI agentStop hook for one unlazy pipeline. Zero dependencies. Node 16+.
// It reads ledgers and writes progress state. It never executes a CHECK line.

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  UNLAZY_DIR, gateState, hookStatePath, parseGates, qualify, resolveTarget,
  sha256, validateScopeId, withFileLock, writeAtomic,
} from "./lib/gates.mjs";

// Unlazy releases after six consecutive blocks on one unchanged ledger state.
// Ledger progress resets that counter, so a session whose content keeps changing
// can still reach Copilot CLI's runaway guard, which overrides any hook after
// eight consecutive block continuations and ends the turn regardless.
const MAX_BLOCKS = 6;

const args = process.argv.slice(2);
const scopeIndex = args.indexOf("--scope");
const scopeArg = scopeIndex === -1 ? null : args[scopeIndex + 1];

// Set once the payload is parsed; used only to annotate fail-open diagnosis.
let stopHookActive = false;

// stdout carries exactly one compact agentStop decision so the runtime can
// always parse it. Diagnosis goes to stderr, which the decision parser ignores.
function decide(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
  process.exit(0);
}

function allow(note) {
  if (note) {
    process.stderr.write("unlazy: " + note +
      (stopHookActive ? " (a hook continuation was already active)" : "") + "\n");
  }
  decide({ decision: "allow" });
}

if (scopeIndex !== -1 && (!scopeArg || validateScopeId(scopeArg))) {
  allow("installed hook has an invalid --scope value; not blocking.");
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); }
catch { allow(null); }
if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};

// Copilot CLI sends camelCase sessionId and cwd with a snake_case
// stop_hook_active. Accept the compatible snake_case spellings too.
const root = resolve(typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd());
const sessionId = payload.sessionId || payload.session_id || "anonymous";
stopHookActive = payload.stop_hook_active === true || payload.stopHookActive === true;
const sessionKey = sha256(String(sessionId)).slice(0, 24);
const target = resolveTarget({ root, scope: scopeArg, sessionId });

if (target.ambiguous) {
  allow(target.ambiguous.length + " pipelines under " + UNLAZY_DIR +
    "/ (" + target.ambiguous.join(", ") + ") and none bound to this session; not blocking.");
}
if (target.error && !target.ambiguous) allow(target.error + "; not blocking.");

const statePath = hookStatePath(root, target.scope);

async function clearSessionState() {
  if (!existsSync(statePath)) return;
  try {
    await withFileLock(root, statePath, () => {
      let state = { schema: 1, sessions: {} };
      try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch { /* replace invalid local state */ }
      if (!state || typeof state !== "object" || Array.isArray(state) || !state.sessions || typeof state.sessions !== "object") {
        state = { schema: 1, sessions: {} };
      }
      delete state.sessions[sessionKey];
      if (!Object.keys(state.sessions).length) {
        try { unlinkSync(statePath); } catch { /* already absent */ }
      } else writeAtomic(statePath, JSON.stringify(state, null, 2) + "\n", { root });
    }, { timeoutMs: 10000 });
  } catch {
    // State cleanup must never trap a session after the gates are complete.
  }
}

if (!target.files.length) {
  await clearSessionState();
  allow(null);
}

const unmet = [];
const invalid = [];
let combined = "";
for (const file of [...target.files].sort()) {
  let text;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    invalid.push(qualify(file, "PARSE") + " unreadable: " + error.message);
    continue;
  }
  combined += file + "\0" + text + "\0";
  const doc = parseGates(text);
  if (doc.errors.length) {
    invalid.push(qualify(file, "PARSE") + " " + doc.errors.slice(0, 2).join("; "));
    continue;
  }
  for (const gate of doc.gates) {
    const state = gateState(gate, doc.abandoned);
    if (state === "unmet" || state === "unmet-no-evidence") unmet.push(qualify(file, gate.id));
  }
}

if (!unmet.length && !invalid.length) {
  await clearSessionState();
  allow(null);
}

const contentHash = sha256(combined + invalid.join("\0")).slice(0, 24);
let sessionState;
try {
  sessionState = await withFileLock(root, statePath, () => {
    let state = { schema: 1, sessions: {} };
    try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch { /* new or corrupt local state */ }
    if (!state || typeof state !== "object" || Array.isArray(state) || !state.sessions ||
        typeof state.sessions !== "object" || Array.isArray(state.sessions)) {
      state = { schema: 1, sessions: {} };
    }
    let current = state.sessions[sessionKey];
    if (!current || current.hash !== contentHash) current = { hash: contentHash, blocks: 0 };
    current.blocks += 1;
    current.updatedAt = new Date().toISOString();
    state.sessions[sessionKey] = current;
    // Bound abandoned session debris without mixing counters between sessions.
    const entries = Object.entries(state.sessions).sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)));
    state.sessions = Object.fromEntries(entries.slice(0, 64));
    writeAtomic(statePath, JSON.stringify(state, null, 2) + "\n", { root });
    return current;
  }, { timeoutMs: 10000 });
} catch (error) {
  allow("could not update the serialized hook state (" + error.message + "); not blocking to avoid a trap.");
}

const where = target.scope ? " [scope " + target.scope + "]" : "";
const outstanding = [...invalid, ...unmet];

// The release is silent because an allow decision has no message field. The
// last enforced block below announces it while a channel still exists.
if (sessionState.blocks > MAX_BLOCKS) allow(null);

const list = outstanding.slice(0, 5).join(", ") + (outstanding.length > 5 ? ", +" + (outstanding.length - 5) + " more" : "");
const closing = sessionState.blocks === MAX_BLOCKS
  ? " This is unlazy's last enforced continuation for this ledger state; the next stop is allowed even if items remain."
  : "";
decide({
  decision: "block",
  reason: "unlazy" + where + ": " + outstanding.length + " gate/ledger item(s) need work: " + list +
    ". Run scripts/gate-check.mjs --status to inspect without execution. To run inherited CHECK lines, inspect them and use --approve. " +
    "Use ABANDON: <id> <non-blank reason> only when a gate is genuinely impossible." + closing,
});

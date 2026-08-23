#!/usr/bin/env node
// GHCP agentStop hook parity tests. Zero dependencies, Node 16+.

import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  readlinkSync, rmSync, writeFileSync,
} from "node:fs";
import { execFile } from "node:child_process";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STOP = join(ROOT, "skills", "unlazy", "scripts", "copilot-stop-hook.mjs");
const PRINT = join(ROOT, "skills", "unlazy", "scripts", "print-copilot-hook.mjs");
const INSTALL = join(ROOT, "skills", "unlazy", "scripts", "install-copilot-hooks.mjs");
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function sandbox() {
  const dir = mkdtempSync(join(ROOT, "unlazy-ghcp-hooks-"));
  const path = (relativePath) => join(dir, relativePath);
  return {
    dir, path,
    write(relativePath, value) {
      const target = path(relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, value);
      return target;
    },
    read(relativePath) { return readFileSync(path(relativePath), "utf8"); },
    cleanup() { rmSync(dir, { recursive: true, force: true }); },
  };
}

function run(script, args = [], options = {}) {
  return new Promise((done) => {
    const child = execFile(process.execPath, [script, ...args], {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        PATH: "",
        HOME: options.home || join(options.cwd || ROOT, "home"),
        USERPROFILE: options.home || join(options.cwd || ROOT, "home"),
        http_proxy: "http://127.0.0.1:1",
        https_proxy: "http://127.0.0.1:1",
        ...(options.env || {}),
      },
    }, (error, stdout, stderr) => done({
      code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
      stdout: stdout || "",
      stderr: stderr || "",
    }));
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
  });
}

function parseHook(result) {
  assert(result.code === 0, "hook exited " + result.code + "\n" + result.stdout + result.stderr);
  const line = result.stdout.trim();
  let value;
  try { value = JSON.parse(line); } catch { throw new Error("hook did not emit JSON: " + line); }
  assert(line === JSON.stringify(value), "hook output was not compact JSON: " + line);
  return value;
}

function snapshotTree(root) {
  const entries = [];
  function visit(path) {
    const info = lstatSync(path);
    const name = relative(root, path) || ".";
    if (info.isSymbolicLink()) {
      entries.push({ name, type: "symlink", target: readlinkSync(path) });
      return;
    }
    if (info.isDirectory()) {
      entries.push({ name, type: "directory" });
      for (const child of readdirSync(path).sort()) visit(join(path, child));
      return;
    }
    entries.push({ name, type: "file", bytes: readFileSync(path).toString("base64") });
  }
  visit(root);
  return JSON.stringify(entries);
}

function assertUnchanged(before, roots, label) {
  for (const root of roots) {
    assert(snapshotTree(root) === before.get(root), label + " mutated " + root);
  }
}

function expectedHandler(scope) {
  const flags = "--unlazy" + (scope ? " --scope " + scope : "");
  return {
    type: "command",
    bash: "'" + process.execPath + "' '" + STOP + "' " + flags,
    powershell: "& '" + process.execPath + "' '" + STOP + "' " + flags,
    env: { UNLAZY_HOOK_OWNER: "unlazy-agent-stop-hook" },
    timeoutSec: 20,
  };
}

function expectedDocument({ inline = false, scope } = {}) {
  const hooks = { agentStop: [expectedHandler(scope)] };
  return inline ? { hooks } : { version: 1, hooks };
}

function assertExactPrint(result, expected) {
  assert(result.code === 0, "print hook exited " + result.code + "\n" + result.stderr);
  assert(result.stderr === "", "print hook wrote diagnostics: " + result.stderr);
  assert(result.stdout === JSON.stringify(expected) + "\n",
    "print hook output differed from its exact document:\n" + result.stdout);
}

function assertRejected(result, args) {
  assert(result.code !== 0, args.join(" ") + " unexpectedly succeeded");
  assert(result.stdout === "", args.join(" ") + " wrote to stdout: " + result.stdout);
}

const pendingLedger = "- [ ] G1: pending work\n  EVIDENCE: pending\n";
const completeLedger = "- [x] G1: complete\n  EVIDENCE: measured\n";
const payload = (s, sessionId = "session-a") =>
  JSON.stringify({ cwd: s.dir, sessionId, stopReason: "end_turn", stop_hook_active: false });

test("agentStop reads camelCase payload and blocks or allows valid ledgers", async () => {
  const s = sandbox();
  try {
    s.write("GATES.md", pendingLedger);
    const blocked = parseHook(await run(STOP, [], { cwd: s.dir, stdin: payload(s) }));
    assert(blocked.decision === "block" && typeof blocked.reason === "string" && blocked.reason.length > 0,
      "unmet ledger must block with a reason: " + JSON.stringify(blocked));

    s.write("GATES.md", completeLedger);
    const complete = parseHook(await run(STOP, [], { cwd: s.dir, stdin: payload(s) }));
    assert(complete.decision === "allow", "complete ledger must allow: " + JSON.stringify(complete));

    rmSync(s.path("GATES.md"));
    const absent = parseHook(await run(STOP, [], { cwd: s.dir, stdin: payload(s, "session-b") }));
    assert(absent.decision === "allow", "no ledger must allow: " + JSON.stringify(absent));
  } finally { s.cleanup(); }
});

test("agentStop releases after six unchanged blocks and resets on ledger change", async () => {
  const s = sandbox();
  try {
    s.write("GATES.md", pendingLedger);
    for (let count = 1; count <= 6; count++) {
      const result = parseHook(await run(STOP, [], { cwd: s.dir, stdin: payload(s, "steady") }));
      assert(result.decision === "block", "unchanged block " + count + " did not block");
    }
    const released = parseHook(await run(STOP, [], { cwd: s.dir, stdin: payload(s, "steady") }));
    assert(released.decision === "allow", "seventh unchanged invocation must release");

    s.write("GATES.md", pendingLedger + "\n- [ ] G2: newly discovered work\n  EVIDENCE: pending\n");
    const reset = parseHook(await run(STOP, [], { cwd: s.dir, stdin: payload(s, "steady") }));
    assert(reset.decision === "block", "changed ledger must reset the six-block guard");
  } finally { s.cleanup(); }
});

test("print-copilot-hook emits exact standalone and inline agentStop documents", async () => {
  const standalone = await run(PRINT);
  assertExactPrint(standalone, expectedDocument());

  const inline = await run(PRINT, ["--scope", "release.1", "--inline"]);
  assertExactPrint(inline, expectedDocument({ inline: true, scope: "release.1" }));

  for (const args of [
    ["--unknown"],
    ["--scope", "../escape"],
    ["--scope", "one", "--scope", "two"],
    ["--inline", "--inline"],
  ]) {
    assertRejected(await run(PRINT, args), args);
  }

  for (const document of [expectedDocument(), expectedDocument({ inline: true, scope: "release.1" })]) {
    const handler = document.hooks.agentStop[0];
    assert(isAbsolute(process.execPath), "Node executable path must be absolute");
    assert(isAbsolute(STOP), "packaged stop hook path must be absolute");
    assert(handler.bash.includes(process.execPath) && handler.bash.includes(STOP), "bash lacks absolute paths");
    assert(handler.powershell.includes(process.execPath) && handler.powershell.includes(STOP),
      "powershell lacks absolute paths");
  }
});

test("print-copilot-hook never mutates controlled project or homes", async () => {
  const s = sandbox();
  try {
    const home = s.write("home/marker.txt", "home before\n") && s.path("home");
    const copilotHome = s.write("copilot-home/marker.txt", "copilot home before\n") && s.path("copilot-home");
    s.write("project-marker.txt", "project before\n");
    const roots = [s.dir, home, copilotHome];
    const before = new Map(roots.map((root) => [root, snapshotTree(root)]));
    const options = { cwd: s.dir, home, env: { COPILOT_HOME: copilotHome } };

    assertExactPrint(await run(PRINT, ["--scope", "safe.scope"], options),
      expectedDocument({ scope: "safe.scope" }));
    assertUnchanged(before, roots, "successful print");

    for (const args of [["--unknown"], ["--scope", "../escape"], ["--inline", "--inline"]]) {
      assertRejected(await run(PRINT, args, options), args);
      assertUnchanged(before, roots, "rejected print");
    }

    assert(!existsSync(INSTALL), "automatic installer remains in the packaged payload");
    const source = readFileSync(PRINT, "utf8");
    assert(!/\b(?:appendFile|chmod|chown|copyFile|cp|link|mkdir|mkdtemp|rename|rm|rmdir|symlink|truncate|unlink|writeFile)\w*\b/.test(source),
      "print script imports or calls a filesystem write API");
    assert(!/(?:node:(?:http|https|net|tls|dgram)|\bfetch\s*\(|\bcurl\b|\bwget\b)/.test(source),
      "print script imports or calls a network API");
  } finally { s.cleanup(); }
});

let passed = 0;
const failures = [];
for (const entry of tests) {
  try {
    await entry.fn();
    passed++;
    console.log("ok   " + entry.name);
  } catch (error) {
    failures.push(entry.name + ": " + error.message);
    console.log("FAIL " + entry.name + "\n     " + error.message);
  }
}
console.log("");
if (failures.length) {
  console.log("ghcp-hooks FAILED (" + passed + "/" + tests.length + ")");
  process.exit(1);
}
console.log("ghcp-hooks ok (" + passed + "/" + tests.length + ")");

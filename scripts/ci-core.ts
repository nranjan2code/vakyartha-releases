// Shared local-CI core. The same file is copied into Vakyartha, Projection and the
// capabilities repository; each repository's scripts/ci.ts only lists its own steps.
// Keep the copies identical: change it in one repository, then copy it to the others.
//
// The owner's machine is the source of truth. A passing tier on a clean tree is recorded
// as a git note on the commit (refs/notes/ci), so a person, a later run or the GitHub
// mirror can see which commits a machine verified, even when hosted minutes run out.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Step = { name: string; cmd: string[]; cwd?: string; needs?: string[]; minutes?: number };
export type Config = {
  repo: string;
  tiers: Record<string, Step[]>;
  // Each need returns undefined when it is met, or the reason it is not.
  needs: Record<string, () => string | undefined | Promise<string | undefined>>;
  // Tiers where a skipped step counts as a failure.
  strict?: string[];
};
type Result = { name: string; status: "pass" | "fail" | "skip"; ms: number; reason?: string };

const usage = `usage: node scripts/ci.ts <tier> [--keep-going] [--only <step>] [--list]
       node scripts/ci.ts status [tier]          receipt recorded for HEAD
       node scripts/ci.ts receipt <sha> [tier]   whether a machine verified a commit (--require to fail)
       node scripts/ci.ts publish                push receipts (refs/notes/ci) to origin
       node scripts/ci.ts hooks                  use .githooks: pre-commit secret scan, pre-push quick tier
       node scripts/ci.ts secrets [--staged]     scan tracked (or staged) files for secrets`;

export const has = (cmd: string, args: string[] = ["--version"]) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
export const commonNeeds: Config["needs"] = {
  macos: () => process.platform === "darwin" ? undefined : "macOS only",
  rust: () => has("cargo") ? undefined : "no cargo",
  docker: () => has("docker", ["info"]) ? undefined : "Docker is not running",
  ollama: async () => {
    try { return (await fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(2000) })).ok ? undefined : "Ollama not answering"; }
    catch { return "Ollama not running"; }
  },
};

// Provider keys, cloud keys, chat tokens and private keys. Anchored so ordinary words
// such as "task-..." do not match.
const SECRET = /(^|[^A-Za-z0-9_-])(sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,})|(^|[^0-9])[0-9]{8,10}:[A-Za-z0-9_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export async function main(config: Config): Promise<void> {
  const { repo } = config;
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  const receipts = (sha = "HEAD"): Record<string, { result?: string; at?: string; platform?: string }> => {
    try { return JSON.parse(execFileSync("git", ["-C", repo, "notes", "--ref", "ci", "show", sha], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { return {}; }
  };

  function secrets(staged: boolean): number {
    const allowFile = path.join(repo, ".secret-scan-allow");
    const allowed = new Set(existsSync(allowFile) ? readFileSync(allowFile, "utf8").split("\n").map(l => l.replace(/#.*/, "").trim()).filter(Boolean) : []);
    const files = (staged ? git("diff", "--cached", "--name-only", "--diff-filter=ACMR") : git("ls-files")).split("\n").filter(f => f && !allowed.has(f));
    const hits: string[] = [];
    for (const file of files) {
      let text: string;
      try { text = staged ? git("show", `:${file}`) : readFileSync(path.join(repo, file), "utf8"); } catch { continue; }
      if (text.includes("\0")) continue;
      text.split("\n").forEach((line, i) => { if (SECRET.test(line)) hits.push(`${file}:${i + 1}`); });
    }
    // Locations only: printing the line would print the secret.
    for (const hit of hits) console.error(`possible secret: ${hit}`);
    if (hits.length) console.error("Remove it, or list a file of fake test values in .secret-scan-allow with a reason.");
    else console.log(`secret scan: ${files.length} files clean`);
    return hits.length ? 1 : 0;
  }

  async function run(tier: string, flags: string[]): Promise<number> {
    const steps = config.tiers[tier];
    if (!steps) { console.error(`unknown tier ${tier}; tiers: ${Object.keys(config.tiers).join(", ")}\n${usage}`); return 2; }
    const only = flags.includes("--only") ? flags[flags.indexOf("--only") + 1] : undefined;
    const chosen = only ? steps.filter(s => s.name === only) : steps;
    if (only && !chosen.length) { console.error(`no step ${only} in ${tier}`); return 2; }
    if (flags.includes("--list")) { for (const s of chosen) console.log(`${s.name.padEnd(28)} ${(s.needs ?? []).join(", ")}`); return 0; }

    const strict = config.strict?.includes(tier) ?? false;
    const results: Result[] = [];
    const started = Date.now();
    for (const step of chosen) {
      let reason: string | undefined;
      for (const need of step.needs ?? []) {
        const check = config.needs[need] ?? commonNeeds[need];
        if (!check) throw new Error(`step ${step.name} needs unknown ${need}`);
        if ((reason = await check())) break;
      }
      if (reason) { results.push({ name: step.name, status: "skip", ms: 0, reason }); console.log(`\n-- ${step.name}: skipped (${reason})`); continue; }
      console.log(`\n-- ${step.name}`);
      const t = Date.now();
      const r = spawnSync(step.cmd[0]!, step.cmd.slice(1), { cwd: step.cwd ?? repo, stdio: "inherit", timeout: (step.minutes ?? 10) * 60_000 });
      const status = r.status === 0 ? "pass" : "fail";
      results.push({ name: step.name, status, ms: Date.now() - t, ...(r.error ? { reason: r.error.message } : r.signal ? { reason: `stopped by ${r.signal}` } : {}) });
      if (status === "fail" && !flags.includes("--keep-going")) break;
    }

    const failed = results.filter(r => r.status === "fail");
    const skipped = results.filter(r => r.status === "skip");
    const passed = !failed.length && (!strict || !skipped.length) && results.length === chosen.length;
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`\n${tier}: ${passed ? "PASS" : "FAIL"} in ${seconds}s`);
    for (const r of results) console.log(`  ${r.status.padEnd(4)} ${r.name}${r.reason ? `  (${r.reason})` : ""}${r.ms ? `  ${Math.round(r.ms / 1000)}s` : ""}`);
    if (results.length < chosen.length) console.log(`  not run: ${chosen.slice(results.length).map(s => s.name).join(", ")}`);

    // A receipt attests a commit: only a whole tier, run on a clean tree, outside hosted CI.
    if (only || process.env.CI) return passed ? 0 : 1;
    if (git("status", "--porcelain") !== "") { console.log("  no receipt: the tree has uncommitted changes"); return passed ? 0 : 1; }
    const all: Record<string, unknown> = receipts();
    all[tier] = { result: passed ? "pass" : "fail", at: new Date().toISOString(), platform: `${process.platform}-${process.arch}`, node: process.version,
      seconds, skipped: skipped.map(s => `${s.name}: ${s.reason}`), failed: failed.map(s => s.name) };
    // One line per tier, result first, so the shell hooks and sandbox runner can read it too.
    const note = `{\n${Object.entries(all).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n}`;
    git("notes", "--ref", "ci", "add", "-f", "-m", note, "HEAD");
    console.log(`  receipt recorded on ${git("rev-parse", "--short", "HEAD")} (refs/notes/ci; share it with: node scripts/ci.ts publish)`);
    return passed ? 0 : 1;
  }

  const [command = "quick", ...flags] = process.argv.slice(2);
  let code = 0;
  if (command === "help" || command === "--help") console.log(`${usage}\ntiers: ${Object.keys(config.tiers).join(", ")}`);
  else if (command === "secrets") code = secrets(flags.includes("--staged"));
  else if (command === "status") {
    const all = receipts(); const tier = flags[0];
    console.log(Object.keys(all).length ? JSON.stringify(tier ? { [tier]: all[tier] } : all, null, 2) : `no receipt for ${git("rev-parse", "--short", "HEAD")}`);
    code = tier && all[tier]?.result !== "pass" ? 1 : 0;
  } else if (command === "receipt") {
    const positional = flags.filter(f => !f.startsWith("--"));
    const sha = positional[0] ?? "HEAD", tier = positional[1] ?? "full";
    const r = receipts(sha)[tier];
    const pass = r?.result === "pass";
    const msg = pass ? `${tier} passed on ${r.platform} at ${r.at}` : `no passing ${tier} receipt for ${sha.slice(0, 12)}: run node scripts/ci.ts ${tier} on a machine, then publish`;
    console.log(process.env.GITHUB_ACTIONS && !pass ? `::warning::${msg}` : msg);
    code = flags.includes("--require") && !pass ? 1 : 0;
  } else if (command === "publish") execFileSync("git", ["-C", repo, "push", "origin", "refs/notes/ci"], { stdio: "inherit" });
  else if (command === "hooks") { git("config", "core.hooksPath", ".githooks"); console.log("git hooks: .githooks (pre-commit secret scan, pre-push quick tier)"); }
  else code = await run(command, flags);
  process.exitCode = code;
}

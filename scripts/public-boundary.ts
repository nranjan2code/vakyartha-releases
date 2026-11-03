// A public repository must never lead to private ones. Fails on any tracked text that
// names a private repository's URL, a local path, or a submodule. Identical copy in
// vakyartha-releases and vakyartha-capabilities.
//   node scripts/public-boundary.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = "nranjan2code";
const PRIVATE = ["vakyartha", "Projection", "sandbox"];
const PUBLIC = new Set(["vakyartha-releases", "vakyartha-capabilities"]);
// owner/name as a URL, a git remote, an API path or a bare "owner/name" string.
const repoRef = new RegExp(`(?:github\\.com[/:]|repos/|["'\\s(\`])${OWNER}/([A-Za-z0-9._-]+)`, "g");
const localPath = /(?:\/Users\/[a-z][\w.-]*\/|~\/Projects\/|\/private\/tmp\/claude)/;
const files = execFileSync("git", ["-C", repo, "ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
const problems: string[] = [];
if (files.includes(".gitmodules")) problems.push(".gitmodules: a public repository has no submodules");
for (const file of files) {
  if (file === "scripts/public-boundary.ts") continue;
  let text: string;
  try { text = readFileSync(path.join(repo, file), "utf8"); } catch { continue; }
  if (text.includes("\0")) continue;
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(repoRef)) {
      const name = m[1]!.replace(/\.git$/, "").replace(/[.,;:)]+$/, "");
      if (PRIVATE.includes(name) && !PUBLIC.has(name)) problems.push(`${file}:${i + 1}: names the private repository ${OWNER}/${name}`);
    }
    if (localPath.test(line)) problems.push(`${file}:${i + 1}: names a local path`);
  });
}
if (problems.length) { for (const p of problems) console.error(`public boundary: ${p}`); process.exitCode = 1; }
else console.log(`public boundary: ${files.length} files name no private repository or local path`);

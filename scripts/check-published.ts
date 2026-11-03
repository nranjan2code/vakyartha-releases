// Download every published release from GitHub and verify it exactly as a person would:
// checksums, the owner's signature and the tag. Network only; nothing is changed.
//   node scripts/check-published.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRelease } from "./verify.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { releases } = JSON.parse(readFileSync(path.join(repo, "site/releases.json"), "utf8")) as { releases: { tag: string; assets: { name: string; sha256: string }[] }[] };
let failed = 0;
for (const r of releases) {
  const dir = mkdtempSync(path.join(tmpdir(), "vak-published-"));
  try {
    execFileSync("gh", ["release", "download", r.tag, "-R", "nranjan2code/vakyartha-releases", "-D", dir], { stdio: "ignore" });
    verifyRelease(dir, r.tag);
    console.log(`verified ${r.tag}`);
  } catch (e) { failed++; console.error(`${r.tag}: ${(e as Error).message}`); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
if (!releases.length) console.log("no published releases yet");
process.exitCode = failed ? 1 : 0;

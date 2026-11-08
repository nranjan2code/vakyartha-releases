// Verify a downloaded Vakyartha release, with nothing but Node.js (22 or newer).
//   node scripts/verify.ts <folder with the release files> [vX.Y.Z+YYMMDDNN]
// Checks that every file matches SHA256SUMS.txt, that the release record
// (runtime-manifest.json) carries the owner's Ed25519 signature for release.pub,
// and that the record names the version and build of the tag. Exit 0 means all three hold.
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPKI = Buffer.from("302a300506032b6570032100", "hex");

// The only files a release may contain. Anything else, above all source code, is refused.
export const ALLOWED = [/^Vakyartha_\d+\.\d+\.\d+_(aarch64|x64)\.dmg$/, /^Vakyartha_\d+\.\d+\.\d+_(aarch64|x64)\.app\.zip$/, /^SHA256SUMS\.txt$/, /^runtime-manifest\.json$/, /^runtime-manifest\.json\.sig$/];
export const TAG = /^v(\d+\.\d+\.\d+)\+(\d{8})$/;

export const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

export function verifyRecord(record: Buffer, signatureHex: string, publicHex: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(publicHex) || !/^[0-9a-f]{128}$/.test(signatureHex)) return false;
  const key = createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(publicHex, "hex")]), format: "der", type: "spki" });
  return verify(null, record, key, Buffer.from(signatureHex, "hex"));
}

export function verifyRelease(dir: string, tag?: string, publicHex = readFileSync(path.join(here, "release.pub"), "utf8").trim()): { version: string; build: string } {
  const problems: string[] = [];
  // Staging-only files the publisher reads (notes, body, stage) are never uploaded.
  const present = readdirSync(dir).filter(f => !f.startsWith(".") && !["release-notes.md", "release-body.md", "stage.txt"].includes(f));
  for (const f of present) if (!ALLOWED.some(r => r.test(f))) problems.push(`${f} is not a release file; a release carries only the app, checksums and the signed record`);

  const sumsFile = path.join(dir, "SHA256SUMS.txt");
  if (!existsSync(sumsFile)) problems.push("SHA256SUMS.txt is missing");
  else {
    const listed = new Set<string>();
    for (const line of readFileSync(sumsFile, "utf8").split("\n").filter(Boolean)) {
      const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
      if (!m) { problems.push(`SHA256SUMS.txt: unreadable line "${line}"`); continue; }
      const [, hash, name] = m as unknown as [string, string, string];
      listed.add(name);
      const file = path.join(dir, name);
      if (!existsSync(file)) problems.push(`${name} is listed but missing`);
      else if (sha256(file) !== hash) problems.push(`${name} does not match its checksum`);
    }
    for (const f of present) if (f !== "SHA256SUMS.txt" && !listed.has(f)) problems.push(`${f} is not listed in SHA256SUMS.txt`);
  }

  const recordFile = path.join(dir, "runtime-manifest.json");
  let version = "", build = "";
  if (!existsSync(recordFile) || !existsSync(`${recordFile}.sig`)) problems.push("the signed release record (runtime-manifest.json and .sig) is missing");
  else {
    const record = readFileSync(recordFile);
    if (!verifyRecord(record, readFileSync(`${recordFile}.sig`, "utf8").trim(), publicHex)) problems.push("the release record is not signed by the key in release.pub");
    const v = (JSON.parse(record.toString("utf8")) as { vakyartha?: { version?: string; build?: string } }).vakyartha;
    version = v?.version ?? ""; build = v?.build ?? "";
    if (!/^\d{8}$/.test(build)) problems.push("the release record is not a numbered release build");
    const t = tag ? TAG.exec(tag) : null;
    if (tag && (!t || t[1] !== version || t[2] !== build)) problems.push(`the record is ${version}+${build}, not ${tag}`);
    for (const f of present) { const m = /^Vakyartha_(\d+\.\d+\.\d+)_/.exec(f); if (m && m[1] !== version) problems.push(`${f} is not version ${version}`); }
  }
  if (problems.length) throw new Error(`Release check failed:\n- ${problems.join("\n- ")}`);
  return { version, build };
}

if (import.meta.main) {
  const [dir, tag] = process.argv.slice(2);
  if (!dir) { console.error("usage: node scripts/verify.ts <release folder> [vX.Y.Z+YYMMDDNN]"); process.exit(2); }
  try {
    const { version, build } = verifyRelease(path.resolve(dir), tag);
    console.log(`Verified: Vakyartha ${version} build ${build}. Every file matches its checksum and the release record carries the owner's signature.`);
  } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}

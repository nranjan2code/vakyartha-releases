// Every rule for this repository: the release index, the public key, the page.
//   node scripts/check.ts
import { createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED, TAG } from "./verify.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => readFileSync(path.join(repo, f), "utf8");
const problems: string[] = [];

const pub = read("release.pub").trim();
if (!/^[0-9a-f]{64}$/.test(pub)) problems.push("release.pub is not a 32-byte Ed25519 key in hex");
else {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pub, "hex")]);
  const pem = createPublicKey({ key: der, format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString().trim();
  if (read("release.pem").trim() !== pem) problems.push("release.pem is not the same key as release.pub");
}

type Release = { version: string; build: string; tag: string; date: string; platform: string; notes: string; assets: { name: string; bytes: number; sha256: string }[] };
const data = JSON.parse(read("site/releases.json")) as { schema: number; product: string; releases: Release[] };
if (data.schema !== 1 || data.product !== "Vakyartha" || !Array.isArray(data.releases)) problems.push("site/releases.json: schema 1, product Vakyartha, releases[]");
const seen = new Set<string>();
let previous = "99999999";
for (const r of data.releases ?? []) {
  const t = TAG.exec(r.tag);
  if (!t || t[1] !== r.version || t[2] !== r.build) problems.push(`${r.tag}: tag must be v<version>+<build>`);
  if (seen.has(r.build)) problems.push(`${r.tag}: build number ${r.build} is used twice`);
  seen.add(r.build);
  if (r.build >= previous) problems.push(`${r.tag}: releases are listed newest first`);
  previous = r.build;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) problems.push(`${r.tag}: date must be YYYY-MM-DD`);
  if (!r.notes?.trim()) problems.push(`${r.tag}: release notes are empty`);
  if (/\]\((?!https?:)/.test(r.notes ?? "")) problems.push(`${r.tag}: notes link a repository file`);
  const names = (r.assets ?? []).map(a => a.name);
  for (const a of r.assets ?? []) {
    if (!ALLOWED.some(x => x.test(a.name))) problems.push(`${r.tag}: ${a.name} is not a release file`);
    if (!/^[0-9a-f]{64}$/.test(a.sha256) || !(a.bytes > 0)) problems.push(`${r.tag}: ${a.name} needs bytes and sha256`);
  }
  for (const need of ["SHA256SUMS.txt", "runtime-manifest.json", "runtime-manifest.json.sig"]) if (!names.includes(need)) problems.push(`${r.tag}: missing ${need}`);
  if (!names.some(n => n.endsWith(".dmg"))) problems.push(`${r.tag}: missing the DMG`);
}

for (const k of ["release.pub", "release.pem"]) if (!existsSync(path.join(repo, "site", k)) || read(`site/${k}`) !== read(k)) problems.push(`site/${k} must be an exact copy of ${k}`);
const page = read("site/index.html");
for (const asset of ["assets/icon.svg", "assets/songbird-reverse.svg", "assets/InterVariable.woff2"]) {
  if (!page.includes(asset)) problems.push(`site/index.html does not use ${asset}`);
  if (!existsSync(path.join(repo, "site", asset))) problems.push(`site/${asset} is missing`);
}
if (/<script[^>]+src=["']https?:/.test(page) || /<link[^>]+href=["']https?:/.test(page)) problems.push("site/index.html loads code or styles from another site");

if (problems.length) { for (const p of problems) console.error(`check: ${p}`); process.exitCode = 1; }
else console.log(`ok: ${data.releases.length} published release(s); key, index and page are consistent`);

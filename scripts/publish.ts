// Publish a Vakyartha release build here. Owner only, at the owner's Mac. Two steps,
// with the owner signing the release record in between:
//   node scripts/publish.ts stage <vakyartha checkout>   copy the build out and refuse any source
//   node <vakyartha checkout>/scripts/release-signing.ts sign staging/<tag>/runtime-manifest.json
//   node scripts/publish.ts release staging/<tag>         verify, confirm, publish
//   node scripts/publish.ts feed <vakyartha checkout> staging/<tag> --rollout N [--min N] [--block N,N]
//                                                         offer it to installed apps: write, sign (owner), upload
// Vakyartha's source code is never published: only the app (DMG and ZIP), checksums and
// the signed record leave the machine, and stage refuses a bundle that carries source.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { confirmTyped } from "./human.ts";
import { sha256, TAG, verifyRelease } from "./verify.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "nranjan2code/vakyartha-releases";
const run = (cmd: string, args: string[], cwd = repo) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() && !d.isSymbolicLink() ? [p + "/", ...walk(p)] : [p];
  });
}

// Refuse a bundle that would publish source: source files, source maps, repository
// metadata, or engine bundles that still carry comments (an unminified build).
// Catalog apps and skills inside the bundle are already public in the catalog.
export function sourceGuard(app: string): string[] {
  const problems: string[] = [];
  const res = path.join(app, "Contents/Resources/resources");
  const publicTrees = ["catalog-apps/", "catalog-skills/", "core-skills/", "npm/", "duckdb-runtime/"].map(t => path.join(res, t));
  for (const file of walk(app)) {
    const rel = path.relative(app, file);
    if (publicTrees.some(t => file.startsWith(t))) continue;
    if (/(^|\/)\.git\/$|(^|\/)\.git$/.test(rel)) problems.push(`${rel}: repository metadata`);
    else if (/\.(ts|tsx|mts|cts|rs|swift|map)$/.test(file) && !file.endsWith(".d.ts")) problems.push(`${rel}: source file`);
    else if (/\.(mjs|js)$/.test(file) && statSync(file).size > 20_000) {
      const text = readFileSync(file, "utf8");
      if (/\/\/# sourceMappingURL=/.test(text)) problems.push(`${rel}: links a source map`);
      const commentLines = text.split("\n").filter(l => /^\s*\/\/ /.test(l)).length;
      if (commentLines > 20) problems.push(`${rel}: ${commentLines} comment lines; release bundles must be minified`);
    }
  }
  return problems;
}

// Public notes are written for people installing Vakyartha: release-notes/<version>.md in the
// checkout. CHANGELOG.md is the internal record and is never published.
function notesFor(checkout: string, version: string): string {
  const file = path.join(checkout, "release-notes", `${version}.md`);
  if (!existsSync(file)) throw new Error(`No public notes at release-notes/${version}.md; write them for people installing Vakyartha (not the internal CHANGELOG).`);
  const notes = readFileSync(file, "utf8").trim();
  // Public notes name no private repository, path or commit link.
  if (/github\.com\/nranjan2code\/(vakyartha|Projection|sandbox)(?![-\w])|\]\((?!https?:)/.test(notes)) throw new Error("The public notes link a private repository or a repository file; rewrite them for a public reader.");
  return notes;
}

async function stage(checkout: string) {
  const bundle = path.join(checkout, "src-tauri/target/release/bundle");
  const app = path.join(bundle, "macos/Vakyartha.app");
  if (!existsSync(app)) throw new Error(`No release bundle at ${app}; build it with scripts/release-build.ts.`);
  const record = path.join(app, "Contents/Resources/resources/runtime-manifest.json");
  const { vakyartha } = JSON.parse(readFileSync(record, "utf8")) as { vakyartha: { version: string; build: string } };
  if (!/^\d{8}$/.test(vakyartha.build)) throw new Error("This bundle is not a numbered release build.");
  const tag = `v${vakyartha.version}+${vakyartha.build}`;
  const problems = sourceGuard(app);
  if (problems.length) throw new Error(`Refusing to publish: the bundle carries source.\n- ${problems.slice(0, 20).join("\n- ")}`);
  const dmg = readdirSync(path.join(bundle, "dmg")).find(f => new RegExp(`^Vakyartha_${vakyartha.version.replace(/\./g, "\\.")}_(aarch64|x64)\\.dmg$`).test(f));
  if (!dmg) throw new Error(`No Vakyartha_${vakyartha.version}_<arch>.dmg in ${path.join(bundle, "dmg")}.`);
  const arch = /_(aarch64|x64)\.dmg$/.exec(dmg)![1];
  const out = path.join(repo, "staging", tag);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  copyFileSync(path.join(bundle, "dmg", dmg), path.join(out, dmg));
  execFileSync("ditto", ["-c", "-k", "--keepParent", app, path.join(out, `Vakyartha_${vakyartha.version}_${arch}.app.zip`)]);
  copyFileSync(record, path.join(out, "runtime-manifest.json"));
  writeFileSync(path.join(out, "release-notes.md"), notesFor(checkout, vakyartha.version) + "\n");
  // A release stage ("Alpha 1") names the release and marks it a pre-release on GitHub.
  const stageLabel = (JSON.parse(readFileSync(path.join(checkout, "package.json"), "utf8")) as { stage?: string }).stage ?? "";
  writeFileSync(path.join(out, "stage.txt"), stageLabel + "\n");
  console.log(`Staged ${tag} in ${path.relative(repo, out)}. Now sign the record (owner):\n  node ${path.join(checkout, "scripts/release-signing.ts")} sign ${path.join(out, "runtime-manifest.json")}\nthen: node scripts/publish.ts release ${path.relative(repo, out)}`);
}

async function release(dir: string) {
  const tag = path.basename(dir);
  const t = TAG.exec(tag);
  if (!t) throw new Error(`${dir} is not a staged release folder (vX.Y.Z+YYMMDDNN).`);
  if (git("status", "--porcelain")) throw new Error("This repository has uncommitted changes; publish from a clean main.");
  const files = readdirSync(dir).filter(f => /\.(dmg|zip)$/.test(f) || f.startsWith("runtime-manifest.json")).sort();
  writeFileSync(path.join(dir, "SHA256SUMS.txt"), files.map(f => `${sha256(path.join(dir, f))}  ${f}`).join("\n") + "\n");
  verifyRelease(dir, tag);
  const data = JSON.parse(readFileSync(path.join(repo, "site/releases.json"), "utf8")) as { releases: unknown[] };
  if ((data.releases as { tag: string }[]).some(r => r.tag === tag)) throw new Error(`${tag} is already published.`);
  const notes = readFileSync(path.join(dir, "release-notes.md"), "utf8").trim();
  await confirmTyped(`Publish Vakyartha ${t[1]} build ${t[2]} publicly as`, tag);
  const all = [...files, "SHA256SUMS.txt"];
  data.releases.unshift({
    version: t[1], ...(existsSync(path.join(dir, "stage.txt")) && readFileSync(path.join(dir, "stage.txt"), "utf8").trim() ? { stage: readFileSync(path.join(dir, "stage.txt"), "utf8").trim() } : {}), build: t[2], tag, date: new Date().toISOString().slice(0, 10), platform: "macOS on Apple Silicon", notes,
    assets: all.map(name => ({ name, bytes: statSync(path.join(dir, name)).size, sha256: sha256(path.join(dir, name)) })),
  });
  writeFileSync(path.join(repo, "site/releases.json"), JSON.stringify(data, null, 2) + "\n");
  run(process.execPath, ["scripts/check.ts"]);
  run("git", ["add", "site/releases.json"]);
  run("git", ["commit", "-m", `Release Vakyartha ${t[1]} build ${t[2]}`]);
  run("git", ["tag", "-a", tag, "-m", `Vakyartha ${t[1]} build ${t[2]}`]);
  run("git", ["push", "origin", "main", tag]);
  const body = `${notes}\n\n---\nBuild ${t[2]}. Verify before installing: download every file into one folder, then \`shasum -a 256 -c SHA256SUMS.txt\`; to check the owner's signature, \`node scripts/verify.ts <folder> ${tag}\` from this repository. Not yet signed with an Apple Developer ID: allow it under System Settings, Privacy & Security.`;
  writeFileSync(path.join(dir, "release-body.md"), body + "\n");
  const stageFile = path.join(dir, "stage.txt");
  const stageLabel = existsSync(stageFile) ? readFileSync(stageFile, "utf8").trim() : "";
  run("gh", ["release", "create", tag, "-R", REPO, "--verify-tag", ...(stageLabel ? ["--prerelease"] : []), "--title", stageLabel ? `Vakyartha ${t[1]} (${stageLabel})` : `Vakyartha ${t[1]}`, "--notes-file", path.join(dir, "release-body.md"), ...all.map(f => path.join(dir, f))]);
  console.log(`Published ${tag}. The download page updates when the Pages workflow finishes.`);
}

// Installed Vakyartha checks one signed update file per platform, kept on the fixed
// "update-feed" release. Republishing it with another rollout widens, halts or rolls back the offer.
async function feed(checkout: string, dir: string, args: string[]) {
  const tag = path.basename(dir);
  const t = TAG.exec(tag);
  if (!t) throw new Error(`${dir} is not a staged release folder (vX.Y.Z+YYMMDDNN).`);
  const zip = readdirSync(dir).find(f => f.endsWith(".app.zip"));
  if (!zip) throw new Error(`No app ZIP in ${dir}.`);
  const option = (name: string, fallback: string) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1] ?? fallback; };
  const tool = path.join(checkout, "scripts/update-feed.ts");
  // Updates download their own copy on the update-feed release, so its download count is the
  // number of updates and the version release's counts stay manual downloads (scripts/stats.ts).
  const update = `Vakyartha_${t[1]}_${t[2]}_${/_(aarch64|x64)\.app\.zip$/.exec(zip)?.[1] ?? "aarch64"}.update.zip`;
  const url = `https://github.com/${REPO}/releases/download/update-feed/${update}`;
  run(process.execPath, [tool, "write", "stable", "--zip", path.join(dir, zip), "--version", t[1]!, "--sequence", t[2]!, "--url", url,
    "--notes-file", path.join(dir, "release-notes.md"), "--rollout", option("rollout", "1"), "--min", option("min", "0"), "--block", option("block", ""), "--out", dir]);
  const file = readdirSync(dir).find(f => /^stable-darwin-.+\.json$/.test(f));
  if (!file) throw new Error("The update file was not written.");
  run(process.execPath, [tool, "sign", "stable", path.join(dir, file)]);
  const tags = execFileSync("gh", ["release", "list", "-R", REPO, "--json", "tagName", "-q", ".[].tagName"], { encoding: "utf8" }).split("\n");
  if (!tags.includes("update-feed")) run("gh", ["release", "create", "update-feed", "-R", REPO, "--prerelease", "--title", "Update feed", "--notes", "The signed update files installed Vakyartha reads. Downloads are on the releases page."]);
  copyFileSync(path.join(dir, zip), path.join(dir, update));
  // The package first, then the update file naming it.
  run("gh", ["release", "upload", "update-feed", path.join(dir, update), "--clobber", "-R", REPO]);
  run("gh", ["release", "upload", "update-feed", path.join(dir, file), path.join(dir, `${file}.sig`), "--clobber", "-R", REPO]);
  console.log(`Installed Vakyartha now sees ${tag} at ${option("rollout", "1")}% rollout.`);
}

if (import.meta.main) {
  const [command, target] = process.argv.slice(2);
  if (process.platform !== "darwin") throw new Error("Releases are published from the owner's Mac.");
  if (command === "stage" && target) await stage(path.resolve(target));
  else if (command === "release" && target) await release(path.resolve(target));
  else if (command === "feed" && target && process.argv[4]) await feed(path.resolve(target), path.resolve(process.argv[4]), process.argv.slice(5));
  else { console.error("usage: node scripts/publish.ts stage <vakyartha checkout> | release staging/<tag> | feed <vakyartha checkout> staging/<tag> --rollout N"); process.exit(2); }
}

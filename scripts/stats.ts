// Download and update counts, from GitHub's own per-file download counters: pure numbers,
// nothing about who downloaded. Installed Vakyartha sends nothing; it only fetches files.
//   node scripts/stats.ts
// Downloads: the DMG and app ZIP on each version release (people installing by hand).
// Updates: the <version>_<build>_<arch>.update.zip files on the update-feed release.
// Update checks: the update file (stable-darwin-<arch>.json) on the update-feed release.
import { execFileSync } from "node:child_process";

const REPO = "nranjan2code/vakyartha-releases";
interface Asset { name: string; download_count: number }
interface Release { tag_name: string; assets: Asset[] }

const releases = JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${REPO}/releases?per_page=100`], { encoding: "utf8" })).flat() as Release[];
const count = (assets: Asset[], test: (name: string) => boolean) => assets.filter(a => test(a.name)).reduce((n, a) => n + a.download_count, 0);
const feed = releases.find(r => r.tag_name === "update-feed");
const rows = releases.filter(r => r.tag_name !== "update-feed").map(r => {
  const build = /\+(\d{8})$/.exec(r.tag_name)?.[1] ?? "";
  return {
    release: r.tag_name,
    dmg: count(r.assets, n => n.endsWith(".dmg")),
    zip: count(r.assets, n => n.endsWith(".app.zip")),
    updates: feed ? count(feed.assets, n => n.endsWith(".update.zip") && n.includes(`_${build}_`)) : 0,
  };
});
console.table(rows);
const total = (key: "dmg" | "zip" | "updates") => rows.reduce((n, r) => n + r[key], 0);
console.log(`Downloads: ${total("dmg") + total("zip")} (DMG ${total("dmg")}, ZIP ${total("zip")}). Updates: ${total("updates")}. Update checks: ${feed ? count(feed.assets, n => n.endsWith(".json")) : 0}.`);

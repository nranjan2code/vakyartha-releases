// The releases repository's local CI steps. The runner, receipts, hooks and secret scan
// are in ci-core.ts (shared with Vakyartha, Projection and the catalog). Tiers:
//   quick    before every push (the pre-push hook runs it): secrets, public boundary, docs,
//            index/key/page rules, verifier tests
//   full     before publishing: quick + every published release's files re-verified from GitHub
//   mirror   what GitHub's runner checks (.github/workflows/check.yml); this repository is public
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main, type Step } from "./ci-core.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const script = (file: string, ...args: string[]) => [node, `scripts/${file}`, ...args];

const quick: Step[] = [
  { name: "secrets", cmd: script("ci.ts", "secrets") },
  { name: "public-boundary", cmd: script("public-boundary.ts") },
  { name: "docs", cmd: script("docs-check.ts") },
  { name: "check", cmd: script("check.ts") },
  { name: "tests", cmd: [node, "--test", "tests/"] },
];
const full: Step[] = [...quick, { name: "published", cmd: script("check-published.ts"), minutes: 30 }];

await main({ repo, tiers: { quick, full, mirror: quick }, needs: {} });

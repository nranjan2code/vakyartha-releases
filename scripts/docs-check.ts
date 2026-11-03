// Check repository Markdown without following external links or reading private data.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"], { cwd: root, encoding: "utf8" }).split("\0"))]
  .filter(file => file && !file.startsWith("framework/") && existsSync(path.join(root, file))).sort();

function prose(text: string): string {
  let fence = "";
  return text.split("\n").map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = "";
      return "";
    }
    if (marker) { fence = marker; return ""; }
    return line;
  }).join("\n").replace(/<!--[\s\S]*?-->/g, value => value.replace(/[^\n]/g, ""));
}

function anchors(text: string): Set<string> {
  const ids = new Set<string>();
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]!);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let heading = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (!heading && line.trim() && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1] ?? "")) heading = line.trim();
    if (!heading) continue;
    const slug = heading.replace(/`+([^`]+)`+/g, (_, code: string) => code.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
      .replace(/<[^>]*>/g, "").replace(/&(?:lt|gt|amp);/g, entity => ({ "&lt;": "<", "&gt;": ">", "&amp;": "&" })[entity]!)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, "").replace(/\s/g, "-");
    let id = slug;
    let suffix = 1;
    while (ids.has(id)) id = `${slug}-${suffix++}`;
    ids.add(id);
  }
  return ids;
}

const headings = new Map<string, Set<string>>();
let checked = 0;
const failures: string[] = [];
function check(file: string, url: string, line: number): void {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return;
  checked++;
  const hash = url.indexOf("#");
  let destination: string;
  let anchor: string;
  try {
    const location = (hash < 0 ? url : url.slice(0, hash)).split("?")[0]!;
    destination = !location ? path.join(root, file) : location.startsWith("/")
      ? path.resolve(root, decodeURIComponent(location.slice(1)))
      : path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(location));
    anchor = hash < 0 ? "" : decodeURIComponent(url.slice(hash + 1));
  } catch {
    failures.push(`${file}:${line}: invalid URL ${url}`);
    return;
  }
  if (!existsSync(destination)) {
    failures.push(`${file}:${line}: missing file ${url}`);
    return;
  }
  if (!anchor || !destination.endsWith(".md") || !statSync(destination).isFile()) return;
  let ids = headings.get(destination);
  if (!ids) { ids = anchors(prose(readFileSync(destination, "utf8"))); headings.set(destination, ids); }
  if (!ids.has(anchor)) failures.push(`${file}:${line}: missing anchor ${url}`);
}

for (const file of files) {
  const text = prose(readFileSync(path.join(root, file), "utf8"));
  const references = new Map<string, string>();
  const normalize = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();
  const patterns = [
    /\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g,
    /^ {0,3}\[([^\]\n]+)\]:\s*(?:<([^>\n]+)>|([^\s]+))/gm,
    /\b(?:href|src)=["']([^"']+)["']/g,
  ];
  for (const [index, pattern] of patterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      const url = index === 1 ? match[2] ?? match[3]! : match[1] ?? match[2]!;
      if (index === 1) references.set(normalize(match[1]!), url);
      check(file, url, text.slice(0, match.index).split("\n").length);
    }
  }
  for (const match of text.matchAll(/\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?![\[(])/g)) {
    const url = references.get(normalize(match[2] || match[1]!));
    if (url) check(file, url, text.slice(0, match.index).split("\n").length);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`${failures.length} broken local links among ${checked} checked in ${files.length} Markdown files.`);
  process.exitCode = 1;
} else console.log(`Checked ${checked} local links and anchors in ${files.length} Markdown files.`);

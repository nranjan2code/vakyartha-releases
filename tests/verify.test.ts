// The verifier accepts exactly a signed, complete release and refuses everything else.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256, verifyRelease } from "../scripts/verify.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");

function release(record = { vakyartha: { version: "1.0.0", build: "26110301" } }, extra: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "vak-release-"));
  const files: Record<string, string> = { "Vakyartha_1.0.0_aarch64.dmg": "dmg bytes", "Vakyartha_1.0.0_aarch64.app.zip": "zip bytes", ...extra };
  const json = JSON.stringify(record);
  files["runtime-manifest.json"] = json;
  files["runtime-manifest.json.sig"] = sign(null, Buffer.from(json), privateKey).toString("hex") + "\n";
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  writeFileSync(path.join(dir, "SHA256SUMS.txt"), Object.keys(files).map(n => `${sha256(path.join(dir, n))}  ${n}`).join("\n") + "\n");
  return dir;
}

test("a complete signed release verifies against its tag", () => {
  assert.deepEqual(verifyRelease(release(), "v1.0.0+26110301", pub), { version: "1.0.0", build: "26110301" });
});
test("a different tag, a changed file or another key is refused", () => {
  assert.throws(() => verifyRelease(release(), "v1.0.1+26110301", pub), /not v1\.0\.1/);
  const dir = release(); writeFileSync(path.join(dir, "Vakyartha_1.0.0_aarch64.dmg"), "tampered");
  assert.throws(() => verifyRelease(dir, undefined, pub), /does not match its checksum/);
  const other = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
  assert.throws(() => verifyRelease(release(), undefined, other), /not signed/);
});
test("source code or any other file is never part of a release", () => {
  assert.throws(() => verifyRelease(release(undefined, { "main.ts": "export {}" }), undefined, pub), /main\.ts is not a release file/);
  assert.throws(() => verifyRelease(release(undefined, { "source.zip": "x" }), undefined, pub), /source\.zip is not a release file/);
});
test("a development build is never a release", () => {
  assert.throws(() => verifyRelease(release({ vakyartha: { version: "1.0.0", build: "dev" } }), undefined, pub), /not a numbered release build/);
});

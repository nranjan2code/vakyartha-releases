<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="site/assets/lockup-reverse.svg">
    <img src="site/assets/lockup-colour.svg" width="360" alt="Vakyartha">
  </picture>
</p>

<p align="center"><b>Ask. Then go live your day.</b><br>Signed release builds of Vakyartha for macOS.</p>

<p align="center"><a href="https://nranjan2code.github.io/vakyartha-releases/"><b>Download Vakyartha</b></a> · <a href="https://vakyartha.com">vakyartha.com</a> · <a href="https://nranjan2code.github.io/vakyartha-capabilities/">Apps and skills catalog</a></p>

---

# Vakyartha releases

Signed release builds of [Vakyartha](https://vakyartha.com), the private desktop assistant that answers with working interfaces.

**Download page:** <https://nranjan2code.github.io/vakyartha-releases/>

## Download

Open the [download page](https://nranjan2code.github.io/vakyartha-releases/) or the [GitHub releases](https://github.com/nranjan2code/vakyartha-releases/releases). Each release is tagged `vX.Y.Z+YYMMDDNN` (version and an 8-digit build number that is never reused) and carries exactly these files:

| File | What it is |
| --- | --- |
| `Vakyartha_X.Y.Z_aarch64.dmg` | The app for macOS on Apple Silicon |
| `Vakyartha_X.Y.Z_aarch64.app.zip` | The same app as a ZIP |
| `SHA256SUMS.txt` | SHA-256 checksums of every file |
| `runtime-manifest.json` | The release record: version, build and the exact component versions it was built from |
| `runtime-manifest.json.sig` | The owner's Ed25519 signature of the release record |

Builds are not yet signed with an Apple Developer ID. On first launch, allow the app under **System Settings → Privacy & Security → Open Anyway**.

## Verify

Put all of a release's files in one folder.

```bash
shasum -a 256 -c SHA256SUMS.txt                      # every file matches its checksum
node scripts/verify.ts <folder> vX.Y.Z+YYMMDDNN       # checksums, owner's signature and tag (Node.js 22+)
```

Without Node.js, with OpenSSL 3:

```bash
xxd -r -p runtime-manifest.json.sig > record.sig
openssl pkeyutl -verify -pubin -inkey release.pem -rawin -in runtime-manifest.json -sigfile record.sig
```

The release key is [`release.pub`](release.pub) (raw Ed25519, hex) and [`release.pem`](release.pem) (the same key, SPKI PEM). It changes only through a reviewed key rotation announced here.

## What is in this repository

| Path | Purpose |
| --- | --- |
| `site/` | The download page and `releases.json`, the list of published releases |
| `release.pub`, `release.pem` | The public release key |
| `scripts/verify.ts` | Verify a downloaded release |
| `scripts/publish.ts` | Owner only: stage, check and publish a release build |
| `scripts/check.ts`, `scripts/public-boundary.ts` | Rules for this repository |
| `scripts/ci.ts` | Local checks, hooks and receipts |

## Documents

| Document | For |
| --- | --- |
| [RELEASING.md](RELEASING.md) | How a release is published, step by step |
| [SECURITY.md](SECURITY.md) | What a release proves, what it does not, and how to report a problem |
| [AGENTS.md](AGENTS.md) | Rules for changing this repository |
| [dev-skills/](dev-skills/README.md) | The maintainer skill |

Copyright © 2026 Nisheeth Ranjan. All rights reserved.

---
name: releases-maintain
description: Publish a Vakyartha release build to this public repository, maintain the download page and release index, keep the public boundary and the never-publish-source rule, and run the checks. Owner steps (signing, publish confirmation) need a person at the owner's Mac.
---

# Maintaining Vakyartha releases

Rules: [AGENTS.md](../../AGENTS.md). Procedure: [RELEASING.md](../../RELEASING.md).

## Publish a release

Follow [RELEASING.md](../../RELEASING.md): `publish.ts stage` → owner signs the record → `publish.ts release`. Never skip `stage`'s source guard, never upload by hand, and never publish anything but the five release files.

## Change the download page

1. Edit `site/index.html` (one file: inline styles and script, no external code, styles or fonts). Brand: indigo `#101D3D`, saffron `#F5A400`, paper `#F6F5F1`; assets in `site/assets/`.
2. Check it locally, wide and at phone width, in light and dark: `python3 -m http.server 8765 --directory site`, then open `http://127.0.0.1:8765`. No sideways scroll at 375 px.
3. `node scripts/ci.ts quick`, commit, push. The Pages workflow deploys it.
4. The page reads `site/releases.json`; never hand-edit published entries.

## Checks

```bash
node scripts/ci.ts quick    # secrets, public boundary, docs, rules, verifier tests
node scripts/ci.ts full     # + every published release downloaded and verified
```

## Rotate the release key (owner, reviewed)

Only when the key is lost or exposed. Create the new key with Vakyartha's `release-signing.ts`, replace `release.pub` and `release.pem` (root and `site/`), state the change and its date in the README, and publish the next build with it. Old releases stay verifiable against the old key, recorded in the README.

# Releasing Vakyartha

How a Vakyartha build becomes a public release here. **Owner** steps are done by a person at the owner's Mac; nothing in CI signs, tags or publishes. The build itself is made in the Vakyartha source repository, which is private; this repository receives only its binaries.

## Before you start

- The build was made with Vakyartha's `release-build.ts`, which reserved its `vX.Y.Z+YYMMDDNN` tag, and passed its `release` check tier.
- Its `CHANGELOG.md` has a `## X.Y.Z` section written for a public reader (no links to private repositories or files).
- This repository is clean on `main` and `node scripts/ci.ts full` passes.

## Steps

1. **Stage** (owner):
   ```bash
   node scripts/publish.ts stage <path to the Vakyartha checkout>
   ```
   It copies the DMG, zips the app, copies the release record and the release notes into `staging/<tag>/` (never committed). It **refuses** a bundle that carries source: source files, source maps, repository metadata, or engine bundles that are not minified.
2. **Sign the record** (owner): run the command `stage` prints, Vakyartha's `release-signing.ts sign staging/<tag>/runtime-manifest.json`, type the version and build, approve the Keychain prompt.
3. **Publish** (owner):
   ```bash
   node scripts/publish.ts release staging/<tag>
   ```
   It writes `SHA256SUMS.txt`, verifies the folder exactly as a downloader would (checksums, signature, tag), asks you to type the tag, adds the entry to `site/releases.json`, runs the checks, commits, tags `vX.Y.Z+YYMMDDNN` here, pushes, and creates the GitHub release with exactly the five release files.
4. **Offer it to installed apps** (owner):
   ```bash
   node scripts/publish.ts feed <path to the Vakyartha checkout> staging/<tag> --rollout 1
   ```
   It writes the signed update file for the staged app ZIP (the owner types the build number and approves the Keychain prompt) and replaces it on the `update-feed` release, which installed Vakyartha reads. Widen with `--rollout 10`, then `100`; republish with a lower rollout to halt.
5. **Check**: the Pages workflow deploys the download page; `node scripts/ci.ts full` downloads the release back from GitHub and verifies it.

## If GitHub is unavailable

Steps 1 and 2 need no network. Keep `staging/<tag>/` and run step 3 when GitHub is back. The release is never assembled anywhere but the owner's Mac.

## Never

- Never upload anything that is not one of the five release files, except the signed update file and its signature on the `update-feed` release, and never source code in any form.
- Never edit, replace or delete a published release or its entry; publish a new build instead.
- Never reuse a build number, and never publish a development build (`build: "dev"`).

## First time only

- Pages is enabled with the workflow source, and the `github-pages` environment allows deployments from `main`.
- Rulesets protect `main` (no deletion or force push) and `v*` tags (immutable; only admins create them).

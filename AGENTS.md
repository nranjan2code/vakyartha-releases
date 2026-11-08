# AGENTS.md: Vakyartha releases

The public home of Vakyartha's release binaries and download page. Rules for any agent or person changing it. They are not negotiable.

1. **Never publish source code.** Not Vakyartha's, not its framework's, not its sandbox's, in any condition, for any reason, in any form: no source files, archives of source, source maps, repository snapshots, or unminified engine bundles. A release carries exactly the app (DMG and ZIP), `SHA256SUMS.txt`, `runtime-manifest.json` and its `.sig`. `scripts/verify.ts` refuses any other file, `scripts/publish.ts` refuses a bundle that carries source, and `scripts/check.ts` refuses an index entry with any other file.
2. **Public boundary.** This repository and its page are public. Never link to, name the path of, or pull from a private repository; never add a submodule, a secret or a token; workflows read only this repository. `node scripts/public-boundary.ts` enforces it. Release notes are written for a public reader and link only to public pages.
3. **Owner steps stay the owner's.** Signing the release record and confirming publication (`scripts/publish.ts release`, typed confirmation) are done by a person at the owner's Mac. CI never signs, tags or publishes.
4. **Releases are immutable.** A published tag and its files never change. The download page (`releases.json`) lists only the latest release; earlier entries stay in git history. A mistake is fixed forward with a new build. Build numbers are never reused.
5. **Checks on the machine first.** `node scripts/ci.ts quick` before every push (the pre-push hook enforces a passing receipt), `node scripts/ci.ts full` before publishing. Run `node scripts/ci.ts hooks` once per clone; never bypass the hooks. `scripts/ci-core.ts` is shared with Vakyartha, Projection and the catalog: keep the copies identical.
6. **One key.** `release.pub` and `release.pem` are the same key; `site/` holds exact copies. A key change is a reviewed rotation, announced in the README.
7. **Dependencies.** None. Scripts use Node built-ins; the page uses no external scripts, styles or fonts. Workflows pin actions by commit. A new dependency needs the owner's approval.
8. **Documents in step.** Update README, RELEASING, SECURITY and the [maintainer skill](dev-skills/releases-maintain/SKILL.md) in the same change as a procedure.

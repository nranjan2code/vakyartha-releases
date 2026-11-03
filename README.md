# Vakyartha releases

Release binaries for Vakyartha. This repository holds no source code.

Each release is tagged `vX.Y.Z+YYMMDDNN` (version and 8-digit build number) and carries:

- the macOS app (`.dmg` and `.zip`)
- `SHA256SUMS.txt`
- `runtime-manifest.json`, the release record naming the exact Vakyartha, Projection, sandbox and capabilities commits
- `runtime-manifest.json.sig`, the owner's Ed25519 signature of that record

The public key for checking the signature is `release.pub` in this repository.

Builds are not yet signed with an Apple Developer ID or notarized; macOS will ask you to allow the app in System Settings, Privacy & Security.

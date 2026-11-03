# Security

## What a release proves

- **Integrity:** every file matches `SHA256SUMS.txt`.
- **Authenticity:** the release record carries the owner's Ed25519 signature for the key in `release.pub`. The private key lives only in the owner's macOS Keychain.
- **Provenance:** the signed record names the version, the build number and the exact commits of every component the build was made from, and hashes of its runtime parts.

## What it does not prove

- The builds are not yet signed with an Apple Developer ID or notarized, so macOS cannot vouch for them; the owner's signature is the check.
- A signature proves who published a build, not that the software is free of defects. Known limits of each release are in its notes and on [vakyartha.com](https://vakyartha.com).

## Public boundary

This repository contains only binaries, checksums, signed records, the public key and the download page. It contains no source code and no secrets, links to no private repository, and its workflows read nothing outside it.

## Reporting a problem

Report a suspected vulnerability or a release that fails verification privately through GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability). Do not open a public issue for a security problem.

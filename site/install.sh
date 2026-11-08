#!/bin/sh
# Installs the latest Vakyartha for Mac from its public releases.
#   curl -fsSL https://nranjan2code.github.io/vakyartha-releases/install.sh | sh
# It downloads the app ZIP with curl, checks it against the release's SHA256SUMS.txt,
# checks the app is signed by Vakyartha's release identity, then puts it in Applications
# and opens it. Downloaded this way, the app opens without the one-time Open Anyway step.
# Vakyartha is a preview for personal, non-commercial use, provided as is, without warranty.
set -eu

SITE="https://nranjan2code.github.io/vakyartha-releases"
DL="https://github.com/nranjan2code/vakyartha-releases/releases/download"
ID="com.nranjan2code.vakyartha"
# The release signing certificate every Vakyartha release carries (its designated requirement).
LEAF='certificate leaf = H"9b4073ae0c04657b820a7fbd66ef1307ee14cc1c"'

say() { printf '%s\n' "$*"; }
fail() { printf 'Vakyartha was not installed: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || fail "Vakyartha runs on macOS."
[ "$(uname -m)" = arm64 ] || fail "Vakyartha needs a Mac with Apple Silicon."

WORK=$(mktemp -d "${TMPDIR:-/tmp}/vakyartha-install.XXXXXX")
trap 'rm -rf "$WORK"' EXIT INT TERM

say "Finding the latest Vakyartha release..."
curl -fsSL "$SITE/releases.json" -o "$WORK/releases.json" || fail "the release list could not be downloaded."
TAG=$(/usr/bin/plutil -extract releases.0.tag raw -o - "$WORK/releases.json" 2>/dev/null) || fail "no release is published yet."
ZIP=""
i=0
while NAME=$(/usr/bin/plutil -extract "releases.0.assets.$i.name" raw -o - "$WORK/releases.json" 2>/dev/null); do
  case "$NAME" in *.app.zip) ZIP="$NAME" ;; esac
  i=$((i + 1))
done
[ -n "$ZIP" ] || fail "the release $TAG has no app ZIP."
ENC_TAG=$(printf '%s' "$TAG" | sed 's/+/%2B/g')

say "Downloading Vakyartha $TAG..."
curl -fL --progress-bar "$DL/$ENC_TAG/$ZIP" -o "$WORK/$ZIP" || fail "the download failed."
curl -fsSL "$DL/$ENC_TAG/SHA256SUMS.txt" -o "$WORK/SHA256SUMS.txt" || fail "the checksums could not be downloaded."

say "Checking the download..."
EXPECTED=$(awk -v f="$ZIP" '$2 == f { print $1 }' "$WORK/SHA256SUMS.txt")
ACTUAL=$(/usr/bin/shasum -a 256 "$WORK/$ZIP" | awk '{ print $1 }')
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || fail "the download does not match its published checksum."

/usr/bin/ditto -x -k "$WORK/$ZIP" "$WORK/app" || fail "the app could not be unpacked."
APP="$WORK/app/Vakyartha.app"
[ -d "$APP" ] || fail "the download holds no Vakyartha.app."
/usr/bin/codesign --verify --deep --strict "$APP" 2>/dev/null || fail "the app's signature is broken."
REQ=$(/usr/bin/codesign -d -r- "$APP" 2>&1 | sed -n 's/^designated => //p')
case "$REQ" in *"identifier \"$ID\""*"$LEAF"*) ;; *) fail "the app is not signed by Vakyartha's release identity." ;; esac

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
if pgrep -f "$DEST/Vakyartha.app/Contents/MacOS/" >/dev/null 2>&1; then
  say "Quitting the running Vakyartha..."
  /usr/bin/osascript -e 'quit app "Vakyartha"' >/dev/null 2>&1 || true
  n=0
  while pgrep -f "$DEST/Vakyartha.app/Contents/MacOS/" >/dev/null 2>&1; do
    n=$((n + 1)); [ "$n" -lt 30 ] || fail "Vakyartha is still running; quit it and run this again."; sleep 1
  done
fi

say "Installing to $DEST..."
rm -rf "$DEST/Vakyartha.app.new"
/usr/bin/ditto "$APP" "$DEST/Vakyartha.app.new" || fail "the app could not be copied to $DEST."
rm -rf "$DEST/Vakyartha.app"
mv "$DEST/Vakyartha.app.new" "$DEST/Vakyartha.app"
/usr/bin/xattr -dr com.apple.quarantine "$DEST/Vakyartha.app" 2>/dev/null || true

say "Vakyartha $TAG is installed. Opening it."
say "A preview for personal, non-commercial use, provided as is, without warranty. Not for production machines."
/usr/bin/open "$DEST/Vakyartha.app"

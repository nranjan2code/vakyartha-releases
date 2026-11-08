#!/bin/sh
# Installs the latest Vakyartha for Mac from its public releases.
#   curl -fsSL https://nranjan2code.github.io/vakyartha-releases/install.sh | sh
# It downloads the app ZIP with curl (retrying and resuming a stalled download), checks it
# against the checksum in the release list and in the release's SHA256SUMS.txt, checks the
# app is signed by Vakyartha's release identity, then swaps it into Applications (the old
# copy comes back if anything fails) and opens it. Downloaded this way, the app opens
# without the one-time Open Anyway step.
#   VAK_REINSTALL=1   install even when this build is already installed
#   NO_COLOR=1        plain output
# Vakyartha is a preview for personal, non-commercial use, provided as is, without warranty.
set -eu

SITE="https://nranjan2code.github.io/vakyartha-releases"
DL="https://github.com/nranjan2code/vakyartha-releases/releases/download"
ID="com.nranjan2code.vakyartha"
# The release signing certificate every Vakyartha release carries (its designated requirement).
LEAF='certificate leaf = H"9b4073ae0c04657b820a7fbd66ef1307ee14cc1c"'
STEPS=5

# --- Output -------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != dumb ]; then
  B=$(printf '\033[1m'); D=$(printf '\033[2m'); G=$(printf '\033[32m'); R=$(printf '\033[31m'); A=$(printf '\033[36m'); N=$(printf '\033[0m'); CL=$(printf '\r\033[K'); TTY=1
else
  B=""; D=""; G=""; R=""; A=""; N=""; CL=""; TTY=""
fi
step=0
head() { step=$((step + 1)); printf '\n%s[%s/%s]%s %s%s%s\n' "$A" "$step" "$STEPS" "$N" "$B" "$*" "$N"; }
ok() { printf '      %s✓%s %s\n' "$G" "$N" "$*"; }
note() { printf '      %s%s%s\n' "$D" "$*" "$N"; }
fail() { [ -n "$TTY" ] && printf '%s' "$CL"; printf '\n      %s✗ Vakyartha was not installed:%s %s\n\n' "$R" "$N" "$*" >&2; exit 1; }
mb() { awk -v b="$1" 'BEGIN { printf "%.0f MB", b / 1048576 }'; }

# Every request retries, gives up on a stalled connection instead of hanging, and can resume.
fetch() { curl -fsSL --retry 4 --retry-delay 2 --retry-all-errors --connect-timeout 20 --speed-limit 2048 --speed-time 30 "$@"; }

printf '\n%sVakyartha for Mac%s %s· installer%s\n' "$B" "$N" "$D" "$N"

[ "$(uname -s)" = Darwin ] || fail "Vakyartha runs on macOS."
[ "$(uname -m)" = arm64 ] || fail "Vakyartha needs a Mac with Apple Silicon."

WORK=$(mktemp -d "${TMPDIR:-/tmp}/vakyartha-install.XXXXXX")
DLPID=""
cleanup() { [ -n "$DLPID" ] && kill "$DLPID" 2>/dev/null; rm -rf "$WORK"; }
trap cleanup EXIT
trap 'cleanup; printf "\n"; exit 130' INT TERM

# --- 1. Release -----------------------------------------------------------------
head "Finding the latest release"
fetch "$SITE/releases.json?t=$(date +%s)" -o "$WORK/releases.json" || fail "the release list could not be downloaded. Check your connection and try again."
get() { /usr/bin/plutil -extract "$1" raw -o - "$WORK/releases.json" 2>/dev/null; }
TAG=$(get releases.0.tag) || fail "no release is published yet."
BUILD=$(get releases.0.build) || BUILD=""
VERSION=$(get releases.0.version) || VERSION=""
STAGE=$(get releases.0.stage) || STAGE=""
ZIP=""; BYTES=""; LISTED=""
i=0
while NAME=$(get "releases.0.assets.$i.name"); do
  case "$NAME" in *.app.zip) ZIP="$NAME"; BYTES=$(get "releases.0.assets.$i.bytes") || BYTES=""; LISTED=$(get "releases.0.assets.$i.sha256") || LISTED="" ;; esac
  i=$((i + 1))
done
[ -n "$ZIP" ] || fail "the release $TAG has no app download."
ENC_TAG=$(printf '%s' "$TAG" | sed 's/+/%2B/g')
ok "Vakyartha $VERSION${STAGE:+ ($STAGE)}, build $BUILD"

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
INSTALLED=$(/usr/bin/defaults read "$DEST/Vakyartha.app/Contents/Info.plist" CFBundleVersion 2>/dev/null || true)
if [ -n "$BUILD" ] && [ "$INSTALLED" = "$BUILD" ] && [ -z "${VAK_REINSTALL:-}" ]; then
  ok "This build is already installed in $DEST."
  note "To install it again: curl -fsSL $SITE/install.sh | VAK_REINSTALL=1 sh"
  /usr/bin/open "$DEST/Vakyartha.app" 2>/dev/null || true
  printf '\n'
  exit 0
fi
[ -n "$INSTALLED" ] && note "Replaces build $INSTALLED in $DEST; your chats, apps and settings stay."

if [ -n "$BYTES" ]; then
  FREE=$(df -k "$WORK" | awk 'NR == 2 { print $4 }')
  [ "$FREE" -gt $((BYTES / 1024 * 3)) ] || fail "not enough free disk space: about $(mb $((BYTES * 3))) is needed."
fi

# --- 2. Download ----------------------------------------------------------------
head "Downloading${BYTES:+ $(mb "$BYTES")}"
fetch "$DL/$ENC_TAG/SHA256SUMS.txt" -o "$WORK/SHA256SUMS.txt" || fail "the checksums could not be downloaded. Try again."
FILE="$WORK/$ZIP"
: > "$FILE"
fetch -C - "$DL/$ENC_TAG/$ZIP" -o "$FILE" &
DLPID=$!
START=$(date +%s)
if [ -n "$TTY" ] && [ -n "$BYTES" ]; then
  while kill -0 "$DLPID" 2>/dev/null; do
    HAVE=$(stat -f %z "$FILE" 2>/dev/null || echo 0)
    SECS=$(( $(date +%s) - START )); [ "$SECS" -gt 0 ] || SECS=1
    awk -v h="$HAVE" -v t="$BYTES" -v s="$SECS" -v cl="$CL" -v g="$G" -v d="$D" -v n="$N" 'BEGIN {
      w = 30; p = t > 0 ? h / t : 0; if (p > 1) p = 1; f = int(p * w)
      bar = ""; for (k = 0; k < w; k++) bar = bar (k < f ? "█" : "░")
      rate = h / s; left = rate > 0 ? (t - h) / rate : 0
      printf "%s      %s%s%s %3d%%  %s%.0f of %.0f MB · %.1f MB/s · %s%s", cl, g, bar, n, p * 100, d, h / 1048576, t / 1048576, rate / 1048576, (rate > 0 ? sprintf("%ds left", left) : "starting"), n
    }'
    sleep 0.25
  done
else
  note "This can take a few minutes."
fi
if ! wait "$DLPID"; then DLPID=""; fail "the download did not finish. Check your connection and run the command again."; fi
DLPID=""
[ -n "$TTY" ] && printf '%s' "$CL"
ok "Downloaded in $(( $(date +%s) - START ))s"

# --- 3. Verify ------------------------------------------------------------------
head "Checking it is the genuine release"
EXPECTED=$(awk -v f="$ZIP" '$2 == f { print $1 }' "$WORK/SHA256SUMS.txt")
ACTUAL=$(/usr/bin/shasum -a 256 "$FILE" | awk '{ print $1 }')
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || fail "the download does not match its published checksum."
[ -z "$LISTED" ] || [ "$LISTED" = "$ACTUAL" ] || fail "the download does not match the release list."
ok "Checksum matches"
/usr/bin/ditto -x -k "$FILE" "$WORK/app" || fail "the app could not be unpacked."
APP="$WORK/app/Vakyartha.app"
[ -d "$APP" ] || fail "the download holds no Vakyartha.app."
/usr/bin/codesign --verify --deep --strict "$APP" 2>/dev/null || fail "the app's signature is broken."
REQ=$(/usr/bin/codesign -d -r- "$APP" 2>&1 | sed -n 's/^designated => //p')
case "$REQ" in *"identifier \"$ID\""*"$LEAF"*) ;; *) fail "the app is not signed by Vakyartha's release identity." ;; esac
ok "Signed by Vakyartha's release identity"

# --- 4. Install -----------------------------------------------------------------
head "Installing to $DEST"
if pgrep -f "$DEST/Vakyartha.app/Contents/MacOS/" >/dev/null 2>&1; then
  note "Quitting the running Vakyartha"
  /usr/bin/osascript -e 'quit app "Vakyartha"' >/dev/null 2>&1 || true
  n=0
  while pgrep -f "$DEST/Vakyartha.app/Contents/MacOS/" >/dev/null 2>&1; do
    n=$((n + 1)); [ "$n" -lt 30 ] || fail "Vakyartha is still running; quit it and run this again."; sleep 1
  done
fi
rm -rf "$DEST/Vakyartha.app.new" "$DEST/Vakyartha.app.old"
/usr/bin/ditto "$APP" "$DEST/Vakyartha.app.new" || { rm -rf "$DEST/Vakyartha.app.new"; fail "the app could not be copied to $DEST."; }
# Swap, keeping the old copy until the new one is in place.
[ -d "$DEST/Vakyartha.app" ] && mv "$DEST/Vakyartha.app" "$DEST/Vakyartha.app.old"
if ! mv "$DEST/Vakyartha.app.new" "$DEST/Vakyartha.app"; then
  [ -d "$DEST/Vakyartha.app.old" ] && mv "$DEST/Vakyartha.app.old" "$DEST/Vakyartha.app"
  fail "the app could not be put in place; your previous copy is unchanged."
fi
rm -rf "$DEST/Vakyartha.app.old"
/usr/bin/xattr -dr com.apple.quarantine "$DEST/Vakyartha.app" 2>/dev/null || true
ok "Installed"

# --- 5. Open --------------------------------------------------------------------
head "Opening Vakyartha"
# Right after a replacement macOS can drop the first open; wait for the app and open it again once.
/usr/bin/open "$DEST/Vakyartha.app" || true
n=0
while ! pgrep -f "$DEST/Vakyartha.app/Contents/MacOS/vakyartha" >/dev/null 2>&1; do
  n=$((n + 1))
  [ "$n" -eq 6 ] && { /usr/bin/open "$DEST/Vakyartha.app" || true; }
  [ "$n" -lt 15 ] || break
  sleep 1
done
if pgrep -f "$DEST/Vakyartha.app/Contents/MacOS/vakyartha" >/dev/null 2>&1; then ok "Running"; else note "Open Vakyartha from $DEST."; fi

printf '\n%s%s✓ Vakyartha %s is ready.%s Its apps work straight away, and it updates itself when you say so.\n' "$G" "$B" "$VERSION${STAGE:+ ($STAGE)}" "$N"
printf '%sA preview for personal, non-commercial use, provided as is, without warranty. Not for production machines.%s\n\n' "$D" "$N"

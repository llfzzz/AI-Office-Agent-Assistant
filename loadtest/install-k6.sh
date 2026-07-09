#!/usr/bin/env bash
# Installs a project-local k6 binary into loadtest/.bin/k6 — no system-wide
# package, no Docker image. k6 isn't in apt on this box (the documented repo
# 404s); this resolves the latest GitHub release and verifies its checksum
# instead of trusting a hardcoded version/URL.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/.bin"
VERSION_FILE="$SCRIPT_DIR/.k6-version"
TARGET_BIN="$BIN_DIR/k6"

ARCH="$(uname -m)"
OS="$(uname -s)"
if [[ "$OS" != "Linux" || "$ARCH" != "x86_64" ]]; then
  echo "install-k6.sh only supports Linux/x86_64 (found $OS/$ARCH)" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

if [[ -x "$TARGET_BIN" && -f "$VERSION_FILE" ]]; then
  installed_version="$(cat "$VERSION_FILE")"
  reported_version="$("$TARGET_BIN" version 2>/dev/null | head -1 || true)"
  if [[ "$reported_version" == *"$installed_version"* ]]; then
    echo "k6 $installed_version already installed at $TARGET_BIN — skipping."
    exit 0
  fi
fi

echo "Resolving latest k6 release..."
RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/grafana/k6/releases/latest)"
TAG="$(echo "$RELEASE_JSON" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
if [[ -z "$TAG" ]]; then
  echo "Could not resolve latest k6 release tag from GitHub API." >&2
  exit 1
fi
VERSION="${TAG#v}"
echo "Latest k6 release: $TAG"

ASSET="k6-${TAG}-linux-amd64.tar.gz"
ASSET_URL="$(echo "$RELEASE_JSON" | grep "browser_download_url" | grep "$ASSET\"" | sed -E 's/.*"browser_download_url": *"([^"]+)".*/\1/')"
CHECKSUMS_URL="$(echo "$RELEASE_JSON" | grep "browser_download_url" | grep "checksums.txt\"" | sed -E 's/.*"browser_download_url": *"([^"]+)".*/\1/')"

if [[ -z "$ASSET_URL" ]]; then
  echo "Could not find asset $ASSET in release $TAG." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Downloading $ASSET ..."
curl -fsSL "$ASSET_URL" -o "$WORK_DIR/$ASSET"

if [[ -n "$CHECKSUMS_URL" ]]; then
  echo "Verifying checksum..."
  curl -fsSL "$CHECKSUMS_URL" -o "$WORK_DIR/checksums.txt"
  EXPECTED_SUM="$(grep "$ASSET\$" "$WORK_DIR/checksums.txt" | awk '{print $1}')"
  ACTUAL_SUM="$(sha256sum "$WORK_DIR/$ASSET" | awk '{print $1}')"
  if [[ -z "$EXPECTED_SUM" || "$EXPECTED_SUM" != "$ACTUAL_SUM" ]]; then
    echo "Checksum mismatch for $ASSET (expected $EXPECTED_SUM, got $ACTUAL_SUM)." >&2
    exit 1
  fi
  echo "Checksum OK."
else
  echo "WARNING: no checksums.txt asset found for $TAG — skipping verification." >&2
fi

echo "Extracting k6 binary..."
tar -xzf "$WORK_DIR/$ASSET" -C "$WORK_DIR"
EXTRACTED_BIN="$(find "$WORK_DIR" -maxdepth 2 -type f -name k6 | head -1)"
if [[ -z "$EXTRACTED_BIN" ]]; then
  echo "Could not find k6 binary inside $ASSET." >&2
  exit 1
fi

install -m 0755 "$EXTRACTED_BIN" "$TARGET_BIN"
echo "$VERSION" > "$VERSION_FILE"

echo "Installed k6 $VERSION to $TARGET_BIN"
"$TARGET_BIN" version

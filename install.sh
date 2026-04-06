#!/usr/bin/env bash
set -euo pipefail

REPO="fabiengb69/lowclaude"
INSTALL_DIR="${LOWCLAUDE_INSTALL_DIR:-$HOME/.local/bin}"
BINARY="lowclaude"

# Detect OS and architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

# Fetch latest release tag from GitHub
LATEST_TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"

if [ -z "$LATEST_TAG" ]; then
  echo "Could not determine latest release. Check https://github.com/${REPO}/releases" >&2
  exit 1
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${BINARY}-${OS}-${ARCH}"

echo "Installing lowclaude ${LATEST_TAG} (${OS}/${ARCH})..."

mkdir -p "$INSTALL_DIR"

curl -fsSL "$DOWNLOAD_URL" -o "${INSTALL_DIR}/${BINARY}"
chmod +x "${INSTALL_DIR}/${BINARY}"

echo "Installed to ${INSTALL_DIR}/${BINARY}"

# Warn if install dir is not in PATH
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo ""
    echo "Add the following to your shell profile to use lowclaude:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    ;;
esac

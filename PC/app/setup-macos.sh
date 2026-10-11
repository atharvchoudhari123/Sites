#!/bin/sh
set -eu
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it from https://brew.sh and rerun this script." >&2
  exit 1
fi
brew install qemu
echo "QEMU installed. Verify with: qemu-system-x86_64 --version"

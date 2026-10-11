#!/bin/sh
set -eu
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y qemu-system-x86 qemu-utils
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y qemu-system-x86 qemu-img
else
  echo "Install qemu-system-x86_64 and qemu-img using your distribution's package manager." >&2
  exit 1
fi

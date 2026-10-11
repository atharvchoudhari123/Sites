# Nova PC desktop app

Nova PC is a lightweight Electron front end that launches a local QEMU virtual machine for Windows or Linux guest installation media.

## Install prerequisites

- **macOS (Apple Silicon or Intel):** install Homebrew, then run `brew install qemu`.
- **Windows:** install a reputable QEMU build and add its installation `bin` directory to PATH.
- **Debian/Ubuntu:** run `sudo apt install qemu-system-x86 qemu-utils`.

QEMU is a separate host dependency and is not bundled into these initial installer packages. The VM uses a QCOW2 virtual disk in the app's user-data directory; it does not install the guest onto your physical disk.

## Run from source

```sh
cd PC/app
npm install
npm start
```

## Build installers

```sh
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Build each platform on its matching runner/host. The GitHub Actions workflow at `.github/workflows/nova-pc-build.yml` builds a macOS DMG, Windows EXE installer, and Debian DEB package when manually started or when a `nova-pc-v*` tag is pushed.

## Important limitations

- Supports x86-64 guest setup via QEMU. Guest compatibility depends on the ISO and host architecture.
- The configured virtual CPU count and memory size are passed to QEMU at launch; this is not a guarantee that host resources are reserved.
- Virtual disk maximum size is a QCOW2 virtual capacity and expands as the guest writes data.
- GPU passthrough and a browser-embedded VM display are not implemented in this first build. QEMU opens its own guest display window.
- Browser-only mode is a dashboard preview; it cannot launch a native QEMU process.

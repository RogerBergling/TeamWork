# Packaging

TeamWork produces three Linux artifacts from one codebase:

| Artifact | File | Use case |
|---|---|---|
| AppImage | `TeamWork-<version>-x86_64.AppImage` | Single executable file; no installation |
| Debian package | `TeamWork-<version>-amd64.deb` | Ubuntu/Debian managed deployment |
| RPM package | `TeamWork-<version>-x86_64.rpm` | Fedora/RHEL/SUSE managed deployment |
| Browser extension | `TeamWork-Browser-Extension-<version>.zip` | Chrome/Edge Link Opener store or policy deployment |

## One executable or an installer?

Both.

- An **AppImage** is a single file. The user downloads it, marks it executable, and runs it. Internally it contains the Electron/Chromium runtime and the application, so it behaves like one executable without a system-wide installation.
- A **.deb** or **.rpm** is the right choice when an organisation manages software installation, desktop entries, and updates through package management.
- A truly static single binary is not realistic for a Chromium-based client. Tauri could produce a smaller single binary, but it relies on the system WebKitGTK and puts Jitsi/Element WebRTC and feature parity at risk. Electron was chosen deliberately.

All three formats are built from the same `out/` bundle and the same version number.

## Build requirements

- Node.js 22.12+ and npm.
- Linux x86_64 build host.
- `rpmbuild` for the RPM target:

```bash
sudo apt install rpm        # Debian/Ubuntu
sudo dnf install rpm-build  # Fedora
```

AppImage and deb do not require `rpmbuild`.

## Commands

```bash
npm ci
npm run typecheck
npm test
npm run dist
```

`npm run dist` writes all three packages to `release/`. Individual targets:

```bash
npm run dist:appimage
npm run dist:deb
npm run dist:rpm
npm run extension:build
npm run extension:zip
```

The extension zip is store-ready (manifest at the archive root). See [Browser extension](browser-extension.md).

The icon is generated from `src/renderer/assets/logo.svg`:

```bash
npm run icon   # writes build/icon.png and build/icon.svg
```

The generated PNG is committed so packaging does not depend on Sharp at build time.

## Output layout

```text
release/
├── TeamWork-0.1.0-x86_64.AppImage
├── TeamWork-0.1.0-amd64.deb
├── TeamWork-0.1.0-x86_64.rpm
├── TeamWork-Browser-Extension-0.1.0.zip
├── linux-unpacked/          # unpacked application used by the targets
└── *.blockmap               # update metadata
```

## Install examples

```bash
# AppImage
chmod +x TeamWork-0.1.0-x86_64.AppImage
./TeamWork-0.1.0-x86_64.AppImage

# Debian/Ubuntu
sudo apt install ./TeamWork-0.1.0-amd64.deb

# Fedora/RHEL
sudo dnf install ./TeamWork-0.1.0-x86_64.rpm
```

If FUSE 2 is unavailable on a distribution, an AppImage can still be run with:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./TeamWork-0.1.0-x86_64.AppImage
```

## Runtime dependencies

The `.deb` declares GTK 3, NSS, X11, ALSA, GBM, CUPS, AT-SPI, and related libraries. The `.rpm` declares their RPM equivalents. The AppImage bundles Electron but still relies on the host's graphics, audio, and desktop portal stack.

For Wayland screen sharing, the host needs:

- `xdg-desktop-portal`
- a desktop-specific portal backend (GNOME, KDE, wlroots, etc.)
- PipeWire
- the standard XDG desktop portal permissions

## Desktop integration

`electron-builder.yml` defines:

- `appId: org.teamwork.desktop`
- `desktopName: teamwork.desktop` and `syncDesktopName: true`
- `StartupWMClass: teamwork`
- `MimeType=x-scheme-handler/teamwork;` for deep-link handling
- menu category `Network`
- icon installed under `hicolor/512x512/apps/teamwork.png`
- a `.desktop` entry with chat/conferencing categories and keywords

## Versioning and release checklist

1. Update `version` in `package.json`.
2. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke`.
3. Run `npm run dist`.
4. Launch each artifact once on a clean desktop profile.
5. Verify sign-in against the real Element and Jitsi deployments.
6. Test Wayland screen sharing and the X11 fallback.
7. Sign the artifacts (see below).
8. Publish the AppImage, `.deb`, `.rpm`, and checksums.

## Signing

The current build is unsigned. For production distribution:

- Sign packages with your distribution signing key (`dpkg-sig`/`debsigs`, `rpm --addsign`).
- Publish a SHA-256 checksum file.
- If AppImage updates are added later, sign the update metadata and use HTTPS.
- Consider a repository (APT/YUM) rather than distributing bare packages.

## CI

`.github/workflows/build.yml` runs type checks, unit tests, the Electron smoke test under Xvfb, and all three package targets on Ubuntu. It installs `rpm` for the RPM build and uploads the artifacts.

## Verification performed in this repository

The following was validated locally:

- `npm run typecheck`
- `npm test` — 59 tests
- `npm run build`
- Electron smoke test under Xvfb with both embedded views loading from a local HTTP server
- Deep-link launch test: `teamwork://join?url=...` switched to the Jitsi view and preserved the full meeting URL including the JWT query
- Join-dialog test: submitting a Jitsi URL through the renderer opened it in the Jitsi view
- AppImage self-registration: `~/.local/share/applications/teamwork.desktop` was created and `xdg-mime` reported `teamwork.desktop` for `x-scheme-handler/teamwork`
- Chrome/Edge extension built and packaged as `release/TeamWork-Browser-Extension-0.1.0.zip`
- The built **AppImage**, extracted **.deb**, and extracted **.rpm** each launched successfully with the smoke test and reported both views as `ready`

# Contributing

## Prerequisites

- Linux x86_64.
- Node.js 22.12+ and npm.
- `rpmbuild` for RPM packaging.
- `zip` for the browser-extension archive.
- A display or Xvfb for Electron smoke tests.

## Setup

```bash
npm ci
npm run dev
```

## Validation

Run the full local verification before opening a pull request:

```bash
npm run verify
```

This runs:

- TypeScript checks for the Electron main/preload/renderer code and the browser extension.
- Unit tests.
- Production bundles.
- Browser extension build, validation, and zip packaging.

Additional checks:

```bash
npm run smoke                          # real Electron smoke test
npm run dist                           # AppImage + deb + rpm + extension zip
```

`npm run smoke` requires a display. On a headless machine:

```bash
xvfb-run --auto-servernum --server-args='-screen 0 1440x900x24' npm run smoke
```

## Project layout

| Directory | Purpose |
|---|---|
| `src/main/` | Electron main process, configuration, sessions, protocol registration |
| `src/preload/` | Narrow contextBridge API |
| `src/renderer/` | React shell, settings, logs, screen-share and join dialogs |
| `src/shared/` | Settings schema, URL policy, deep links, shared types |
| `browser-extension/` | Chrome/Edge Manifest V3 extension source, build, and dist |
| `tests/` | Vitest unit tests |
| `docs/` | Architecture, configuration, authentication, deep links, extension, packaging |
| `scripts/` | Icon generation, extension zip, extension validation |

## Coding guidelines

- Keep the shell renderer free of remote content and Node access.
- Keep embedded Element/Jitsi views sandboxed and without preloads.
- Validate every URL that crosses a trust boundary.
- Redact query strings and tokens from logs.
- Keep configuration changes schema-backed and backward-compatible.
- Add or update tests for URL policy, deep links, and extension matching changes.
- Update the relevant documentation when behavior changes.

## Commit and pull request checklist

- `npm run verify` passes.
- The Electron smoke test passes.
- New settings are added to `SETTINGS_FIELDS` and documented.
- New deep-link behavior includes tests and origin validation.
- Extension changes update `browser-extension/dist` and pass `npm run extension:validate`.
- Packaging changes update `docs/packaging.md`.
- No secrets, tokens, generated logs, or local profiles are committed.

## Release process

1. Update `package.json` version and browser-extension manifest version.
2. Update `CHANGELOG.md`.
3. Run `npm run verify`, `npm run smoke`, and `npm run dist`.
4. Test AppImage, deb, and RPM on a clean profile.
5. Tag the release as `v<version>`; the release workflow attaches artifacts and checksums.

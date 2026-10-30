# Architecture

## Goals and constraints

TeamWork has two hard requirements that dominate the design:

1. **Full Element and Jitsi feature parity** with their official web clients.
2. **Web-based authentication**, including SAML and OpenID flows configured on those servers.

Reimplementing either client natively would make requirement 1 unattainable and would break requirement 2. The architecture therefore treats the official clients as first-class embedded applications and puts the product work into the native shell around them.

## Process and view model

```text
┌──────────────────────────── Electron main process ────────────────────────────┐
│  ConfigStore · AppLogger · SessionManager · AppController · IPC               │
│                                                                              │
│  BrowserWindow (frameless shell)                                             │
│  ├── shell WebContents (React UI, preload contextBridge, sandboxed)          │
│  ├── WebContentsView "element"  partition persist:element                   │
│  └── WebContentsView "jitsi"    partition persist:jitsi                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Main process** owns configuration, logging, sessions, navigation policy, permissions, screen sharing, menus, tray, and window state.
- **Preload** exposes a small typed API. It does not expose `ipcRenderer`, filesystem access, or arbitrary channels.
- **Shell renderer** is a React application: title bar, navigation rail, contextual header, settings, logs, status bar, screen-share picker. It never loads remote content.
- **Element/Jitsi views** are `WebContentsView` instances, not `<webview>` tags. Each has its own persistent Chromium partition, sandbox, and no preload. They are positioned over the content area using bounds reported by the shell with `ResizeObserver`.

`WebContentsView` was chosen over `<webview>` because it is the current Electron API, keeps the embedded content out of the shell DOM, and allows separate sessions and permission policies without enabling the `webviewTag` experiment.

## Layout and native view bounds

React measures the content rectangle in CSS pixels and sends it to the main process. CSS pixels equal Electron DIPs at zoom 1, so the native views align with the DOM. The shell keeps the header and status bar outside the measured rectangle, so those remain interactive while an embedded view is visible.

When a view is loading, unconfigured, or failed, it is hidden and the shell renders a branded state. When it is ready, the native view is shown above the shell content. Settings and Logs deactivate both native views.

## Configuration

`ConfigStore` is deliberately independent of Electron so it can be unit tested:

- Read JSON from `~/.config/teamwork/config.json`.
- Deep-merge over defaults to survive version upgrades.
- Validate with a Zod schema (`src/shared/settings.ts`).
- On invalid input, copy the file to `config.json.invalid-<timestamp>` and restore defaults.
- Write atomically with mode `0600`.
- Import/export uses the same validation path.

Settings metadata (`SETTINGS_FIELDS`) drives the GUI, so every persisted field is visible and editable without maintaining two lists. Some changes (Ozone backend, hardware acceleration) require a restart; the UI marks them.

## Authentication and navigation

Both embedded clients authenticate themselves. TeamWork never sees credentials.

- Persistent partitions keep cookies and storage across restarts.
- Login popups are allowed as in-app `BrowserWindow`s sharing the opener's partition. This preserves `window.opener` postMessage flows used by OpenID.
- The default user agent is a plain Chrome UA so providers do not see Electron.
- If no trusted auth origins are configured, all http(s) navigation stays in-app. This is the compatibility-first default because SAML/OpenID redirect chains cross many hosts.
- Once trusted origins are configured, navigations to the app origin or a trusted origin stay in-app, while unrelated links open in the system browser.
- A global certificate-error handler rejects invalid certificates unless the user explicitly enables exceptions; every exception is logged.

SAML and OpenID are ultimately deployment concerns. A shared IdP (Keycloak, Authentik, Entra ID, etc.) can provide a common identity for Matrix and Jitsi, but the client does not unify accounts by itself.

## Permissions

`SessionManager` installs permission handlers per partition:

- Media, display capture, notifications, fullscreen, clipboard, speaker selection, and related permissions are auto-granted only to the configured app origin.
- Requests from another origin (for example, Element Call hosted separately) trigger a native confirmation dialog and are cached for the session.
- Other permissions are denied.
- Notification permission additionally respects the global notification setting.

## Screen sharing

`session.setDisplayMediaRequestHandler` is implemented for both partitions:

1. The shell window is raised.
2. Both native views are hidden so the shell modal is visible.
3. `desktopCapturer.getSources()` enumerates screens and windows with thumbnails.
4. The React modal asks the user to select a source.
5. The selected `DesktopCapturerSource` is returned to the requesting web client.
6. The active native view is restored.

On Wayland, Chromium/Electron routes capture through `xdg-desktop-portal` and PipeWire. If portal capture is unavailable, the user can restart with the X11 backend. The application does not request loopback system audio because Electron only supports that on Windows.

## Logging

`AppLogger` wraps `electron-log`:

- Console and file transports with a consistent timestamp format.
- Effective level is `debug` when the debug flag is set, otherwise the selected level.
- File rotation at the configured size.
- Embedded `console-message` events are captured only in debug mode.
- The renderer can tail, filter, open, and clear the log file through narrow IPC methods.
- Main-process `uncaughtException`, `unhandledRejection`, renderer crashes, and Chromium child-process exits are logged.

## Security boundaries

| Surface | Measures |
|---|---|
| Shell renderer | Sandboxed, context-isolated, no Node, CSP, local assets only |
| Preload | Explicit method allowlist; sender validated in main |
| Embedded views | Separate partitions, sandboxed, no preload, no Node, navigation policy |
| Popups | Share the opener partition but keep the same sandbox and navigation guards |
| IPC | Handlers check the sender is the shell window; inputs are validated |
| Config | Schema validation, atomic writes, 0600 permissions |
| Custom CSS | Local user input only, injected as CSS, never evaluated as script |
| Certificates | Rejected by default; explicit opt-in with warning logs |

## Packaging

One build produces:

- **AppImage** — a single executable file for ad-hoc use.
- **.deb** — Debian/Ubuntu installer.
- **.rpm** — Fedora/RHEL/SUSE installer.

`electron-builder` bundles the Electron runtime and the production Node dependencies (`electron-log`, `zod`) into an ASAR archive. Element and Jitsi are not bundled; they are loaded from the configured URLs.

## Future work

- Auto-update channel with signed AppImage/deb/rpm metadata.
- Deep links (`teamwork://`, `matrix:`, `jitsi-meet:`) into the correct view.
- Richer unified notifications and unread badges.
- Optional local bundles of Element/Jitsi served through a secure custom protocol.
- Automated end-to-end tests with Playwright driving the shell.
- ARM64 packaging.

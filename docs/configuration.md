# Configuration reference

TeamWork stores all user settings in one JSON file:

```text
~/.config/teamwork/config.json
```

The file is created on first start, written atomically (temporary file + rename), and given mode `0600`. The Settings UI and the file are the same source of truth: editing through the GUI rewrites the file, and exporting/importing uses the same schema.

The file is validated with a Zod schema. Unknown fields are removed, missing fields are filled from defaults, and invalid files are copied to `config.json.invalid-<timestamp>` before defaults are restored.

## Example

```json
{
  "version": 1,
  "servers": {
    "elementUrl": "https://element.example.com",
    "jitsiUrl": "https://meet.example.com",
    "elementUserAgent": "",
    "jitsiUserAgent": "",
    "startView": "element"
  },
  "appearance": {
    "appName": "TeamWork",
    "organizationName": "Example GmbH",
    "logoPath": "/home/alice/Pictures/company-logo.svg",
    "theme": "system",
    "accentColor": "#5b5fc7",
    "density": "comfortable",
    "customCss": "",
    "showTrayIcon": true
  },
  "authentication": {
    "trustedAuthOrigins": ["https://login.example.com"],
    "allowInsecureCertificates": false,
    "clearSessionsOnExit": false,
    "notifications": true
  },
  "logging": {
    "debug": false,
    "level": "info",
    "toFile": true,
    "maxFileSizeMb": 10
  },
  "window": {
    "closeToTray": false,
    "startMinimized": false,
    "rememberBounds": true
  },
  "network": {
    "proxyMode": "system",
    "proxyUrl": ""
  },
  "linux": {
    "ozonePlatform": "auto"
  },
  "advanced": {
    "hardwareAcceleration": true,
    "zoomFactor": 1,
    "enableDevTools": false,
    "spellcheck": true
  }
}
```

## Environment overrides

| Variable | Effect |
|---|---|
| `TEAMWORK_CONFIG_DIR` | Replaces `~/.config/teamwork` for the config file and Chromium session profile. |
| `TEAMWORK_STATE_DIR` | Replaces `~/.local/state/teamwork`; logs go in its `logs/` subdirectory. |
| `TEAMWORK_SMOKE_TEST` | Internal CI/smoke-test switch. Starts the app, captures the shell, and exits. |
| `TEAMWORK_SMOKE_SCREENSHOT` | Output PNG path used by the smoke test. |
| `TEAMWORK_SMOKE_EXPECT_READY` | `element` or `jitsi`; fails the smoke test unless that view reaches `ready`. |
| `TEAMWORK_SMOKE_SAVE_TEST` | `1` saves a setting through the real IPC path and verifies it was persisted. |
| `TEAMWORK_SMOKE_JOIN_DIALOG` | `1` opens the Join meeting dialog during the smoke test. |
| `TEAMWORK_SMOKE_UI_JOIN_URL` | Jitsi URL submitted by the smoke test through the Join dialog. |

## Fields

### Connection

| Key | Type | Default | Notes |
|---|---|---|---|
| `servers.elementUrl` | URL or empty | `""` | Base URL of Element Web. Must be `http://` or `https://`. |
| `servers.jitsiUrl` | URL or empty | `""` | Base URL of Jitsi Meet. Must be `http://` or `https://`. |
| `servers.startView` | `element` / `jitsi` | `element` | Initial view when both URLs are configured. |
| `servers.elementUserAgent` | string | `""` | Empty uses a standard Chrome user agent; override if an IdP rejects embedded browsers. |
| `servers.jitsiUserAgent` | string | `""` | Same, for Jitsi. |

### Appearance

| Key | Type | Default | Notes |
|---|---|---|---|
| `appearance.appName` | string, 1–60 chars | `TeamWork` | Title bar, window title, tray tooltip, About dialog. |
| `appearance.organizationName` | string, ≤120 | `""` | Secondary label in the title bar. |
| `appearance.logoPath` | path | `""` | PNG, JPEG, WebP, GIF, or SVG up to 8 MB. Empty uses the bundled logo. |
| `appearance.theme` | `system` / `light` / `dark` | `system` | Shell theme. Embedded apps follow the system colour scheme. |
| `appearance.accentColor` | `#RRGGBB` | `#5b5fc7` | Accent for navigation, buttons, focus rings, and highlights. |
| `appearance.density` | `comfortable` / `compact` | `comfortable` | Spacing in the shell. |
| `appearance.customCss` | string, ≤200 000 chars | `""` | Applied to the shell and injected into Element/Jitsi after each page load. |
| `appearance.showTrayIcon` | boolean | `true` | Enables the tray icon; required for close-to-tray. |

### Authentication

| Key | Type | Default | Notes |
|---|---|---|---|
| `authentication.trustedAuthOrigins` | array of origins | `[]` | One per line in the GUI. Empty keeps every http(s) navigation in-app for maximum SAML/OpenID compatibility. With entries, non-matching links open in the system browser. |
| `authentication.allowInsecureCertificates` | boolean | `false` | Accepts invalid TLS certificates. Logs a warning for each exception. Prefer installing the CA system-wide. |
| `authentication.clearSessionsOnExit` | boolean | `false` | Clears cookies, storage, cache, and auth cache for both embedded apps on quit. |
| `authentication.notifications` | boolean | `true` | Grants desktop notification permission to the configured app origins. |

Trusted origins are compared by `scheme://host[:port]`. A full URL entered in the GUI is reduced to its origin when matching.

### Logging

| Key | Type | Default | Notes |
|---|---|---|---|
| `logging.debug` | boolean | `false` | Forces `debug` level and captures embedded app console messages. |
| `logging.level` | `error` / `warn` / `info` / `debug` | `info` | Minimum severity when debug mode is off. |
| `logging.toFile` | boolean | `true` | Writes to `teamwork.log`; console logging remains active. |
| `logging.maxFileSizeMb` | integer 1–100 | `10` | electron-log rotates the file at this size. |

### Window

| Key | Type | Default | Notes |
|---|---|---|---|
| `window.closeToTray` | boolean | `false` | Close button hides the window instead of quitting. Requires the tray icon. |
| `window.startMinimized` | boolean | `false` | Starts hidden in the tray when the tray icon is enabled. |
| `window.rememberBounds` | boolean | `true` | Restores the previous window geometry. |

Window geometry is stored separately in `window-state.json` because it is runtime state, not a user preference.

### Network

| Key | Type | Default | Notes |
|---|---|---|---|
| `network.proxyMode` | `system` / `direct` / `custom` | `system` | Applied to both embedded sessions. |
| `network.proxyUrl` | URL | `""` | Required for `custom`. Supports `http://`, `https://`, `socks4://`, `socks5://`. |

### Linux integration

| Key | Type | Default | Notes |
|---|---|---|---|
| `linux.ozonePlatform` | `auto` / `wayland` / `x11` | `auto` | Passed to `--ozone-platform-hint`. Restart required. `auto` prefers Wayland when available. |

### Advanced

| Key | Type | Default | Notes |
|---|---|---|---|
| `advanced.hardwareAcceleration` | boolean | `true` | Disabling calls `app.disableHardwareAcceleration()` at startup. Restart required. |
| `advanced.zoomFactor` | number 0.5–2.0 | `1` | Zoom for embedded Element/Jitsi views. |
| `advanced.enableDevTools` | boolean | `false` | Enables F12 and the developer-tools menu item. |
| `advanced.spellcheck` | boolean | `true` | Chromium spell checker in embedded editors. |

## Backup, import, and export

Open **Settings → Application**:

- **Open file** opens the JSON in the default text editor.
- **Export** writes the current configuration to a chosen file.
- **Import** validates a JSON file and applies it atomically. Invalid files are rejected without changing the current configuration.
- **Reset settings** restores all defaults; it does not clear embedded sessions.

## Session data

Chromium profile data for the two embedded clients lives under the configuration directory in `Partitions/element` and `Partitions/jitsi` (implementation detail of Electron). Use **Authentication → Embedded sessions → Clear …** or `authentication.clearSessionsOnExit` to remove it.

# Chrome/Edge Link Opener extension

The browser extension converts ordinary HTTPS Jitsi and Matrix/Element links into TeamWork deep links. It is a Manifest V3 extension for Chromium-based browsers (Chrome and Edge).

Without the extension, a normal Jitsi link opens the browser. The extension is the clean way to handle existing invitations that contain no `teamwork://` link.

## What it does

```text
https://meet.example.com/team-standup?jwt=...
        │
        ▼
teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Fteam-standup%3Fjwt%3D...
        │
        ▼
TeamWork desktop application
```

Matrix/Element links become:

```text
teamwork://matrix?url=...
```

The native application still validates the target origin against the Jitsi/Element URLs configured in TeamWork. The extension cannot bypass that validation.

## Install

### Load unpacked (development)

1. Run:

   ```bash
   npm run extension:build
   ```

2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select:

   ```text
   browser-extension/dist
   ```

### Packaged zip

```bash
npm run extension:zip
```

This creates:

```text
release/TeamWork-Browser-Extension-0.1.0.zip
```

Upload that file to the Chrome Web Store or Microsoft Edge Add-ons, or distribute it through enterprise policy.

## Configuration

Open the extension options page.

### Trusted Jitsi servers

One hostname per line:

```text
jitsi.jordbruksverket.se
meet.example.com
*.jitsi.example.com
```

Links on these hosts are treated as Jitsi meetings. The base Jitsi home page and static assets are ignored.

### Public Jitsi detection

Enabled by default. The extension recognizes:

- `meet.jit.si`
- `8x8.vc`
- `*.8x8.vc`

This is deliberately limited to known public Jitsi services. General “looks like Jitsi” autodetection is not enabled by default because self-hosted Jitsi installations use arbitrary domains, and false positives are worse than a one-time domain configuration. Add self-hosted FQDNs under trusted Jitsi servers.

### Matrix / Element

Configure Element hostnames:

```text
element.example.com
```

The extension also recognizes `matrix.to` room and user permalinks when that option is enabled. The Element URL must be configured in TeamWork as well.

### Opening behavior

| Mode | Behavior |
|---|---|
| **Open TeamWork automatically** | Matching top-level navigations are redirected to `teamwork://`. The browser may ask once to allow the protocol. |
| **Ask first** | The extension shows an intermediate page with “Open in TeamWork” and “Continue in browser”. |
| **Only when I click** | No automatic navigation. Matching links are converted when clicked on supported mail sites, through the context menu, or from the toolbar popup. |

### Intercept links on all websites

By default, the content script runs only on common mail/chat sites:

- Outlook Web
- Gmail
- Microsoft Teams
- Slack

Enable this option and grant the optional host permission to intercept links on other websites. This is what makes ordinary links work on arbitrary intranet pages and other mail clients.

## Outlook and native apps

- Links clicked in **Outlook Web** are intercepted by the content script.
- Outlook SafeLinks wrappers are unwrapped before matching.
- Links opened by an external application into the browser are handled by the `webNavigation` path.
- A native Outlook on Windows can only open TeamWork if TeamWork is installed on that Windows machine; this Linux application cannot be launched from another device.
- If an invitation is opened on a phone or another computer, the link cannot launch TeamWork on your Linux desktop.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save extension settings and read managed policy. |
| `contextMenus` | Add “Open link in TeamWork” and “Open this page in TeamWork”. |
| `tabs` | Read the active tab URL and redirect it. |
| `webNavigation` | Detect top-level Jitsi/Element navigations for auto/ask modes. |
| `scripting` | Register the optional all-sites content script. |
| `notifications` | Tell the user when a chosen link is not recognized. |
| Optional `https://*/*`, `http://*/*` | Only requested when “Intercept links on all websites” is enabled. |

The extension does not collect analytics and does not send page content anywhere. It only reads the current URL and link URLs to decide whether they match a configured service. JWT and query parameters are passed to TeamWork and are redacted from the desktop application’s logs.

## Enterprise deployment

### Force-install the extension

Use Chrome/Edge extension policies such as:

- `ExtensionInstallForcelist`
- `ExtensionSettings`

The extension ID is assigned after loading the unpacked extension or publishing it.

### Managed settings

The extension declares a managed-storage schema. Enterprise policy can supply:

```json
{
  "jitsiDomains": ["jitsi.jordbruksverket.se"],
  "elementDomains": ["element.example.com"],
  "mode": "auto",
  "detectPublicJitsi": false,
  "detectMatrixTo": true,
  "interceptAllSites": true
}
```

Chrome uses the managed-storage policy for the extension (for example `3rdparty.extensions.<extension-id>.settings`). Settings supplied by policy are shown read-only in the options page.

For all-site interception, the browser must grant the optional host permission. Depending on the browser version, an administrator can pre-grant this through extension policy, or the user must enable it once.

### Allow the TeamWork protocol

To avoid the external-protocol prompt on managed machines, configure the Chromium policy that allows launching `teamwork` from trusted origins, for example `AutoLaunchProtocolsFromOrigins`. The exact policy name and JSON shape vary slightly between Chrome and Edge versions; test it in your managed browser build.

Without that policy, Chrome/Edge may show an “Open TeamWork?” confirmation once. This is a browser security feature and cannot be bypassed by the extension.

## Build and package

```bash
npm run extension:build
npm run extension:zip
```

Outputs:

```text
browser-extension/dist/                     # Load unpacked
release/TeamWork-Browser-Extension-0.1.0.zip
```

The build uses esbuild for the service worker, content script, options page, popup, and interstitial. Icons are generated from the TeamWork application icon.

## Limitations

- Chromium only. Firefox and Safari need separate implementations.
- The extension cannot read native Outlook calendars or appointments; that is ICS/Graph/add-in work.
- Automatic redirect may still require a browser-level protocol confirmation unless enterprise policy pre-approves it.
- `matrix.to` links are converted to the Element server configured in TeamWork. The extension does not discover homeservers or room aliases by itself.
- Public Jitsi detection is limited to known hosts; generic heuristics are intentionally not enabled.
- The extension does not bypass TeamWork’s origin validation. If the extension domain allowlist and TeamWork’s configured URL disagree, the app rejects the link.

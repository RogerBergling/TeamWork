# TeamWork Link Opener

Manifest V3 browser extension for Chrome and Edge. It converts ordinary Jitsi and Matrix/Element HTTPS links into TeamWork deep links.

## Build

From the repository root:

```bash
npm run extension:build
npm run extension:validate
```

Load `browser-extension/dist` as an unpacked extension:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select `browser-extension/dist`.

Create a store-ready zip:

```bash
npm run extension:zip
# release/TeamWork-Browser-Extension-0.1.0.zip
```

## Configure

Open the extension options and add trusted Jitsi and Element hostnames. Public Jitsi detection and matrix.to detection are optional. The “Intercept links on all websites” option requests the Chromium optional host permission and is required for sites outside the default mail/chat list.

TeamWork must be installed and registered for `teamwork://` links. The extension only creates the deep link; the desktop application validates the target origin.

See [the full documentation](../docs/browser-extension.md) for modes, enterprise policy, permissions, and limitations.

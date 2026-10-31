# Changelog

All notable changes to this project are documented here.

## [0.1.0] - 2026-10-31

### Added

- Electron shell with a Teams-like layout, configurable branding, themes, density, and organisation name.
- Embedded Element Web and Jitsi Meet clients with isolated persistent sessions.
- SAML/OpenID-friendly navigation, authentication popups, trusted auth origins, certificate handling, and per-app user-agent overrides.
- Schema-driven GUI settings with atomic JSON configuration, import/export, backup of invalid files, and environment-specific profiles.
- Structured logging with error/warn/info/debug levels, GUI debug toggle, log viewer, filtering, rotation, and open/clear actions.
- Screen-share picker with screen/window thumbnails, cancellation, and timeout handling.
- Wayland support with Ozone backend selection, PipeWire capture, and X11 fallback.
- Tray integration, close-to-tray, start-minimized, and remembered window geometry.
- `teamwork://join` Jitsi deep links, Join meeting dialog (`Ctrl+J`), second-instance forwarding, and renderer-ready handshake.
- `teamwork://matrix` Matrix/Element deep links with `matrix.to` conversion and Element hash-navigation handling.
- AppImage protocol self-registration and deb/rpm desktop-entry registration.
- Chrome/Edge Manifest V3 Link Opener extension with trusted FQDN configuration, public Jitsi and matrix.to detection, automatic/ask/click modes, SafeLinks unwrapping, all-site opt-in, managed enterprise settings, popup, options page, and interstitial.
- AppImage, deb, and rpm packaging with desktop integration and runtime dependencies.
- Automated tests for settings, URL policy, Jitsi/Matrix deep links, extension matching, configuration storage, and window state.
- GitHub Actions build workflow, artifact checksums, release artifacts, and browser-extension validation.
- Architecture, configuration, authentication, deep-link, browser-extension, packaging, and security documentation.

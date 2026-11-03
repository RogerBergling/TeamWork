# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- Read-only system policy at `/etc/teamwork/policy.json` (override with `TEAMWORK_POLICY_FILE`) with defaults < user config < policy precedence, main-process enforcement, and read-only managed fields in the GUI.
- Optional system-browser SSO handoff for identity providers that reject embedded browsers, with a validated `teamwork://auth` callback limited to the configured Element/Jitsi origins.
- `EXTENSION_UPDATE_URL` build-time injection for a self-hosted browser-extension `update_url`, plus an `updates.xml` example and validation.
- Policy, authentication, and browser-extension update documentation.

### Security

- Packaged builds refuse `--remote-debugging-port`, `--remote-debugging-pipe`, and Node inspector switches.
- Non-HTTP(S) navigation and redirect targets are blocked instead of being left to Chromium.
- Log files are created with mode `0600`; existing log and state directories are restricted to `0700`.
- Policy files that are group- or world-writable, contain unknown fields, or fail schema validation are rejected.

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
- Tag-based GitHub Release workflow, extension manifest validation, Dependabot, and editor/Node version pins.
- App-wide Chromium sandbox and Electron fuses for runtime hardening.
- Renderer error forwarding to the main log and packaged LICENSE/third-party notices.
- Lazy loading of inactive embedded views, startup timing diagnostics, renderer code splitting, and removal of Zod from the renderer bundle.
- Performance guidance for managed fleets and Element/Jitsi server tuning.
- Build metadata (version, build number, build date/time/hour) shown in the status bar, About dialog, and Settings → Application; CI run number and reproducible timestamp overrides.
- Enterprise readiness assessment and prioritized roadmap.
- Architecture, configuration, authentication, deep-link, browser-extension, packaging, and security documentation.

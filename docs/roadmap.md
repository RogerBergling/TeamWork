# Roadmap and known gaps

This document tracks the work that is desirable but not yet complete. It is grouped by user impact, not by implementation convenience. For the enterprise control assessment, see [Enterprise readiness](enterprise-readiness.md).

## P0 — production readiness

- **Signed releases.** Packages are currently unsigned. Add signing keys for deb/rpm, publish checksums, and verify downloads in the release workflow.
- **Packaged-artifact smoke tests in CI.** CI builds AppImage/deb/rpm but does not launch them. Add a job that extracts each target and runs the existing smoke test under Xvfb.
- **Real SSO validation.** Test against the actual Element homeserver, Jitsi deployment, and SAML/OpenID IdP. Some providers reject embedded browsers.
- **External-browser authentication fallback.** Add a deep-link callback flow for IdPs that require a separate system browser.
- **Auto-update.** Add signed update metadata and a strategy per artifact: AppImage update information, APT/YUM repository, or a self-hosted update feed.
- **Move large binaries out of Git.** The repository currently contains AppImage/deb/rpm blobs. Publish them through GitHub Releases or Git LFS and remove them from future commits.

## P1 — calendar and meeting workflow

- **ICS calendar subscription.** Read published Outlook/Google calendars and show upcoming Jitsi meetings with a Join button. No Microsoft Graph permissions required.
- **Microsoft Graph integration.** Native Outlook 365 calendar access with delegated `Calendars.Read`, OAuth, and tenant consent. This is the best long-term Outlook experience.
- **Outlook add-in.** Add a “Join in TeamWork” action to meeting and appointment windows. Requires Microsoft 365 add-in deployment.
- **Calendar-aware reminders.** Desktop notifications for upcoming meetings, with “Join now” actions.
- **Meeting metadata.** Display organizer, title, and start time in the shell instead of only the meeting host.

## P1 — shell and desktop UX

- **Unified notification list and unread badges.** Bridge Element and Jitsi notifications into the shell status bar and tray.
- **Per-view zoom controls and reset.** The numeric setting exists, but keyboard/menu controls for the active embedded view are missing.
- **Downloads and printing.** Verify and explicitly handle Chromium download paths and print dialogs from embedded clients.
- **Focus management.** Add focus traps, initial focus, and return-focus behavior for all shell modals.
- **Keyboard navigation audit.** Ensure every control is reachable and the screen-reader labels are complete.
- **Custom logo validation.** Report unsupported file types and oversized files before saving in the GUI.
- **Configuration migrations.** The config schema is version 1 only. Add explicit migration functions when fields change.
- **Config preview / advanced JSON editor.** Useful for enterprise provisioning and troubleshooting.
- **Window state in the config?** Currently window geometry is separate runtime state. Document or expose a reset action.

## P1 — browser extension

- **Real Chrome/Edge smoke test.** Load `browser-extension/dist` in a headless Chromium profile and verify content-script interception, popup, options, and protocol launch.
- **Native messaging config sync.** Read the configured Jitsi/Element URLs directly from TeamWork instead of duplicating FQDN settings.
- **User-facing debug log.** Add an extension diagnostics page for failed matches and protocol launches.
- **Per-domain action override.** Allow “always ask”, “always open”, or “never convert” for each configured domain.
- **Element Call links.** Recognize Element Call/LiveKit URLs if the deployment uses them.
- **Firefox/Safari.** Separate implementations; the current extension is Chromium-only.

## P2 — Linux and packaging

- **Wayland end-to-end testing.** The code path is implemented but has not been exercised on a real Wayland session in this repository.
- **ARM64 packaging.** Electron supports it; CI currently builds x86_64 only.
- **Flatpak.** Add a Flatpak manifest for sandboxed distribution and portal integration.
- **Desktop-environment matrix.** Test GNOME, KDE Plasma, and a wlroots compositor for tray, portal, and protocol handling.
- **Package signing and repository hosting.** Replace bare package downloads with an APT/YUM repository.
- **Uninstall cleanup.** Remove AppImage-generated desktop entries and user-level protocol associations when requested.

## P2 — platform expansion

- **Windows build.** Needed if users click Outlook links on Windows and want to launch a native TeamWork client.
- **macOS build.** Requires protocol registration, notarization, and screen-capture permissions.
- **Windows/macOS protocol aliases.** Register `teamwork://` and test deep-link forwarding.
- **Single sign-on account linking.** Server-side token exchange between Matrix OpenID and Jitsi JWT is not implemented.

## Quality and maintainability

- **ESLint and Prettier.** TypeScript is checked, but linting and formatting are not enforced.
- **Coverage thresholds.** Add `@vitest/coverage-v8` and a minimum threshold for shared URL/deep-link logic.
- **Playwright end-to-end tests.** Drive the shell, settings, logs, screen-share modal, and deep links.
- **Extension unit tests for settings/managed storage.** Current tests cover link matching, not storage merge behavior.
- **Manifest validation.** Added via `scripts/validate-extension.mjs`; extend it to validate zip contents and Chrome/Edge policy schemas.
- **Structured error reporting.** Renderer errors now flow into the main log; add optional opt-in crash reporting if required by the deployment.
- **Accessibility and localization.** Add a translation layer and RTL layout support if the deployment needs it.
- **Security review of embedded-view navigation defaults.** The compatibility-first policy keeps all HTTPS navigations in-app when no trusted auth origins are configured. Consider a stricter default for managed deployments.

## Documentation

- **Deployment runbook** for Element + Jitsi + shared IdP.
- **Enterprise policy examples** for Chrome/Edge extension force-install and protocol auto-launch.
- **Troubleshooting matrix** for SSO, certificates, Wayland portals, proxy, and extension matching.
- **Branding guide** covering logo dimensions, dark/light assets, and trademark usage.
- **Upgrade guide** for moving from committed binaries to GitHub Releases/Git LFS.

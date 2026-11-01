# Enterprise readiness assessment

Status: **pilot-ready, not yet enterprise-ready**

TeamWork has a solid technical foundation, but several controls expected in a managed enterprise deployment are missing. This document is a candid assessment and a remediation plan. It should be reviewed with IT security, identity, desktop engineering, and legal/compliance before a production rollout.

## Readiness matrix

| Area | Status | Summary |
|---|---|---|
| Core architecture | Good | Sandboxed shell, isolated Element/Jitsi sessions, narrow preload API, WebContentsView isolation. |
| Runtime hardening | Partial | Sandbox is now enforced app-wide and Electron fuses are enabled. Devtools, `file://` shell privileges, and navigation defaults still need policy. |
| Authentication / SSO | Partial | Web SAML/OpenID flows work inside the embedded clients. External-browser-only IdPs, token exchange, and logout propagation are not implemented. |
| Configuration management | Gap | User JSON config exists, but there is no system-wide policy file, lock enforcement, or MDM integration. |
| Package signing | Gap | AppImage/deb/rpm are unsigned. The release workflow builds artifacts but does not sign them. |
| Updates | Gap | No auto-update or signed update channel. |
| Observability | Partial | Rotating local logs and renderer error forwarding exist. No SIEM/syslog transport, support bundle, crash reporting, or audit trail. |
| Network / TLS | Partial | System/custom proxy and optional invalid-certificate override exist. No proxy authentication, PAC UI, mTLS client-certificate selection, or enterprise CA workflow. |
| Access control | Partial | Permission prompts and per-session isolation exist. No central permission policy or admin lock. |
| Browser extension | Partial | Managed-storage schema and FQDN configuration exist. No fixed extension ID, signed CRX/update URL, store listing, or authenticated browser E2E test. |
| Reliability | Partial | Session persistence, retries, and error states exist. No auto-update rollback, long-run soak tests, or packaged-artifact CI tests. |
| Accessibility | Gap | Basic labels/roles exist; no WCAG/EN 301 549 audit, focus traps, zoom controls, or screen-reader validation. |
| Compliance / legal | Partial | Apache-2.0 shell, Element AGPL notice, trademark notice. No privacy policy, DPA guidance, SBOM, or export-control review. |
| Platform coverage | Gap | Linux x86_64 only. No ARM64, Flatpak, Windows, or macOS. |
| Quality engineering | Partial | 63 unit tests, TypeScript checks, build and smoke tests. No lint, coverage gate, E2E suite, or real Wayland/SSO test. |
| Supply chain | Gap | No CodeQL, dependency review, SBOM, artifact attestations, or pinned GitHub Action SHAs. |

## What is already in good shape

- Official Element Web and Jitsi Meet clients are embedded rather than reimplemented, preserving upstream features and web SSO.
- The shell, preload, and both embedded views are sandboxed with context isolation and no Node integration.
- Persistent, isolated Chromium partitions keep Element and Jitsi sessions separate.
- Deep links are origin-validated and tokens are redacted from the main log.
- Configuration is schema-validated, written atomically with `0600` permissions, and invalid files are backed up.
- Permission prompts are restricted to configured origins, with explicit prompts for cross-origin media.
- AppImage, deb, and rpm packaging, desktop integration, protocol registration, and a tag-based GitHub Release workflow exist.
- The Chrome/Edge extension has managed-storage schema support, trusted FQDN configuration, SafeLinks unwrapping, and Jitsi/Matrix conversion tests.
- Renderer crashes and unhandled rejections now reach the main log.
- Electron fuses disable `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and inspector flags, force ASAR loading, and enable cookie encryption.

## P0 — blockers before production

### 1. Signed releases and update integrity

**Problem:** packages and the extension zip are unsigned; there is no auto-update.

**Required:**

- Sign deb/rpm with an organization key.
- Publish a signed `SHA256SUMS` or repository metadata.
- Add a signed update feed (AppImage update information or APT/YUM repository).
- Verify signatures in the installer/updater, not just at download time.
- Add a rollback path and staged rollout channel.

**Files:** `electron-builder.yml`, `.github/workflows/release.yml`, new updater module.

### 2. Enterprise policy and locked settings

**Problem:** all settings are user-editable JSON. There is no read-only system policy or MDM path.

**Required:**

- Read `/etc/teamwork/policy.json` (override with `TEAMWORK_POLICY_FILE`).
- Define precedence: defaults < user config < system policy.
- Mark managed fields read-only in the GUI.
- Enforce security-critical policy in main, even if the user file is edited.
- Add schema/version validation and policy diagnostics.
- Document MDM/Intune/Ansible deployment.

**Suggested policy fields:** Element/Jitsi URLs, trusted auth origins, proxy, certificate policy, clear-sessions-on-exit, notifications, allowed views, devtools, update channel, extension deployment.

**Files:** new `src/main/policy-store.ts`, `src/main/paths.ts`, `src/main/config-store.ts`, `src/main/app-controller.ts`, `src/shared/settings.ts`, `src/renderer/components/SettingsView.tsx`.

### 3. External-browser SSO fallback

**Problem:** IdPs that refuse embedded browsers cannot complete sign-in.

**Required:**

- Open the IdP URL in the system browser when configured.
- Register a callback deep link (`teamwork://auth/callback`) and forward the authorization code/token to the embedded client or a secure broker.
- Support PKCE and state validation.
- Never log codes/tokens; clear them after exchange.
- Document which IdPs require this path.

**Files:** new `src/main/auth-flow.ts`, `src/main/index.ts`, `src/main/app-controller.ts`, `src/shared/deep-links.ts`, protocol registration.

### 4. Real SSO and IdP validation

**Problem:** tests use local pages; the actual SAML/OpenID flow has not been exercised.

**Required:**

- Test Entra ID, Keycloak/Authentik, and the actual Jitsi/Matrix deployment.
- Test MFA, conditional access, tenant restrictions, and session expiry.
- Test logout and reauthentication.
- Test JWT/token refresh and deep-linked meetings.
- Document supported and unsupported IdP configurations.

### 5. Supply-chain and CI hardening

**Required:**

- Pin GitHub Actions to commit SHAs.
- Add CodeQL, dependency review, `npm audit --omit=dev` (with a documented exception process), and Dependabot.
- Generate an SBOM (CycloneDX) per release and attach it to the GitHub Release.
- Publish build provenance/attestations.
- Run packaged AppImage/deb/rpm smoke tests in CI, not just builds.
- Add branch protection and required status checks.

**Files:** `.github/workflows/*`, `package.json`, new `scripts/sbom.mjs`.

### 6. Move large binaries out of Git

The AppImage/deb/rpm blobs are in Git history and exceed GitHub's recommended file size. Use GitHub Releases or Git LFS for future artifacts, and plan a history cleanup with the team. The new release workflow is the right distribution path.

## P1 — required for a managed rollout

### Identity and access

- Shared IdP architecture for Matrix and Jitsi (Keycloak/Authentik/Entra ID).
- Server-side Matrix OpenID → Jitsi JWT exchange.
- Logout propagation: clearing one session should not leave the other unexpectedly authenticated.
- Session lifetime display and reauthentication prompt.
- Device posture / conditional access guidance.
- Client-certificate selection for mTLS.
- Proxy authentication (NTLM/Kerberos/basic) and PAC support.
- Enterprise CA documentation; make “allow invalid certificates” policy-controlled and preferably disabled in managed mode.

### Operations

- Support bundle: logs, config (redacted), versions, session type, package info, extension version.
- Optional syslog/HTTP log forwarding with redaction rules.
- Crash reporting with explicit opt-in and data-retention controls.
- Audit events for settings changes, session clearing, deep-link joins, and policy overrides.
- Health/status endpoint or tray diagnostics.
- Update channel selection (stable/beta) and rollback.

### Desktop UX

- Unified notification center and unread badges.
- Calendar integration: ICS first, Microsoft Graph second, Outlook add-in optional.
- Manual Matrix/Element link dialog in addition to the extension.
- Downloads/print handling from embedded clients.
- Focus traps and WCAG/EN 301 549 accessibility audit.
- Keyboard navigation and high-contrast theme.
- Multi-monitor, HiDPI, and audio-device settings validation.
- Real Wayland portal testing across GNOME, KDE, and wlroots.

### Browser extension

- Generate and publish a fixed extension ID/key.
- Sign a CRX or publish to Chrome Web Store/Edge Add-ons under the organization account.
- Add `update_url` and enterprise policy templates.
- Provide a managed policy example for force-install, domain allowlists, mode, and protocol auto-launch.
- Add a real Chromium browser E2E test.
- Add a diagnostics page for failed matches and protocol prompts.
- Consider native messaging to read the app's configured URLs and avoid duplicate admin configuration.
- Add a privacy policy and permission justification for store review.

### Packaging and platform

- APT/YUM repository hosting and unattended upgrade guidance.
- ARM64 builds.
- Flatpak manifest with portal integration.
- AppArmor/SELinux guidance.
- Windows and macOS builds if any users run Outlook natively there.
- Desktop-environment compatibility matrix.

## P2 — maturity improvements

- ESLint, Prettier, and pre-commit hooks.
- Vitest coverage thresholds for shared URL/deep-link/extension code.
- Playwright end-to-end tests for the shell, settings, logs, screen-share, deep links, and extension.
- Performance budgets for startup, memory, and long-running meetings.
- Localization/i18n and RTL.
- Configuration schema migrations and downgrade protection.
- Custom protocol (`app://`) for the shell instead of `file://`, allowing `grantFileProtocolExtraPrivileges` to be disabled.
- Compile-time or policy-controlled devtools disablement.
- Replace the optional invalid-certificate override with per-host policy.
- Automated dependency/license inventory and renewal process.
- Documented incident response and vulnerability SLAs.

## Suggested implementation sequence

### Phase 1 — enterprise gate (2–3 weeks)

1. System policy file and GUI locking.
2. Signed packages/checksums and SBOM.
3. External-browser SSO fallback.
4. Real IdP and Wayland test pass.
5. CI packaged-artifact smoke tests, CodeQL, dependency review, pinned actions.
6. Move release binaries to Releases/LFS.

### Phase 2 — managed operations (3–6 weeks)

1. Auto-update with signed metadata and rollback.
2. Support bundle and optional SIEM forwarding.
3. Proxy auth, mTLS, and CA policy.
4. Extension fixed ID, signing, managed deployment, browser E2E.
5. ICS calendar and notification center.

### Phase 3 — platform and compliance (6–12 weeks)

1. Microsoft Graph/Outlook add-in.
2. ARM64, Flatpak, Windows/macOS as required.
3. Accessibility certification and i18n.
4. Full E2E/coverage/performance program.
5. Security review/penetration test and remediation.

## Decisions needed from the enterprise

1. Which Linux distributions and desktop environments are supported?
2. Which IdP(s), and do they allow embedded browsers?
3. Is Jitsi authenticated by SAML/OpenID directly, JWT, or a reverse proxy?
4. Is the browser extension deployed from a store or self-hosted with policy?
5. What is the required package-signing and update mechanism?
6. Are centralized logs/SIEM and audit trails mandatory?
7. Is Windows/macOS in scope?
8. What accessibility and data-protection standards apply?
9. Are there restrictions on telemetry, crash reporting, or third-party services?
10. Who owns server-side Element/Jitsi/IdP operations?

## Bottom line

The application is a credible **pilot** today. It is not yet suitable for a regulated or large managed desktop fleet until **policy management, signed/updated artifacts, external-browser SSO, real IdP validation, and supply-chain controls** are in place. The existing architecture is a good base; the largest work is operational and identity-related, not a rewrite of the UI.

# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Use GitHub's private security advisory flow:

https://github.com/RogerBergling/TeamWork/security/advisories/new

Include:

- A description of the issue and its impact.
- Steps to reproduce.
- Affected component: desktop shell, embedded view handling, deep links, or browser extension.
- Version and Linux distribution.
- Whether the issue requires a malicious page, a malicious configuration file, or local access.

Do not test against production Element/Jitsi deployments or identity providers without explicit permission.

## Scope

In scope:

- Electron main/preload/renderer isolation.
- Embedded view navigation, popup, permission, and protocol handling.
- `teamwork://` deep-link parsing and origin validation.
- Browser extension permissions, link interception, managed storage, and background/content-script behavior.
- Configuration handling, logging, and local file access.
- Packaging and update metadata.

Out of scope:

- Vulnerabilities in Element Web, Jitsi Meet, Matrix homeservers, Prosody, Jicofo, JVB, or identity providers. Report those upstream.
- Misconfiguration of third-party servers.
- Social engineering that does not involve a TeamWork vulnerability.
- Issues requiring a compromised local user account or root access.

## Security model

The desktop app embeds the official Element and Jitsi web clients in isolated, sandboxed Chromium partitions. The shell renderer is sandboxed and only receives a narrow preload API. Deep links are validated against the configured Jitsi/Element origins. The browser extension only constructs deep links; it does not bypass the desktop app's validation.

See [Architecture](docs/architecture.md) for details.

# Authentication

TeamWork does not implement authentication itself. It hosts the official Element and Jitsi web clients, so each application uses the authentication configured on its server.

```text
TeamWork ──► Element Web ──► Matrix homeserver ──► IdP (OIDC/SAML)
        └──► Jitsi Meet  ──► Jitsi auth flow  ──► IdP / JWT service
```

TeamWork never reads passwords, access tokens, or SAML assertions. They remain inside the Chromium session for the relevant application.

## How the web flows are preserved

- **Persistent sessions.** Element and Jitsi each have a separate Chromium partition (`persist:element`, `persist:jitsi`). Cookies and storage survive restarts.
- **Top-level redirects.** SAML POST bindings, OpenID redirects, consent pages, MFA prompts, and tenant selection pages are allowed in the embedded view.
- **Popups.** `window.open` login windows are allowed with the same session partition and sandbox. `window.opener` messaging keeps OIDC popup flows working.
- **Optional system-browser handoff.** Trusted IdP origins can be opened in the default browser, with a `teamwork://auth` callback. See [System-browser SSO fallback](#system-browser-sso-fallback).
- **User agent.** Electron is removed from the default user agent. Some IdPs reject requests containing "Electron"; the resulting UA is a normal Chrome UA on Linux.
- **No credential interception.** There is no login form in the shell and no password storage in the config file.

## Trusted authentication origins

By default, every `http(s)` navigation stays inside the embedded application. This maximises SAML/OpenID compatibility because redirect chains often cross several hosts that are difficult to predict.

Once your IdP hosts are known, add them under **Settings → Authentication → Trusted authentication origins**, one origin per line:

```text
https://login.example.com
https://sso.example.com
https://tenant.example.com
```

Matching is by origin only: `scheme://host[:port]`. A path in an entry is ignored for matching.

With at least one trusted origin configured:

- The configured Element/Jitsi origin stays in-app.
- Trusted IdP origins stay in-app, unless system-browser SSO is enabled.
- Other links open in the system browser.

This keeps ordinary web links out of the application without breaking sign-in.

## System-browser SSO fallback

Some identity providers refuse to render their sign-in page in an embedded browser. TeamWork can hand trusted authentication navigations to the default system browser:

1. Add the IdP origins under **Authentication → Trusted authentication origins**.
2. Enable **Authentication → Use the system browser for SSO**.
3. Configure the IdP to return to TeamWork after authentication.

When the embedded Element or Jitsi view navigates or opens a popup to a trusted origin, TeamWork opens that page in the default browser and shows a notification.

### IdP redirect URI

Register one of these callback URIs at the IdP:

```text
teamwork://auth?view=element
teamwork://auth?view=jitsi
teamwork://auth/callback?view=element
teamwork://auth/callback?view=jitsi
```

The callback can also carry a return URL on the configured application origin:

```text
teamwork://auth?view=element&url=https%3A%2F%2Felement.example.com%2F...
```

TeamWork validates the return URL against the configured Element/Jitsi origin before loading it. A callback for another origin is rejected. Tokens and query parameters are not written to the main log.

A callback is accepted only while a system-browser sign-in started by TeamWork is pending (30-minute window, persisted across a restart). This prevents an arbitrary website from invoking `teamwork://auth` and forcing a login URL into an embedded session. Trigger the sign-in from the Element or Jitsi view; a callback from a manually started browser session is rejected.

If `view` is omitted, TeamWork infers the application from the return URL. If both Element and Jitsi are configured and there is no return URL, the callback must specify `view=element` or `view=jitsi`.

### Important limitation

The system browser and the embedded Chromium session have separate cookie stores. Opening the IdP externally removes the embedded-browser rejection, but the application/IdP must still return a URL or token that the embedded client accepts. TeamWork does not act as an OAuth client, does not exchange authorization codes, and does not copy cookies between browsers.

- Matrix/Element SSO needs a return URL that Element can complete (for example a `loginToken` URL).
- Jitsi needs a JWT or another callback flow supported by your deployment.
- SAML HTTP-POST to a server-side ACS endpoint cannot be intercepted by the desktop application; the IdP or reverse proxy must provide a desktop-compatible return path.
- If the IdP cannot redirect to a custom URI scheme, system-browser SSO cannot complete automatically. Keep the embedded flow, use the user-agent override, or ask the IdP administrator for a supported OIDC client flow.

## Matrix / Element

Element Web supports the login methods enabled on your homeserver, commonly:

- Password login.
- OIDC via the homeserver or Matrix Authentication Service (MAS).
- SAML through a homeserver-side bridge or a reverse proxy/IdP gateway.
- SSO via the homeserver's `m.login.sso` flow.

If the sign-in flow works in a normal browser against your Element URL, it should work in TeamWork. If it does not, the usual causes are:

1. The IdP rejects embedded browsers or an unknown user agent.
2. The IdP requires a cookie policy that Chromium blocks.
3. A redirect target is not reachable from the client machine.
4. A private CA certificate is not trusted.

## Jitsi Meet

Jitsi deployments commonly use one of these models:

- **JWT / token authentication** (`tokenAuthUrl` or an external token service).
- **SAML/OpenID gateway** in front of Jitsi, with the Jitsi web app redirected to an IdP and then back.
- **LDAP or another portal** that establishes a session before Jitsi loads.
- **Anonymous rooms** with no authentication.

Whatever the browser sees at the configured Jitsi URL is what TeamWork loads. If Jitsi redirects to an IdP, the embedded Jitsi session follows the redirect. If the Jitsi deployment expects a token in the URL or a cookie, that flow remains the deployment's responsibility.

A common enterprise setup is a shared IdP (Keycloak, Authentik, Entra ID, Okta) issuing identities to both Matrix and Jitsi. TeamWork does not exchange tokens between the two applications; that integration belongs on the server side (for example, a broker that exchanges a Matrix OpenID token for a Jitsi JWT).

## Identity providers that block embedded browsers

Some providers intentionally refuse to render login pages inside embedded webviews. Workarounds, in order:

1. **Override the user agent** under **Connection → Element/Jitsi user agent override** with a current desktop Chrome UA.
2. **Enable system-browser SSO** and add the IdP origins to trusted authentication origins. See [System-browser SSO fallback](#system-browser-sso-fallback).
3. **Ask the IdP administrator** to permit the application or use a supported OIDC client flow.

The system-browser path is a handoff, not a cookie-sharing mechanism. It is only complete when your IdP and the Element/Jitsi deployment return a URL or token that the embedded client accepts.

## Certificates

Private-CA deployments have two options:

- Install the CA in the system trust store (recommended; Chromium/Electron uses it).
- Enable **Authentication → Allow invalid TLS certificates**. Every rejected certificate becomes a logged warning, and the page is allowed to load.

The second option weakens transport security and should be limited to controlled internal networks.

## Session handling

- **Clear Element session** and **Clear Jitsi session** under Authentication remove cookies, local storage, cache, and HTTP auth cache for that application only.
- **Clear sessions on exit** does the same for both when TeamWork quits.
- Sessions are not stored in the JSON config; they live in Chromium profile directories under the TeamWork configuration directory.

## Troubleshooting checklist

1. Confirm the same URL works in a normal Chrome window on the same machine.
2. Check **Logs** with **Debug mode** enabled; failed loads and certificate warnings are logged.
3. Verify DNS, proxy, and clock skew (SAML assertions are time-sensitive).
4. Add all IdP origins to trusted authentication origins.
5. Try a user-agent override if the IdP shows an "unsupported browser" page.
6. If private certificates are involved, install the CA or temporarily enable certificate exceptions.
7. Clear the affected embedded session and retry.
8. For Wayland-only display problems, switch the backend to X11; authentication itself is unrelated to the display backend.

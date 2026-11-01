# Performance and startup

This document covers desktop startup performance and the server-side factors that dominate Element/Jitsi load time.

## What is measured now

The main process writes a startup timing line at `renderer-ready`:

```text
Startup timing: {"main-module-loaded":0.1,"config-loaded":6.1,"app-ready":59.6,
"controller-start":61,"window-created":99.8,"views-prepared":103.4,
"tray-ready":107.7,"menu-ready":108.7,"shell-loaded":165.3,"renderer-ready":215.4}
```

Values are milliseconds from module load. First time an embedded view reaches `ready`, an additional line is written:

```text
Startup: element ready at 208.4 ms
Startup: jitsi ready at 241.5 ms
```

Use these timings to separate shell startup from Element/Jitsi network and SSO latency.

## Implemented optimizations

### Lazy view loading

Only the view the user actually opens is loaded:

- Element starts loading when it is the selected view.
- Jitsi is not loaded until the user opens **Meet**, uses the tray/menu, follows a Jitsi deep link, or joins a meeting.
- Changing an inactive view's URL does not load it in the background.
- An inactive view is marked cold when its URL, user agent, or session changes, and reloads on next activation.

This avoids paying Jitsi's network, authentication, WebRTC, and memory cost for chat-only users.

### Renderer code splitting

- Zod validation is main-process only; it is no longer in the renderer bundle.
- Settings, Logs, Join meeting, and Screen share are separate chunks.
- The initial renderer bundle dropped from roughly 831 KB to roughly 615 KB before gzip/compression.
- Settings and Logs are mounted on first use and kept mounted afterward so drafts survive navigation.

### Runtime hardening is not traded for speed

The app-wide Chromium sandbox and Electron fuses remain enabled. Do not disable them to save startup time.

## Packaging recommendation

For managed fleets and fastest repeatable startup, prefer the installed **deb** or **rpm** over the AppImage:

- deb/rpm launch directly from `/opt/TeamWork`.
- AppImage adds FUSE mount or extract-and-run overhead.
- AppImage does not provide native package-manager updates.
- AppImage is useful for ad-hoc pilots and isolated machines.

If AppImage is required, do not use `APPIMAGE_EXTRACT_AND_RUN=1` for everyday launches unless FUSE is unavailable.

## Client-side settings that affect perceived startup

- Keep **Clear sessions on exit** disabled for normal users. It forces a full login and cold caches on every launch.
- Keep hardware acceleration enabled unless a driver requires otherwise.
- Keep the log level at `info` or `warn`; `debug` is for diagnosis and adds I/O.
- Avoid oversized custom CSS.
- Use a persistent profile; do not run the app with a fresh `TEAMWORK_CONFIG_DIR` in production.
- Starting minimized to tray is an option for users who want an effectively instantaneous first window, at the cost of background memory.

## Server-side tuning: Element

Element startup is often dominated by homeserver and Matrix sync latency.

Recommended:

- Use **Simplified Sliding Sync** where the homeserver supports it.
- Enable lazy-loading of room members.
- Keep the initial sync payload small; avoid joining hundreds of rooms on first login.
- Ensure `/.well-known/matrix/client` responds quickly and without redirect chains.
- Serve Element Web with HTTP/2 or HTTP/3, compression, and long-lived static asset caching.
- Keep TLS and DNS latency low; avoid proxy PAC lookups on every request.
- Let Element's service worker cache app assets between launches.
- Avoid clearing the app cache at exit.
- Check that the homeserver is not rate-limiting initial sync.

## Server-side tuning: Jitsi

Jitsi load time includes the web app, config, authentication, and conference discovery.

Recommended:

- Keep `config.js` small and cacheable.
- Avoid unnecessary redirects before the meeting page.
- Use a close Jicofo/JVB and low-latency TURN if required.
- Use WebSocket signaling where supported rather than repeated BOSH polling.
- Test prejoin and lobby latency; these are often mistaken for app startup.
- Keep SSO/JWT validation responsive and cache IdP metadata.
- Ensure the Jitsi deployment is not loading unnecessary analytics, recording, or transcription widgets.
- Use HTTP/2/HTTP/3 and compression for static assets.

## Identity and network factors

- SAML/OpenID redirect chains and MFA add several seconds; measure them separately.
- Conditional access and device-compliance checks can dominate SSO time.
- Proxy authentication, PAC resolution, certificate revocation, and slow DNS can add seconds.
- For managed environments, preconfigure proxy and CA settings instead of using per-launch discovery.
- Persistent SSO sessions are the single largest real-world improvement for repeat launches.

## Suggested targets

For a standard enterprise laptop on the corporate LAN:

| Milestone | Target |
|---|---|
| Window visible / shell loading | under 1.0 s |
| Shell interactive (`renderer-ready`) | under 1.5 s |
| Element ready with warm session | under 3.0 s |
| Jitsi ready after clicking Meet | under 3.0 s |
| First Jitsi join with warm SSO | under 5.0 s |

These are diagnostics targets, not guarantees. Measure on the actual managed image.

## Next performance work

- Add a startup benchmark to CI/Xvfb and record the timing line.
- Add a support diagnostic that reports the startup timing snapshot.
- Preconnect or prefetch the selected view's origin after the shell is ready if the user remains idle, but keep Jitsi unloaded until requested.
- Test whether moving the shell from `file://` to a custom `app://` protocol allows disabling the file-protocol fuse without regressions.
- Add memory and long-meeting soak tests.
- Profile Element initial sync with the real deployment before changing synchronization settings.

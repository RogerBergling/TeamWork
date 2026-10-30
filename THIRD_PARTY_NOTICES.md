# Third-party notices

TeamWork is a desktop shell. It does not include or distribute the Element or Jitsi server applications. The shell loads those web clients from URLs configured by the user.

## Element Web

- Project: https://github.com/element-hq/element-web
- License: **AGPL-3.0**
- Role in TeamWork: loaded remotely from the user's Element deployment by default.

If you modify Element Web and distribute it together with TeamWork (for example, by bundling a local build in the AppImage), the AGPL requires you to provide the corresponding source code and preserve the license notices. Consult your legal team before redistributing a modified Element build. Merely pointing TeamWork at an independently hosted Element deployment is different from distributing Element.

## Jitsi Meet

- Project: https://github.com/jitsi/jitsi-meet
- License: **Apache-2.0**
- Role in TeamWork: loaded remotely from the user's Jitsi deployment by default.

Jitsi, Jitsi Meet, and the Jitsi logo are trademarks of their respective owners. TeamWork is not endorsed by or affiliated with the Jitsi project.

## Electron

- Project: https://github.com/electron/electron
- License: MIT
- Role: Chromium/Node desktop runtime bundled into the application.

## React

- Project: https://github.com/facebook/react
- License: MIT
- Role: shell renderer UI.

## Zod

- Project: https://github.com/colinhacks/zod
- License: MIT
- Role: configuration validation.

## electron-log

- Project: https://github.com/megahertz/electron-log
- License: MIT
- Role: structured file and console logging.

## electron-vite

- Project: https://github.com/alex8088/electron-vite
- License: MIT
- Role: build tooling (not shipped).

## Vite

- Project: https://github.com/vitejs/vite
- License: MIT
- Role: build tooling (not shipped).

## Electron Builder

- Project: https://github.com/electron-userland/electron-builder
- License: MIT
- Role: AppImage/deb/rpm packaging (not shipped).

## Sharp

- Project: https://github.com/lovell/sharp
- License: Apache-2.0
- Role: icon generation during development (not shipped at runtime).

## Fonts and icons

The interface uses system fonts and inline SVG icons authored for TeamWork. No third-party icon font is bundled.

## Trademarks

Element, Matrix, Jitsi, and all other product names are trademarks or registered trademarks of their respective owners. TeamWork uses these names only to describe compatibility and interoperability.

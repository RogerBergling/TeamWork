# Jitsi meeting links and deep links

TeamWork can open a specific Jitsi meeting instead of only the Jitsi home page.

There are two ways to use it:

1. **Paste a Jitsi URL** into **Meet → Join meeting** (`Ctrl+J`).
2. **Click a `teamwork://join?...` link** in an invitation, email, browser, or chat message.

Normal `https://meet.example.com/...` links in Outlook still open the browser. HTTPS is owned by the browser, and TeamWork cannot claim only one Jitsi domain without hijacking every website.

## Join meeting dialog

The dialog accepts either:

- a normal Jitsi URL:
  ```text
  https://meet.example.com/team-standup?jwt=...
  ```
- a TeamWork deep link:
  ```text
  teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Fteam-standup%3Fjwt%3D...
  ```

The complete URL is preserved, including query parameters, JWT tokens, and fragments. TeamWork validates that the meeting URL has the same origin as the Jitsi URL configured in Settings. Links from other origins are rejected.

## Matrix and Element links

Matrix rooms and direct messages use a separate deep-link action:

```text
teamwork://matrix?url=https%3A%2F%2Fmatrix.to%2F%23%2F%21room%3Aexample.com
```

TeamWork accepts:

- `matrix.to` room links such as `https://matrix.to/#/!room:example.com`
- `matrix.to` user links such as `https://matrix.to/#/@alice:example.com`
- Direct Element permalinks on the configured Element origin, for example `https://element.example.com/#/room/!room:example.com`

`matrix.to` links are converted to the configured Element base URL. The Element URL must be configured in **Settings → Connection**; otherwise the link is rejected.

The [Chrome/Edge extension](browser-extension.md) can generate these Matrix deep links from ordinary HTTPS links.

## Creating a clickable invitation link

Encode the complete Jitsi URL and put it in the `url` parameter:

```text
teamwork://join?url=<URL-encoded Jitsi meeting URL>
```

Example using Python:

```bash
python3 - <<'PY'
from urllib.parse import quote
meeting = "https://meet.example.com/team-standup?jwt=abc123"
print("teamwork://join?url=" + quote(meeting, safe=""))
PY
```

Output:

```text
teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Fteam-standup%3Fjwt%3Dabc123
```

Add this as a second link in the meeting invitation, for example:

```text
Join in browser: https://meet.example.com/team-standup?jwt=abc123
Join in TeamWork: teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Fteam-standup%3Fjwt%3Dabc123
```

Some Outlook clients do not make unknown URL schemes clickable. In that case, users can copy the normal Jitsi URL into the Join meeting dialog.

## Operating system registration

The `teamwork://` link only works when Linux knows which application handles that scheme. This is called a URL-scheme or MIME association.

### deb and rpm packages

The installed `.desktop` file contains:

```text
MimeType=x-scheme-handler/teamwork;
```

The package manager registers it system-wide during installation. No manual configuration is needed. Verify with:

```bash
xdg-mime query default x-scheme-handler/teamwork
```

It should print `teamwork.desktop`.

### AppImage

An AppImage is not installed, so TeamWork writes a user-level registration on first run:

```text
~/.local/share/applications/teamwork.desktop
~/.local/share/icons/hicolor/512x512/apps/teamwork.png
```

It then calls `xdg-mime` to associate `teamwork://` with that desktop file. No root access is required.

If automatic registration is unavailable, configure it manually:

```bash
xdg-mime default teamwork.desktop x-scheme-handler/teamwork
update-desktop-database ~/.local/share/applications
```

Verify:

```bash
xdg-mime query default x-scheme-handler/teamwork
xdg-open "teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Froom"
```

The AppImage path is stored in the generated desktop entry. If you move the AppImage, start it once from the new location so the entry is refreshed.

### Development mode

Protocol registration is skipped in development, so use the Join meeting dialog or test with a packaged build. The deep-link parser itself is covered by unit tests.

## Browser behavior

When clicking a `teamwork://` link from a browser or Outlook Web, the browser may show a one-time "Open TeamWork?" confirmation. That confirmation is controlled by the browser, not by TeamWork.

The link only launches TeamWork on the same Linux desktop where the application is installed. If the invitation is opened on a phone or another computer, use the normal Jitsi link and paste it into TeamWork manually.

## Security

- Only `http://` and `https://` meeting URLs are accepted.
- The meeting origin must exactly match the configured Jitsi origin.
- URLs containing credentials (`user:password@`) are rejected.
- The full URL is passed to the Jitsi view, but query strings and JWT tokens are redacted from log messages.
- Links are limited to 4096 characters.

## Why Outlook integration is still a separate step

The deep link solves **click-to-join when the invitation contains a TeamWork link** or when the user pastes the Jitsi URL. It does not read the Outlook calendar automatically.

To show upcoming meetings inside TeamWork without changing invitations, add one of:

- **ICS calendar reading** — low effort, no Microsoft Graph permissions.
- **Microsoft Graph** — native Outlook 365 calendar access, requiring an Azure app registration and consent.
- **Outlook add-in** — adds a "Join in TeamWork" action to meeting windows, requiring tenant deployment.

Those are separate features from the deep-link handling implemented here.

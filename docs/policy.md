# Enterprise policy

TeamWork supports a read-only system policy for managed Linux desktops. The policy is a partial settings file: every field it contains is applied over the user configuration and becomes read-only in the GUI.

## Precedence and location

```text
built-in defaults  <  ~/.config/teamwork/config.json  <  system policy
```

The default policy path is:

```text
/etc/teamwork/policy.json
```

Development builds can override it for testing or a non-standard layout:

```bash
TEAMWORK_POLICY_FILE=/path/to/policy.json teamwork
```

Packaged builds ignore `TEAMWORK_POLICY_FILE` and always read `/etc/teamwork/policy.json`, so a user cannot redirect the managed policy to a file they control.

The policy file is read once at startup. Restart TeamWork after changing it.

## Minimal example

```json
{
  "servers": {
    "elementUrl": "https://element.example.com",
    "jitsiUrl": "https://meet.example.com"
  },
  "authentication": {
    "trustedAuthOrigins": ["https://login.example.com"],
    "externalBrowserSso": false,
    "allowInsecureCertificates": false,
    "clearSessionsOnExit": true
  },
  "network": {
    "proxyMode": "system"
  },
  "advanced": {
    "enableDevTools": false
  }
}
```

A larger example is in [`policy.example.json`](../policy.example.json).

Only fields present in the policy are locked. In the example above, the user can still change the theme, zoom, logging level, and window behaviour, but cannot change the server URLs, trusted origins, certificate policy, session clearing, proxy mode, or developer tools.

## Enforcement model

- The main process applies the policy after loading the user configuration.
- The GUI marks managed fields as **Managed by policy** and disables their controls.
- Saving, resetting, importing, and direct edits to `config.json` cannot override a policy value; the policy is applied again before settings are used.
- Policy fields are also used by startup code (hardware acceleration, display backend, logging) and by the embedded sessions (user agent, proxy, permissions).
- The user configuration file is still written with the user's own values. If the policy is removed later, those values take effect again.
- Importing a configuration may persist values for locked fields in the user file; they are ignored while the policy is present and take effect only after the policy is removed.

## Validation and diagnostics

The policy is validated with the same schema as the user configuration. It must be a JSON object. Unknown fields are rejected so a typo cannot silently leave a control unlocked. The file must:

- be a regular file (not a symlink or directory);
- be owned by `root`;
- not be group- or world-writable.

If a managed policy exists but cannot be read or validated:

- TeamWork logs a warning and shows the error in **Settings**.
- The application fails closed: built-in defaults are used and user settings are ignored until the policy is repaired.
- The application still starts so an administrator can repair the file.

For a managed fleet, treat a policy error as a deployment failure and monitor the application log.

## Deployment

Ansible example:

```yaml
- name: Install TeamWork policy
  ansible.builtin.copy:
    src: policy.json
    dest: /etc/teamwork/policy.json
    owner: root
    group: root
    mode: "0644"
```

Package or MDM deployment should place the file with `root:root` and mode `0644` (not writable by the user). Do not put passwords, tokens, or private keys in the policy file; it is world-readable by design and is not a secret store.

## Suggested managed fields

| Area | Fields |
|---|---|
| Servers | `servers.elementUrl`, `servers.jitsiUrl`, `servers.startView` |
| Identity | `authentication.trustedAuthOrigins`, `authentication.externalBrowserSso` |
| TLS | `authentication.allowInsecureCertificates` |
| Sessions | `authentication.clearSessionsOnExit`, `authentication.notifications` |
| Branding | `appearance.appName`, `appearance.organizationName`, `appearance.logoPath`, `appearance.customCss` |
| Network | `network.proxyMode`, `network.proxyUrl` |
| Diagnostics | `logging.debug`, `logging.level`, `advanced.enableDevTools` |
| Linux | `linux.ozonePlatform` |

Locking a field does not make it safe by itself. For example, only enable `authentication.allowInsecureCertificates` for controlled private-CA deployments, and prefer installing the CA system-wide.

## Related documentation

- [Configuration reference](configuration.md)
- [Authentication](authentication.md)
- [Enterprise readiness](enterprise-readiness.md)

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g
const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:access_token|refresh_token|id_token|token|jwt|code|password|secret|key)=)[^&\s"'<>]+/gi
const LONG_PATH_TOKEN_PATTERN = /\/([A-Za-z0-9_-]{32,})(?=\/|$)/g
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

/** Removes query/hash values and token-shaped path segments from a URL. */
export function redactTokenLike(value: string): string {
  return value
    .replace(JWT_PATTERN, '[redacted-token]')
    .replace(BEARER_PATTERN, '$1[redacted-token]')
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted-token]')
    .replace(LONG_PATH_TOKEN_PATTERN, '/[redacted-token]')
}

/** Console output from remote applications is untrusted and may contain tokens. */
export function redactConsoleMessage(value: string, maxLength = 2000): string {
  return redactTokenLike(value)
    .replace(CONTROL_PATTERN, ' ')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, Math.max(0, maxLength))
}

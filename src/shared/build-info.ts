export interface BuildParts {
  date: string
  time: string
  hour: string
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * Formats a build timestamp in the user's local timezone.
 * Invalid or missing timestamps fall back to stable "unknown" values.
 */
export function formatBuildParts(timestamp: string): BuildParts {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return { date: 'unknown', time: 'unknown', hour: 'unknown' }
  }

  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    hour: hours
  }
}

export function buildLabel(version: string, buildNumber: string): string {
  return `v${version} · build ${buildNumber}`
}

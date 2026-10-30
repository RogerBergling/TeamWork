import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppLogger } from './logger'

interface CommandResult {
  error: Error | null
  stdout: string
  stderr: string
}

function run(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 8000 }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout ?? '', stderr: stderr ?? '' })
    })
  })
}

function escapeDesktopExec(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')
}

export function buildAppImageDesktopEntry(
  appImagePath: string,
  iconName = 'teamwork'
): string {
  const safePath = appImagePath.replace(/[\r\n]/g, '')
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=TeamWork',
    'GenericName=Team Collaboration Client',
    'Comment=Chat and meet with Element and Jitsi',
    `Exec="${escapeDesktopExec(safePath)}" %u`,
    `Icon=${iconName}`,
    'Terminal=false',
    'Categories=Network;InstantMessaging;VideoConference;',
    'Keywords=chat;matrix;element;meeting;jitsi;video;conference;',
    'StartupWMClass=teamwork',
    'StartupNotify=true',
    'MimeType=x-scheme-handler/teamwork;',
    ''
  ].join('\n')
}

function findInstalledDesktopFile(): string | null {
  const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share')
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
    .split(':')
    .filter(Boolean)
  for (const directory of [dataHome, ...dataDirs]) {
    const candidate = join(directory, 'applications', 'teamwork.desktop')
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function ensureTeamWorkHandler(logger: AppLogger): Promise<void> {
  const query = await run('xdg-mime', ['query', 'default', 'x-scheme-handler/teamwork'])
  if (!query.error && query.stdout.trim() === 'teamwork.desktop') return

  const result = await run('xdg-mime', [
    'default',
    'teamwork.desktop',
    'x-scheme-handler/teamwork'
  ])
  if (result.error) {
    logger.warn(
      'Could not register teamwork:// with xdg-mime; install xdg-utils or set the handler manually',
      result.error
    )
  } else {
    logger.info('Set TeamWork as the teamwork:// URL handler')
  }
}

/**
 * Linux does not support app.setAsDefaultProtocolClient(). Debian/RPM packages
 * declare the scheme in their installed .desktop file, while portable AppImages
 * must write a user-level desktop entry and update the MIME association.
 */
export async function registerTeamWorkProtocol(logger: AppLogger): Promise<void> {
  if (process.platform !== 'linux') {
    if (app.isPackaged) app.setAsDefaultProtocolClient('teamwork')
    return
  }

  if (!app.isPackaged) {
    logger.debug('Skipping teamwork:// registration in development mode')
    return
  }

  const appImage = process.env.APPIMAGE?.trim()
  if (!appImage) {
    // deb/rpm already installed teamwork.desktop; make sure the user-level MIME
    // association points at it. Portable unpacked builds have no desktop file.
    if (!findInstalledDesktopFile()) {
      logger.debug('teamwork.desktop is not installed; skipping protocol registration')
      return
    }
    await ensureTeamWorkHandler(logger)
    return
  }

  const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share')
  const applicationsDir = join(dataHome, 'applications')
  const iconDir = join(dataHome, 'icons', 'hicolor', '512x512', 'apps')
  const desktopPath = join(applicationsDir, 'teamwork.desktop')
  const iconPath = join(iconDir, 'teamwork.png')
  const sourceIcon = join(process.resourcesPath, 'icon.png')

  try {
    await mkdir(applicationsDir, { recursive: true, mode: 0o755 })
    await mkdir(iconDir, { recursive: true, mode: 0o755 })

    let iconName = 'application-x-executable'
    if (existsSync(sourceIcon)) {
      await copyFile(sourceIcon, iconPath)
      iconName = 'teamwork'
    }

    const desktopEntry = buildAppImageDesktopEntry(appImage, iconName)
    let changed = true
    if (existsSync(desktopPath)) {
      changed = (await readFile(desktopPath, 'utf8')) !== desktopEntry
    }
    if (changed) {
      await writeFile(desktopPath, desktopEntry, { mode: 0o644 })
      logger.info(`Registered teamwork:// handler at ${desktopPath}`)
    }

    if (changed) {
      const update = await run('update-desktop-database', [applicationsDir])
      if (update.error) {
        logger.debug('update-desktop-database was not available', update.error)
      }
    }

    await ensureTeamWorkHandler(logger)
  } catch (error) {
    logger.warn('Could not register the teamwork:// protocol handler', error)
  }
}

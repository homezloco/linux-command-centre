import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import './env'
import { registerIpcHandlers } from './ipc'
import { startStreamServer } from './stream-server'

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')
}

const EXTERNAL_URL_SCHEMES = new Set(['https:', 'http:', 'mailto:'])

/** Hands a URL to the OS's default handler, but only for schemes that make
 * sense to open externally — never file:/javascript:/data: etc. */
function openExternalIfAllowed(url: string): void {
  try {
    if (EXTERNAL_URL_SCHEMES.has(new URL(url).protocol)) {
      shell.openExternal(url)
    }
  } catch {
    // not a parseable URL — ignore
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f12',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f0f12',
      symbolColor: '#a1a1aa',
      height: 40
    },
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url)
    return { action: 'deny' }
  })

  // The app never needs to navigate its own window away from the renderer
  // it loaded (dev server URL, or the packaged index.html) — anything else
  // is handed to the OS's default handler instead of being loaded in-app.
  const devServerUrl = is.dev ? process.env.ELECTRON_RENDERER_URL : undefined
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      openExternalIfAllowed(url)
    }
  })

  if (devServerUrl) {
    win.loadURL(devServerUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('io.lcc.app')
  nativeTheme.themeSource = 'dark'

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  await registerIpcHandlers()
  startStreamServer()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

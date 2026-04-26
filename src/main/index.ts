import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { ShortcutManager } from './ShortcutManager'
import { loadData, saveData } from './StorageManager'
import type { AppData } from '../types'

let shortcutManager: ShortcutManager | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#1a1a2e',
    icon: join(app.getAppPath(), 'icon/NoiseRide_icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    titleBarStyle: 'hiddenInset',
    show: false
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'I' && input.control && input.shift) {
      win.webContents.toggleDevTools()
    }
  })

  // Intercept file drag & drop: Electron tries to navigate to the file:// URL.
  // We prevent navigation and instead send the file path(s) to the renderer via IPC.
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    if (url.startsWith('file:///') && url.toLowerCase().endsWith('.mp3')) {
      // file:///C:/Users/foo/bar.mp3  →  C:/Users/foo/bar.mp3
      const filePath = decodeURIComponent(url.slice('file:///'.length))
      win.webContents.send('file:dropped', [filePath])
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  shortcutManager = new ShortcutManager(win)
  return win
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shortcutManager?.destroy()
  if (process.platform !== 'darwin') app.quit()
})

// ── Storage IPC ──────────────────────────────────────────────
ipcMain.handle('storage:load', (): AppData => loadData())

ipcMain.handle('storage:save', (_e, data: AppData): void => saveData(data))

// ── Shortcut IPC ─────────────────────────────────────────────
ipcMain.handle('shortcut:sync', (_e, keybindMap: Record<string, string[]>): void => {
  shortcutManager?.syncKeybinds(keybindMap)
})

ipcMain.handle('shortcut:register', (_e, key: string, mp3Ids: string[]): boolean => {
  return shortcutManager?.register(key, mp3Ids) ?? false
})

ipcMain.handle('shortcut:unregister', (_e, key: string): void => {
  shortcutManager?.unregister(key)
})

// ── PTK IPC ──────────────────────────────────────────────────
ipcMain.handle('ptk:setKey', (_e, accelerator: string): void => {
  shortcutManager?.setPtkKey(accelerator)
})

// ── Random controls IPC ──────────────────────────────────────
ipcMain.handle('random:setPrevKey', (_e, acc: string): void => {
  shortcutManager?.setRandomKey('prev', acc)
})
ipcMain.handle('random:setNextKey', (_e, acc: string): void => {
  shortcutManager?.setRandomKey('next', acc)
})
ipcMain.handle('random:setStopKey', (_e, acc: string): void => {
  shortcutManager?.setRandomKey('stop', acc)
})

// ── File Buffer IPC ──────────────────────────────────────────
ipcMain.handle('file:readBuffer', (_e, filePath: string): Buffer => {
  return readFileSync(filePath)
})

// ── File Dialog IPC ──────────────────────────────────────────
ipcMain.handle('dialog:openMp3', async (): Promise<string[]> => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return []
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'MP3', extensions: ['mp3'] }]
  })
  return result.canceled ? [] : result.filePaths
})

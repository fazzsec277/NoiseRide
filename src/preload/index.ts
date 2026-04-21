import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppData } from '../types'

// ── File drag & drop handled in preload (Node.js / isolated context) ──────
// The preload has guaranteed access to File.path (Electron's Node.js binding).
// By handling dragover here, we can call preventDefault() to allow the drop
// while keeping f.path accessible — something the renderer main world cannot
// reliably do across all Electron versions.

type FileDropCallback = (paths: string[]) => void
const fileDropCallbacks: FileDropCallback[] = []

document.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})

document.addEventListener('drop', (e) => {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = webUtils.getPathForFile(f)
    if (f.name.toLowerCase().endsWith('.mp3') && p && p.length > 0) {
      paths.push(p)
    }
  }

  if (paths.length > 0) {
    fileDropCallbacks.forEach((cb) => cb(paths))
  }
})

// ── API exposed to renderer ────────────────────────────────────────────────
const api = {
  storage: {
    load: (): Promise<AppData> => ipcRenderer.invoke('storage:load'),
    save: (data: AppData): Promise<void> => ipcRenderer.invoke('storage:save', data)
  },
  shortcut: {
    sync: (keybindMap: Record<string, string[]>): Promise<void> =>
      ipcRenderer.invoke('shortcut:sync', keybindMap),
    register: (key: string, mp3Ids: string[]): Promise<boolean> =>
      ipcRenderer.invoke('shortcut:register', key, mp3Ids),
    unregister: (key: string): Promise<void> => ipcRenderer.invoke('shortcut:unregister', key),
    onTriggered: (cb: (key: string) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, { key }: { key: string }): void => cb(key)
      ipcRenderer.on('shortcut:triggered', handler)
      return () => ipcRenderer.off('shortcut:triggered', handler)
    }
  },
  dialog: {
    openMp3: (): Promise<string[]> => ipcRenderer.invoke('dialog:openMp3')
  },
  readFileBuffer: (filePath: string): Promise<Uint8Array> =>
    ipcRenderer.invoke('file:readBuffer', filePath),
  onFileDropped: (cb: FileDropCallback): (() => void) => {
    // Primary path: preload drop listener (f.path available in Node.js context)
    fileDropCallbacks.push(cb)

    // Fallback path: main process will-navigate interception (single file via IPC)
    const ipcHandler = (_: Electron.IpcRendererEvent, paths: string[]): void => cb(paths)
    ipcRenderer.on('file:dropped', ipcHandler)

    return () => {
      const idx = fileDropCallbacks.indexOf(cb)
      if (idx >= 0) fileDropCallbacks.splice(idx, 1)
      ipcRenderer.off('file:dropped', ipcHandler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

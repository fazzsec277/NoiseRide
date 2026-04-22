import { BrowserWindow } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'

// Maps our accelerator format strings to uiohook keycodes.
// uiohook uses X11 scan codes (cross-platform via libuiohook).
const ACCEL_TO_KEYCODE: Record<string, number> = {
  // Letters A-Z
  A: 30, B: 48, C: 46, D: 32, E: 18, F: 33, G: 34, H: 35, I: 23, J: 36,
  K: 37, L: 38, M: 50, N: 49, O: 24, P: 25, Q: 16, R: 19, S: 31, T: 20,
  U: 22, V: 47, W: 17, X: 45, Y: 21, Z: 44,
  // Digits 0-9
  '0': 11, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10,
  // Function keys F1-F12
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  // Numpad
  num0: UiohookKey.Numpad0,
  num1: UiohookKey.Numpad1,
  num2: UiohookKey.Numpad2,
  num3: UiohookKey.Numpad3,
  num4: UiohookKey.Numpad4,
  num5: UiohookKey.Numpad5,
  num6: UiohookKey.Numpad6,
  num7: UiohookKey.Numpad7,
  num8: UiohookKey.Numpad8,
  num9: UiohookKey.Numpad9,
  numdec: UiohookKey.NumpadDecimal,
  numadd: UiohookKey.NumpadAdd,
  numsub: UiohookKey.NumpadSubtract,
  nummult: UiohookKey.NumpadMultiply,
  numdiv: UiohookKey.NumpadDivide,
  // Special keys
  Space: UiohookKey.Space,
  Return: UiohookKey.Enter,
  Backspace: UiohookKey.Backspace,
  Delete: UiohookKey.Delete,
  Escape: UiohookKey.Escape,
  Tab: UiohookKey.Tab,
  // Arrow keys
  Up: UiohookKey.ArrowUp,
  Down: UiohookKey.ArrowDown,
  Left: UiohookKey.ArrowLeft,
  Right: UiohookKey.ArrowRight,
  // Navigation
  Home: UiohookKey.Home,
  End: UiohookKey.End,
  PageUp: UiohookKey.PageUp,
  PageDown: UiohookKey.PageDown,
  Insert: UiohookKey.Insert,
  // Punctuation
  '-': UiohookKey.Minus,
  '=': UiohookKey.Equal,
  '[': UiohookKey.BracketLeft,
  ']': UiohookKey.BracketRight,
  '\\': UiohookKey.Backslash,
  ';': UiohookKey.Semicolon,
  "'": UiohookKey.Quote,
  ',': UiohookKey.Comma,
  '.': UiohookKey.Period,
  '/': UiohookKey.Slash,
  '`': UiohookKey.Backquote,
}

interface KeySpec {
  keycode: number
  ctrl: boolean
  alt: boolean
  shift: boolean
}

function acceleratorToSpec(accelerator: string): KeySpec | null {
  const parts = accelerator.split('+')
  const ctrl = parts.includes('Ctrl')
  const alt = parts.includes('Alt')
  const shift = parts.includes('Shift')
  const keyPart = parts[parts.length - 1]
  const keycode = ACCEL_TO_KEYCODE[keyPart]
  if (keycode === undefined) return null
  return { keycode, ctrl, alt, shift }
}

export class ShortcutManager {
  private win: BrowserWindow
  private shortcuts = new Map<string, string[]>()
  private ptkKeycode: number | null = null

  constructor(win: BrowserWindow) {
    this.win = win

    uIOhook.on('keydown', (e) => {
      // When app window is focused, the renderer's keydown listener handles
      // shortcuts so keys reach focused text inputs normally.
      if (this.win.isDestroyed() || this.win.isFocused()) return

      for (const [accelerator] of this.shortcuts) {
        const spec = acceleratorToSpec(accelerator)
        if (!spec) continue
        if (
          e.keycode === spec.keycode &&
          !!e.ctrlKey === spec.ctrl &&
          !!e.altKey === spec.alt &&
          !!e.shiftKey === spec.shift
        ) {
          this.win.webContents.send('shortcut:triggered', { key: accelerator })
        }
      }

      if (this.ptkKeycode !== null && e.keycode === this.ptkKeycode) {
        this.win.webContents.send('ptk:keydown')
      }
    })

    uIOhook.on('keyup', (e) => {
      if (this.win.isDestroyed() || this.win.isFocused()) return
      if (this.ptkKeycode !== null && e.keycode === this.ptkKeycode) {
        this.win.webContents.send('ptk:keyup')
      }
    })

    uIOhook.start()
  }

  setPtkKey(accelerator: string): void {
    const spec = acceleratorToSpec(accelerator)
    this.ptkKeycode = spec ? spec.keycode : null
  }

  syncKeybinds(keybindMap: Record<string, string[]>): void {
    this.shortcuts.clear()
    for (const [key, ids] of Object.entries(keybindMap)) {
      if (ids.length > 0) this.shortcuts.set(key, ids)
    }
  }

  register(key: string, mp3Ids: string[]): boolean {
    const spec = acceleratorToSpec(key)
    if (!spec) return false
    this.shortcuts.set(key, mp3Ids)
    return true
  }

  unregister(key: string): void {
    this.shortcuts.delete(key)
  }

  unregisterAll(): void {
    this.shortcuts.clear()
  }

  destroy(): void {
    uIOhook.stop()
  }
}

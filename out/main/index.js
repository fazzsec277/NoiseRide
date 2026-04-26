"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const uiohookNapi = require("uiohook-napi");
const ACCEL_TO_KEYCODE = {
  // Letters A-Z
  A: 30,
  B: 48,
  C: 46,
  D: 32,
  E: 18,
  F: 33,
  G: 34,
  H: 35,
  I: 23,
  J: 36,
  K: 37,
  L: 38,
  M: 50,
  N: 49,
  O: 24,
  P: 25,
  Q: 16,
  R: 19,
  S: 31,
  T: 20,
  U: 22,
  V: 47,
  W: 17,
  X: 45,
  Y: 21,
  Z: 44,
  // Digits 0-9
  "0": 11,
  "1": 2,
  "2": 3,
  "3": 4,
  "4": 5,
  "5": 6,
  "6": 7,
  "7": 8,
  "8": 9,
  "9": 10,
  // Function keys F1-F12
  F1: 59,
  F2: 60,
  F3: 61,
  F4: 62,
  F5: 63,
  F6: 64,
  F7: 65,
  F8: 66,
  F9: 67,
  F10: 68,
  F11: 87,
  F12: 88,
  // Numpad
  num0: uiohookNapi.UiohookKey.Numpad0,
  num1: uiohookNapi.UiohookKey.Numpad1,
  num2: uiohookNapi.UiohookKey.Numpad2,
  num3: uiohookNapi.UiohookKey.Numpad3,
  num4: uiohookNapi.UiohookKey.Numpad4,
  num5: uiohookNapi.UiohookKey.Numpad5,
  num6: uiohookNapi.UiohookKey.Numpad6,
  num7: uiohookNapi.UiohookKey.Numpad7,
  num8: uiohookNapi.UiohookKey.Numpad8,
  num9: uiohookNapi.UiohookKey.Numpad9,
  numdec: uiohookNapi.UiohookKey.NumpadDecimal,
  numadd: uiohookNapi.UiohookKey.NumpadAdd,
  numsub: uiohookNapi.UiohookKey.NumpadSubtract,
  nummult: uiohookNapi.UiohookKey.NumpadMultiply,
  numdiv: uiohookNapi.UiohookKey.NumpadDivide,
  // Special keys
  Space: uiohookNapi.UiohookKey.Space,
  Return: uiohookNapi.UiohookKey.Enter,
  Backspace: uiohookNapi.UiohookKey.Backspace,
  Delete: uiohookNapi.UiohookKey.Delete,
  Escape: uiohookNapi.UiohookKey.Escape,
  Tab: uiohookNapi.UiohookKey.Tab,
  // Arrow keys
  Up: uiohookNapi.UiohookKey.ArrowUp,
  Down: uiohookNapi.UiohookKey.ArrowDown,
  Left: uiohookNapi.UiohookKey.ArrowLeft,
  Right: uiohookNapi.UiohookKey.ArrowRight,
  // Navigation
  Home: uiohookNapi.UiohookKey.Home,
  End: uiohookNapi.UiohookKey.End,
  PageUp: uiohookNapi.UiohookKey.PageUp,
  PageDown: uiohookNapi.UiohookKey.PageDown,
  Insert: uiohookNapi.UiohookKey.Insert,
  // Punctuation
  "-": uiohookNapi.UiohookKey.Minus,
  "=": uiohookNapi.UiohookKey.Equal,
  "[": uiohookNapi.UiohookKey.BracketLeft,
  "]": uiohookNapi.UiohookKey.BracketRight,
  "\\": uiohookNapi.UiohookKey.Backslash,
  ";": uiohookNapi.UiohookKey.Semicolon,
  "'": uiohookNapi.UiohookKey.Quote,
  ",": uiohookNapi.UiohookKey.Comma,
  ".": uiohookNapi.UiohookKey.Period,
  "/": uiohookNapi.UiohookKey.Slash,
  "`": uiohookNapi.UiohookKey.Backquote
};
function acceleratorToSpec(accelerator) {
  const parts = accelerator.split("+");
  const ctrl = parts.includes("Ctrl");
  const alt = parts.includes("Alt");
  const shift = parts.includes("Shift");
  const keyPart = parts[parts.length - 1];
  const keycode = ACCEL_TO_KEYCODE[keyPart];
  if (keycode === void 0) return null;
  return { keycode, ctrl, alt, shift };
}
class ShortcutManager {
  win;
  shortcuts = /* @__PURE__ */ new Map();
  ptkKeycode = null;
  randomPrevSpec = null;
  randomNextSpec = null;
  randomStopSpec = null;
  constructor(win) {
    this.win = win;
    uiohookNapi.uIOhook.on("keydown", (e) => {
      if (this.win.isDestroyed() || this.win.isFocused()) return;
      for (const [accelerator] of this.shortcuts) {
        const spec = acceleratorToSpec(accelerator);
        if (!spec) continue;
        if (e.keycode === spec.keycode && !!e.ctrlKey === spec.ctrl && !!e.altKey === spec.alt && !!e.shiftKey === spec.shift) {
          this.win.webContents.send("shortcut:triggered", { key: accelerator });
        }
      }
      if (this.ptkKeycode !== null && e.keycode === this.ptkKeycode) {
        this.win.webContents.send("ptk:keydown");
      }
      const matchSpec = (spec) => spec !== null && e.keycode === spec.keycode && !!e.ctrlKey === spec.ctrl && !!e.altKey === spec.alt && !!e.shiftKey === spec.shift;
      if (matchSpec(this.randomPrevSpec)) this.win.webContents.send("random:prev");
      if (matchSpec(this.randomNextSpec)) this.win.webContents.send("random:next");
      if (matchSpec(this.randomStopSpec)) this.win.webContents.send("random:stop");
    });
    uiohookNapi.uIOhook.on("keyup", (e) => {
      if (this.win.isDestroyed() || this.win.isFocused()) return;
      if (this.ptkKeycode !== null && e.keycode === this.ptkKeycode) {
        this.win.webContents.send("ptk:keyup");
      }
    });
    uiohookNapi.uIOhook.start();
  }
  setPtkKey(accelerator) {
    const spec = acceleratorToSpec(accelerator);
    this.ptkKeycode = spec ? spec.keycode : null;
  }
  setRandomKey(action, accelerator) {
    const spec = acceleratorToSpec(accelerator);
    if (action === "prev") this.randomPrevSpec = spec;
    else if (action === "next") this.randomNextSpec = spec;
    else this.randomStopSpec = spec;
  }
  syncKeybinds(keybindMap) {
    this.shortcuts.clear();
    for (const [key, ids] of Object.entries(keybindMap)) {
      if (ids.length > 0) this.shortcuts.set(key, ids);
    }
  }
  register(key, mp3Ids) {
    const spec = acceleratorToSpec(key);
    if (!spec) return false;
    this.shortcuts.set(key, mp3Ids);
    return true;
  }
  unregister(key) {
    this.shortcuts.delete(key);
  }
  unregisterAll() {
    this.shortcuts.clear();
  }
  destroy() {
    uiohookNapi.uIOhook.stop();
  }
}
const DEFAULT_SETTINGS = {
  maxConcurrent: 10,
  masterVolume: 0.8,
  theme: "dark",
  outputDeviceIds: [],
  micDeviceId: "",
  micInputGain: 1,
  micMuted: false,
  micPitchSemitones: 0,
  micFormantSemitones: 0,
  micEqLow: 0,
  micEqMid: 0,
  micEqHigh: 0,
  micCompressorEnabled: false,
  micCompressorThreshold: -24,
  micCompressorRatio: 12,
  micCompressorAttack: 3,
  micCompressorRelease: 100,
  micEchoEnabled: false,
  micEchoDelay: 200,
  micEchoFeedback: 40,
  micEchoMix: 50,
  micRadioEnabled: false,
  micReverbEnabled: false,
  micReverbDuration: 1.5,
  micReverbDecay: 2,
  micReverbMix: 40,
  micRobotEnabled: false,
  micRobotFrequency: 100,
  micDistortionEnabled: false,
  micDistortionDrive: 50,
  micDistortionMix: 80,
  micDistortionTone: 70,
  micPushToKey: false,
  micPushToKeyBind: "",
  randomPrevBind: "",
  randomNextBind: "",
  randomStopBind: "",
  keybindEnabled: true
};
const GLOBAL_PRESET_ID = "global";
function getDataFile() {
  return path.join(electron.app.getPath("userData"), "data.json");
}
const defaultData = () => ({
  mp3s: [],
  presets: [{ id: GLOBAL_PRESET_ID, name: "全体", mp3Ids: [] }],
  settings: { ...DEFAULT_SETTINGS }
});
function loadData() {
  const DATA_FILE = getDataFile();
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultData();
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.presets?.find((p) => p.id === GLOBAL_PRESET_ID)) {
      parsed.presets = [{ id: GLOBAL_PRESET_ID, name: "全体", mp3Ids: [] }, ...parsed.presets];
    }
    const s = parsed.settings;
    if (!Array.isArray(s.outputDeviceIds)) {
      const legacy = s.outputDeviceId;
      s.outputDeviceIds = legacy ? [legacy] : [];
      delete s.outputDeviceId;
    }
    return parsed;
  } catch {
    return defaultData();
  }
}
function saveData(data) {
  fs.writeFileSync(getDataFile(), JSON.stringify(data, null, 2), "utf-8");
}
electron.app.setName("NoiseRide");
electron.app.setAppUserModelId("com.noiseride.app");
let shortcutManager = null;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: "NoiseRide",
    backgroundColor: "#1a1a2e",
    icon: path.join(electron.app.getAppPath(), "icon/NoiseRide_icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    titleBarStyle: "hiddenInset",
    show: false
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "I" && input.control && input.shift) {
      win.webContents.toggleDevTools();
    }
  });
  win.webContents.on("will-navigate", (e, url) => {
    e.preventDefault();
    if (url.startsWith("file:///") && url.toLowerCase().endsWith(".mp3")) {
      const filePath = decodeURIComponent(url.slice("file:///".length));
      win.webContents.send("file:dropped", [filePath]);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  shortcutManager = new ShortcutManager(win);
  return win;
}
electron.app.whenReady().then(() => {
  electron.Menu.setApplicationMenu(null);
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  shortcutManager?.destroy();
  if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("storage:load", () => loadData());
electron.ipcMain.handle("storage:save", (_e, data) => saveData(data));
electron.ipcMain.handle("shortcut:sync", (_e, keybindMap) => {
  shortcutManager?.syncKeybinds(keybindMap);
});
electron.ipcMain.handle("shortcut:register", (_e, key, mp3Ids) => {
  return shortcutManager?.register(key, mp3Ids) ?? false;
});
electron.ipcMain.handle("shortcut:unregister", (_e, key) => {
  shortcutManager?.unregister(key);
});
electron.ipcMain.handle("ptk:setKey", (_e, accelerator) => {
  shortcutManager?.setPtkKey(accelerator);
});
electron.ipcMain.handle("random:setPrevKey", (_e, acc) => {
  shortcutManager?.setRandomKey("prev", acc);
});
electron.ipcMain.handle("random:setNextKey", (_e, acc) => {
  shortcutManager?.setRandomKey("next", acc);
});
electron.ipcMain.handle("random:setStopKey", (_e, acc) => {
  shortcutManager?.setRandomKey("stop", acc);
});
electron.ipcMain.handle("file:readBuffer", (_e, filePath) => {
  return fs.readFileSync(filePath);
});
electron.ipcMain.handle("dialog:openMp3", async () => {
  const win = electron.BrowserWindow.getFocusedWindow();
  if (!win) return [];
  const result = await electron.dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "MP3", extensions: ["mp3"] }]
  });
  return result.canceled ? [] : result.filePaths;
});

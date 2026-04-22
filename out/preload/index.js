"use strict";
const electron = require("electron");
const fileDropCallbacks = [];
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  const paths = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const p = electron.webUtils.getPathForFile(f);
    if (f.name.toLowerCase().endsWith(".mp3") && p && p.length > 0) {
      paths.push(p);
    }
  }
  if (paths.length > 0) {
    fileDropCallbacks.forEach((cb) => cb(paths));
  }
});
const api = {
  storage: {
    load: () => electron.ipcRenderer.invoke("storage:load"),
    save: (data) => electron.ipcRenderer.invoke("storage:save", data)
  },
  shortcut: {
    sync: (keybindMap) => electron.ipcRenderer.invoke("shortcut:sync", keybindMap),
    register: (key, mp3Ids) => electron.ipcRenderer.invoke("shortcut:register", key, mp3Ids),
    unregister: (key) => electron.ipcRenderer.invoke("shortcut:unregister", key),
    onTriggered: (cb) => {
      const handler = (_, { key }) => cb(key);
      electron.ipcRenderer.on("shortcut:triggered", handler);
      return () => electron.ipcRenderer.off("shortcut:triggered", handler);
    }
  },
  ptk: {
    onKeyDown: (cb) => {
      const h = () => cb();
      electron.ipcRenderer.on("ptk:keydown", h);
      return () => electron.ipcRenderer.off("ptk:keydown", h);
    },
    onKeyUp: (cb) => {
      const h = () => cb();
      electron.ipcRenderer.on("ptk:keyup", h);
      return () => electron.ipcRenderer.off("ptk:keyup", h);
    },
    setKey: (accelerator) => electron.ipcRenderer.invoke("ptk:setKey", accelerator)
  },
  dialog: {
    openMp3: () => electron.ipcRenderer.invoke("dialog:openMp3")
  },
  readFileBuffer: (filePath) => electron.ipcRenderer.invoke("file:readBuffer", filePath),
  onFileDropped: (cb) => {
    fileDropCallbacks.push(cb);
    const ipcHandler = (_, paths) => cb(paths);
    electron.ipcRenderer.on("file:dropped", ipcHandler);
    return () => {
      const idx = fileDropCallbacks.indexOf(cb);
      if (idx >= 0) fileDropCallbacks.splice(idx, 1);
      electron.ipcRenderer.off("file:dropped", ipcHandler);
    };
  }
};
electron.contextBridge.exposeInMainWorld("api", api);

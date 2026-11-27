import { contextBridge, ipcRenderer } from "electron"

const isPortable = process.argv.includes("--docforge-portable=1")

contextBridge.exposeInMainWorld("docforgeDesktop", {
  isDesktop: true,
  platform: process.platform,
  isPortable,
  saveDocxAs: (docUrl: string, suggestedName: string) =>
    ipcRenderer.invoke("docforge:save-docx-as", docUrl, suggestedName),
  openDocInApp: (docUrl: string, suggestedName: string) =>
    ipcRenderer.invoke("docforge:open-doc-in-app", docUrl, suggestedName),
  revealDocInFolder: (docUrl: string, suggestedName: string) =>
    ipcRenderer.invoke("docforge:reveal-doc-in-folder", docUrl, suggestedName),
  openDataDir: () => ipcRenderer.invoke("docforge:open-data-dir"),
  pickExecutable: (title: string) => ipcRenderer.invoke("docforge:pick-executable", title),
  openExternal: (url: string) => ipcRenderer.invoke("docforge:open-external", url),
  onMenuAction: (cb: (action: string) => void) => {
    const listener = (_ev: Electron.IpcRendererEvent, action: string) => cb(action)
    ipcRenderer.on("docforge:menu-action", listener)
    return () => ipcRenderer.removeListener("docforge:menu-action", listener)
  },
})

import { contextBridge, ipcRenderer } from "electron";
import { Settings } from "./services/config";
import { PlayStatus } from "./services/launch/monitor";

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld("ipcRenderer", {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args;
        return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, ...omit] = args;
        return ipcRenderer.off(channel, ...omit);
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args;
        return ipcRenderer.send(channel, ...omit);
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args;
        return ipcRenderer.invoke(channel, ...omit);
    }
});

export const api = {
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke("select-directory"),
    launchNcm: (path: string) => ipcRenderer.invoke("launch-ncm", path),
    onStatusChange: (cb: (status: boolean) => void) => {
        ipcRenderer.on("ncm-status", (_, status) => cb(status));
    },
    stopNcm: () => ipcRenderer.invoke("stop-ncm"),
    playState: (cb: (state: PlayStatus) => void) => {
        ipcRenderer.on("ncm-play-state", (_, status) => cb(status));
    },
    getSettings: () => ipcRenderer.invoke("get-settings"),
    saveSettings: (settings: Settings) => ipcRenderer.invoke("save-settings", settings),
    // OSC 控制
    startOsc: () => ipcRenderer.invoke("start-osc"),
    stopOsc: () => ipcRenderer.invoke("stop-osc"),
    onOscOutput: (cb: (data: string) => void) => {
        ipcRenderer.on("osc-output", (_, data) => cb(data));
    }
};

contextBridge.exposeInMainWorld("api", api);

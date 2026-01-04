import { BrowserWindow, ipcMain } from "electron";
import { configManager, Settings } from "./services/config";
import { selectDirectory } from "./services/dialog";
import {
    closeChildProcess,
    getMonitor,
    launchWithArgs,
    startOSCMonitoring,
    stopOSCMonitoring
} from "./services/launch";

export function registerIpc(win: BrowserWindow) {
    ipcMain.handle("select-directory", async () => {
        return await selectDirectory(win);
    });

    ipcMain.handle("launch-ncm", async (_, path: string) => {
        await launchWithArgs(path, win);
    });

    ipcMain.handle("stop-ncm", async () => {
        closeChildProcess();
    });

    ipcMain.handle("get-settings", () => {
        return configManager.get();
    });

    ipcMain.handle("save-settings", (_, settings: Partial<Settings>) => {
        configManager.save(settings);
        return configManager.get();
    });

    ipcMain.handle("start-osc", async () => {
        const monitor = getMonitor();
        if (!monitor) {
            return { success: false, error: "Monitor not initialized" };
        }
        const success = await startOSCMonitoring(win);
        return { success };
    });

    ipcMain.handle("stop-osc", async () => {
        stopOSCMonitoring();
        return { success: true };
    });
}

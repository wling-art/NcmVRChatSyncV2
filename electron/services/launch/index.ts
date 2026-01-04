import { ChildProcess, spawn } from "child_process";
import { BrowserWindow } from "electron";
import net from "net";
import os from "os";
import path from "path";
import { configManager } from "../config";
import { OSCService } from "../osc";
import { NeteasePlayMonitor } from "./monitor";

let childProcess: ChildProcess | null = null;
let monitor: NeteasePlayMonitor | null = null;
let oscMonitorInterval: NodeJS.Timeout | null = null;
let oscService: OSCService | null = null;

function checkPort(port: number, timeout = 300) {
    return new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);

        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });

        socket.once("error", () => resolve(false));
        socket.once("timeout", () => resolve(false));

        socket.connect(port, "127.0.0.1");
    });
}

async function findAvailablePort(startPort = 9000) {
    while (true) {
        const port = startPort + Math.floor(Math.random() * 10000);
        const isOpen = await checkPort(port, 100);
        if (!isOpen) {
            return port;
        }
    }
}

async function startNeteasePlayMonitoring(win: BrowserWindow, port: number) {
    monitor = new NeteasePlayMonitor(win, port);
    try {
        await monitor.connect();
        await monitor.attachToOrpheusPage();
        await monitor.startMonitoring(500);
        console.log("[Launch] Play monitoring started");
    } catch (error) {
        console.error("[Launch] Error starting monitoring:", error);
        monitor?.disconnect();
        monitor = null;
    }
}

/**
 * 启动 OSC 监控循环，类似 Python 中的 osc_thread
 * 由前端通过 IPC 控制
 */
export async function startOSCMonitoring(win: BrowserWindow) {
    if (!monitor) {
        console.error("[OSC] Monitor not initialized");
        return false;
    }

    stopOSCMonitoring();

    try {
        // init
        const settings = configManager.get();
        oscService = new OSCService(settings.osc.ip, settings.osc.port);
        console.log("[OSC] Service initialized");

        const currentMonitor = monitor; // monitor 引用
        oscMonitorInterval = setInterval(async () => {
            try {
                const playStatus = await currentMonitor.getPlayStatus();

                if (!playStatus.songInfo && playStatus.playId) {
                    const songInfo = await currentMonitor.fetchSongDetail(playStatus.playId);
                    if (songInfo) {
                        playStatus.songInfo = songInfo;
                    }
                }

                const lyrics = playStatus.songInfo?.lyrics || [];
                // OSC
                const result = await oscService?.updatePlayStatus(playStatus, lyrics);
                if (result) {
                    win.webContents.send("osc-output", result);
                }
            } catch (error) {
                console.error("[OSC] Monitoring error:", error);
            }
        }, 300);

        return true;
    } catch (error) {
        console.error("[OSC] Failed to start monitoring:", error);
        return false;
    }
}

/**
 * 停止 OSC 监控循环
 */
export function stopOSCMonitoring() {
    if (oscMonitorInterval) {
        clearInterval(oscMonitorInterval);
        oscMonitorInterval = null;
        console.log("[OSC] Monitoring stopped");
    }
    oscService?.destroy();
    oscService = null;
}

export async function launchWithArgs(appPath: string, win: BrowserWindow) {
    const isMac = os.platform() === "darwin";
    const spawnCmd = isMac ? path.join(appPath, "Contents", "MacOS", "NeteaseMusic") : appPath;

    // Find an available port
    const port = await findAvailablePort();
    const spawnArgs = [`--remote-debugging-port=${port}`];

    console.log(`[Launch] Platform: ${isMac ? "macOS" : "Other"}, CMD: ${spawnCmd}, Port: ${port}`);

    childProcess = spawn(spawnCmd, spawnArgs, {
        detached: false,
        stdio: "ignore"
    });

    childProcess.on("exit", () => {
        monitor?.disconnect();
        monitor = null;
        win.webContents.send("ncm-status", false);
    });

    await new Promise<void>((resolve) => {
        const checkInterval = setInterval(async () => {
            const isOpen = await checkPort(port);
            if (isOpen) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 500);
    });

    await startNeteasePlayMonitoring(win, port);
    win.webContents.send("ncm-status", true);
}

export function getMonitor() {
    return monitor;
}

export function closeChildProcess() {
    if (childProcess && !childProcess.killed) {
        try {
            childProcess.kill();
            console.log("[Launch] Child process closed");
        } catch (error) {
            console.error("[Launch] Failed to close child process:", error);
        }
    }

    if (monitor) {
        monitor.disconnect();
        monitor = null;
    }

    stopOSCMonitoring();
}

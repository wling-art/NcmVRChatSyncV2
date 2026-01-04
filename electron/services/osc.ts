import { Client } from "node-osc";
import { formatPlayTime, generateProgressBar, getLyricPair, replaceTemplateVariables } from "../../utils/format";
import { configManager, Settings } from "./config";
import { LyricLine, PlayStatus } from "./launch/monitor";

/**
 * 格式化输出文本
 */
function formatOutput(settings: Settings, playStatus: PlayStatus, lyrics: LyricLine[]): string {
    if (!playStatus.songInfo) {
        return "";
    }

    const current = playStatus.current || 0;
    const duration = playStatus.songInfo.duration || 1;

    const progressBar = generateProgressBar(current, duration, settings.bar);
    const timeStr = formatPlayTime(current, duration);
    const { current: lyric1, next: lyric2 } = getLyricPair(lyrics, current);
    const output = replaceTemplateVariables(settings.output.template, {
        song: playStatus.songInfo.title || "",
        artist: playStatus.songInfo.artist || "",
        bar: progressBar,
        time: timeStr,
        lyric1,
        lyric2
    });

    return output;
}

export class OSCService {
    private udpPort: Client | null = null;
    private lastOscTime = 0;
    private isConnected = false;

    constructor(
        private oscIp: string,
        private oscPort: number
    ) {
        try {
            this.udpPort = new Client(this.oscIp, this.oscPort);
            this.isConnected = true;
            console.log(`[OSC] Service initialized for ${oscIp}:${oscPort}`);
        } catch (error) {
            console.error("[OSC] Failed to initialize OSC service:", error);
            throw error;
        }
    }

    /**
     * 发送 OSC 消息
     */
    private async sendOscMessage(address: string, args: (string | boolean)[]): Promise<void> {
        if (!this.isConnected || !this.udpPort) {
            throw new Error("OSC service not connected");
        }

        try {
            this.udpPort.send({
                address,
                args
            });
        } catch (error) {
            console.error("[OSC] Failed to send message:", error);
            throw error;
        }
    }

    /**
     * 更新播放状态并发送 OSC 消息
     */
    async updatePlayStatus(playStatus: PlayStatus, lyrics: LyricLine[]): Promise<string | null> {
        if (!this.isConnected) {
            return null;
        }

        const settings = configManager.get();

        const now = Date.now() / 1000; // 秒
        const refreshInterval = settings.refresh.interval;

        if (now - this.lastOscTime < refreshInterval) {
            return null;
        }

        if (playStatus.songInfo) {
            const output = formatOutput(settings, playStatus, lyrics);
            try {
                await this.sendOscMessage("/chatbox/input", [output, true, false]);
                this.lastOscTime = now;

                return output;
            } catch (error) {
                console.error("[OSC] Failed to send message:", error);
                return null;
            }
        } else if (playStatus.songInfo) {
            return "暂无歌曲播放";
        }

        return null;
    }

    async destroy(): Promise<void> {
        if (this.udpPort && this.isConnected) {
            try {
                this.udpPort.close();
                this.isConnected = false;
                console.log("[OSC] Service closed");
            } catch (error) {
                console.error("[OSC] Failed to close service:", error);
            }
        }
    }
}

import { Settings } from "../electron/services/config";
import { LyricLine } from "../electron/services/launch/monitor";

/**
 * 获取指定时间的当前歌词
 * 使用反向遍历，效率更高
 */
export function getCurrentLyric(lyrics: LyricLine[], currentTime: number): LyricLine | null {
    if (lyrics.length === 0) return null;

    for (let i = lyrics.length - 1; i >= 0; i--) {
        const lyric = lyrics[i];
        if (lyric && currentTime >= lyric.time) {
            return lyric;
        }
    }
    return null;
}

/**
 * 获取当前歌词和下一句歌词
 */
export function getLyricPair(lyrics: LyricLine[], currentTime: number): { current: string; next: string } {
    let lyric1 = "";
    let lyric2 = "";

    if (lyrics.length > 0) {
        let currentIndex = -1;

        for (let i = 0; i < lyrics.length; i++) {
            if (lyrics[i].time <= currentTime) {
                currentIndex = i;
            } else {
                break;
            }
        }

        if (currentIndex >= 0) {
            lyric1 = lyrics[currentIndex].text;
            if (currentIndex + 1 < lyrics.length) {
                lyric2 = lyrics[currentIndex + 1].text;
            }
        }
    }

    return { current: lyric1, next: lyric2 };
}

/**
 * 生成进度条文本
 */
export function generateProgressBar(current: number, duration: number, barConfig: Settings["bar"]): string {
    if (duration <= 0) {
        return barConfig.thumb + barConfig.empty.repeat(Math.max(barConfig.width - 1, 0));
    }

    const progress = Math.min(current / duration, 1);
    const filledCount = Math.round(progress * barConfig.width);
    return (
        barConfig.filled.repeat(filledCount) +
        (filledCount < barConfig.width ? barConfig.thumb : "") +
        barConfig.empty.repeat(Math.max(barConfig.width - filledCount - 1, 0))
    );
}

export function formatTime(seconds: number | null | undefined): string {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 格式化时间显示 (mm:ss / total)
 */
export function formatPlayTime(current: number, duration: number): string {
    const currentSecs = formatTime(current);
    const totalSecs = formatTime(duration);

    return `${currentSecs} / ${totalSecs}`;
}

/**
 * 替换模板变量
 */
export function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`{${key}}`, "g"), value);
    }
    return result;
}

/**
 * 获取 OSC 消息参数类型
 */
export function getOSCArgType(value: any): string {
    if (typeof value === "string") return "s";
    if (typeof value === "boolean") return value ? "T" : "F";
    if (typeof value === "number") {
        return Number.isInteger(value) ? "i" : "f";
    }
    return "s";
}

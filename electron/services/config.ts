import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { writeFile } from "fs/promises";
import { merge } from "lodash-es";
import { join } from "path";
import { z } from "zod";

// 配置 schema 带默认值
const SettingsSchema = z.object({
    ncmPath: z.string().optional().default(""),
    osc: z
        .object({
            ip: z.ipv4(),
            port: z.number().int().min(1).max(65535)
        })
        .default({
            ip: "127.0.0.1",
            port: 9000
        }),
    refresh: z
        .object({
            interval: z.number().min(0.5).max(60)
        })
        .default({
            interval: 1.5
        }),
    bar: z
        .object({
            width: z.number().int().min(5).max(100),
            filled: z.string().length(1),
            thumb: z.string().length(1),
            empty: z.string().length(1)
        })
        .default({
            width: 9,
            filled: "▓",
            thumb: "◘",
            empty: "░"
        }),
    output: z
        .object({
            template: z.string().min(1).max(1000)
        })
        .default({
            template: "🎵 {song} - {artist}\n{bar} {time}\n{lyric1}\n{lyric2}"
        })
});

export type Settings = z.infer<typeof SettingsSchema>;

export class ConfigManager {
    private static instance: ConfigManager | null = null;
    private configDir: string;
    private configPath: string;
    private settings: Settings;

    private constructor() {
        console.log("[Config] Initializing ConfigManager");
        this.configDir = join(app.getPath("userData"), "config");
        this.configPath = join(this.configDir, "settings.json");

        if (!existsSync(this.configDir)) {
            mkdirSync(this.configDir, { recursive: true });
        }

        this.settings = this.load();
    }

    public static getInstance(): ConfigManager {
        if (this.instance === null) {
            this.instance = new ConfigManager();
        }
        return this.instance;
    }

    private load(): Settings {
        try {
            if (existsSync(this.configPath)) {
                const data = JSON.parse(readFileSync(this.configPath, "utf-8"));
                console.log("[Config] Loaded settings from file");
                return SettingsSchema.parse(data);
            }
        } catch (error) {
            console.error("[Config] Failed to load settings:", error);
        }

        console.log("[Config] Initializing with schema default values");
        const defaultSettings = SettingsSchema.parse({});

        try {
            writeFileSync(this.configPath, JSON.stringify(defaultSettings, null, 2), "utf-8");
            console.log("[Config] Created settings.json with defaults");
        } catch (error) {
            console.error("[Config] Failed to write default settings:", error);
        }

        return defaultSettings;
    }

    public async save(settings: Partial<Settings>): Promise<void> {
        try {
            // 合并
            const merged = merge(this.settings, settings);
            // 校验
            const validated = SettingsSchema.parse(merged);
            // 保存
            await writeFile(this.configPath, JSON.stringify(validated, null, 2), "utf-8");
            this.settings = validated;
            console.log("[Config] Settings saved successfully");
        } catch (error) {
            console.error("[Config] Failed to save settings:", error);
            throw error;
        }
    }

    public get(): Settings {
        return this.settings;
    }
}

export const configManager = ConfigManager.getInstance();

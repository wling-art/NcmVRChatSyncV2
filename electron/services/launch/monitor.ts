import { BrowserWindow } from "electron";
import WebSocket from "ws";
import { getCurrentLyric } from "../../../utils/format";

// 配置
const ENABLE_LYRICS_TRANSLATION = true; // 开关翻译歌词

const INJECT_SCRIPT = `
(function() {
  if (window.__NCM_MONITOR_INSTALLED__) return window.__NCM_PLAY_STATE__;

  window.__NCM_PLAY_STATE__ = {
    playId: null,
    current: null,
    cacheProgress: null,
    lastUpdate: null,
    state: null,
    isPlaying: false
  };

  try {
    const webpackRequire = window.webpackJsonp.push([[],{9999:function(e,t,r){e.exports=r}},[[9999]]]);
    const moduleCache = webpackRequire.c;

    // 动态查找关键对象
    let adapter = null;
    let reduxStore = null;

    for (const id in moduleCache) {
      if (adapter && reduxStore) break;
      const mod = moduleCache[id]?.exports;
      if (!mod) continue;
      if (!adapter && mod.Bridge?._Adapter?.registerCallMap) {
        adapter = mod.Bridge._Adapter;
        console.log('[NCM Monitor] Found adapter in module', id);
      }
      if (!reduxStore && mod.a?.app?._store?.getState) {
        reduxStore = mod.a.app._store;
        console.log('[NCM Monitor] Found Redux Store in module', id);
      }
    }

    if (!adapter?.registerCallMap) {
      console.error('[NCM Monitor] adapter not found');
      return null;
    }

    const appendCallback = (key, callback) => {
      const existing = adapter.registerCallMap[key];
      if (existing) {
        const callbacks = Array.isArray(existing) ? existing : [existing];
        adapter.registerCallMap[key] = [...callbacks, callback];
        return true;
      }
      return false;
    };

    const updateState = (playId, updates) => {
      window.__NCM_PLAY_STATE__.playId = String(playId);
      window.__NCM_PLAY_STATE__.lastUpdate = Date.now();
      Object.assign(window.__NCM_PLAY_STATE__, updates);
    };

    const maxRetries = 10;
    const callbacks = {
      'audioplayer.onPlayProgress': false,
      'audioplayer.onPlayState': false
    };
    let retries = 0;

    const registerCallbacks = () => {
      if (!callbacks['audioplayer.onPlayProgress']) {
        callbacks['audioplayer.onPlayProgress'] = appendCallback('audioplayer.onPlayProgress', (playId, current, cacheProgress) => {
          updateState(playId, { current: parseFloat(current), cacheProgress: parseFloat(cacheProgress) });
          console.log('[NCM Monitor] onPlayProgress', playId, current, cacheProgress);
        });
      }

      if (!callbacks['audioplayer.onPlayState']) {
        callbacks['audioplayer.onPlayState'] = appendCallback('audioplayer.onPlayState', (playId, _, state) => {
          updateState(playId, { state: parseInt(state), isPlaying: parseInt(state) === 1 });
          console.log('[NCM Monitor] onPlayState', playId, state);
        });
      }

      const allRegistered = Object.values(callbacks).every(v => v);
      if (!allRegistered) {
        if (retries < maxRetries) {
          retries++;
          console.log('[NCM Monitor] Retry ' + retries + '/' + maxRetries + ', waiting 1s...');
          setTimeout(registerCallbacks, 1000);
          return;
        }
        console.error('[NCM Monitor] Failed to register callbacks after ' + maxRetries + ' retries');
        return;
      }

      console.log('[NCM Monitor] Both callbacks registered successfully');

      // 初始化 Redux Store
      if (reduxStore) {
        window.__REDUX_STORE__ = reduxStore;
        const playing = reduxStore.getState()?.playing;
        if (playing?.resourceTrackId || playing?.playId) {
          const trackId = playing.resourceTrackId || playing.playId;
          updateState(trackId, {
            state: playing.playingState,
            isPlaying: playing.playingState === 1,
            current: playing.restoreResource?.current ?? null
          });
        }
      }

      console.log('[NCM Monitor] Injection successful');
    };

    registerCallbacks();

  } catch(e) {
    console.error('[NCM Monitor] Injection failed:', e.message);
    return null;
  }

  window.__NCM_MONITOR_INSTALLED__ = true;
  return window.__NCM_PLAY_STATE__;
})();
`;

export interface PlayStatus {
    playId: string | null;
    current: number | null;
    cacheProgress: number | null;
    lastUpdate: number | null;
    state: number | null; // 1=playing, 2=pause
    isPlaying: boolean;
    songInfo?: SongInfo;
}

export interface LyricLine {
    time: number;
    text: string;
    translatedText?: string;
}

export interface SongInfo {
    title: string;
    artist: string;
    duration: number;
    lyrics: LyricLine[];
}

export class NeteasePlayMonitor {
    private ws: WebSocket | null = null;
    private msgId = 1;
    private pending = new Map<number, { resolve: Function; reject: Function }>();
    private sessionId: string | null = null;
    private songCache = new Map<string, SongInfo>();
    private abortController = new AbortController();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private isManualDisconnect = false;
    private lyricRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/gm;

    constructor(
        private win: BrowserWindow,
        private ncm_port: number
    ) {}

    async connect(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const pages: { webSocketDebuggerUrl: string }[] = await (
                    await fetch(`http://127.0.0.1:${this.ncm_port}/json`)
                ).json();
                console.log("[Monitor] Found pages:", pages[0].webSocketDebuggerUrl);
                this.ws = new WebSocket(pages[0].webSocketDebuggerUrl);

                this.ws.onopen = () => {
                    console.log("[Monitor] Connected");
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error("[Monitor] WebSocket error:", error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log("[Monitor] WebSocket closed");
                    if (!this.isManualDisconnect && !this.abortController.signal.aborted) {
                        this.tryReconnect();
                    }
                };

                this.ws.onmessage = (event) => {
                    const msg = JSON.parse(event.data.toString());
                    if (msg.method === "Target.receivedMessageFromTarget") {
                        try {
                            const inner = JSON.parse(msg.params.message);
                            if (inner.id && this.pending.has(inner.id)) {
                                const { resolve, reject } = this.pending.get(inner.id)!;
                                this.pending.delete(inner.id);
                                inner.error ? reject(new Error(inner.error.message)) : resolve(inner.result);
                            }
                        } catch {}
                    } else if (msg.id && this.pending.has(msg.id) && !this.sessionId) {
                        const { resolve, reject } = this.pending.get(msg.id)!;
                        this.pending.delete(msg.id);
                        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
                    }
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    private async tryReconnect(): Promise<void> {
        if (this.isManualDisconnect || this.abortController.signal.aborted) {
            return;
        }

        while (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = 1000 * Math.pow(2, this.reconnectAttempts - 1);
            console.log(
                `[Monitor] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}, delay ${delay}ms)`
            );

            await new Promise((resolve) => setTimeout(resolve, delay));

            try {
                await this.connect();
                await this.attachToOrpheusPage();
                console.log("[Monitor] Reconnected successfully");
                return;
            } catch (error) {
                console.error("[Monitor] Reconnection failed:", error);
            }
        }
        console.error(`[Monitor] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
    }

    private send(method: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.ws) return reject(new Error("Not connected"));
            const id = this.msgId++;
            this.pending.set(id, { resolve, reject });
            const msg = this.sessionId
                ? {
                      id,
                      method: "Target.sendMessageToTarget",
                      params: {
                          sessionId: this.sessionId,
                          message: JSON.stringify({ id, method, params })
                      }
                  }
                : { id, method, params };
            this.ws.send(JSON.stringify(msg));
        });
    }

    private async evaluateScript<T = any>(expression: string, returnByValue = true): Promise<T | null> {
        const result = await this.send("Runtime.evaluate", {
            expression,
            returnByValue
        });
        return result?.result?.value || null;
    }

    async attachToOrpheusPage(): Promise<void> {
        const { targetInfos } = await this.send("Target.getTargets");
        const page = targetInfos.find((t: any) => t.type === "page" && t.url.includes("orpheus"));
        if (!page) throw new Error("Orpheus page not found");
        console.log("[Monitor] Found:", page.url);
        const { sessionId } = await this.send("Target.attachToTarget", {
            targetId: page.targetId,
            flatten: false
        });
        this.sessionId = sessionId;
    }

    private parseLyric(lyricStr: string, translatedStr?: string): LyricLine[] {
        const lines: LyricLine[] = [];
        const translatedLines = new Map<number, string>();

        // 翻译
        if (translatedStr) {
            this.lyricRegex.lastIndex = 0;
            let match;
            while ((match = this.lyricRegex.exec(translatedStr)) !== null) {
                const minutes = parseInt(match[1]!);
                const seconds = parseInt(match[2]!);
                const milliseconds = parseInt(match[3]!.padEnd(3, "0"));
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = match[4]!.trim();
                if (text) {
                    translatedLines.set(Math.round(time * 1000), text);
                }
            }
        }

        // 原文
        this.lyricRegex.lastIndex = 0;
        let match;
        while ((match = this.lyricRegex.exec(lyricStr)) !== null) {
            const minutes = parseInt(match[1]!);
            const seconds = parseInt(match[2]!);
            const milliseconds = parseInt(match[3]!.padEnd(3, "0"));
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = match[4]!.trim();
            if (text) {
                const timeKey = Math.round(time * 1000);
                lines.push({
                    time,
                    text,
                    translatedText: translatedLines.get(timeKey)
                });
            }
        }
        return lines.sort((a, b) => a.time - b.time);
    }

    private async fetchAPI(url: string): Promise<any> {
        try {
            const res = await fetch(url, { credentials: "include" });
            return await res.json();
        } catch (e) {
            return { error: (e as Error).message };
        }
    }

    async fetchLyrics(playId: string): Promise<LyricLine[]> {
        await this.triggerLyricFetch(playId);

        // Redux Store
        const reduxLyrics = await this.fetchLyricsFromRedux();
        if (reduxLyrics && reduxLyrics.length > 0) {
            console.log("[Lyrics] From Redux Store:", reduxLyrics.length, "lines");
            return reduxLyrics;
        }

        // fallback
        console.log("[Lyrics] Fallback to API");
        const data = await this.fetchAPI(
            `https://music.163.com/api/song/lyric?id=${playId}&lv=1&tv=${ENABLE_LYRICS_TRANSLATION ? 1 : -1}`
        );

        const originalLyric = data?.lrc?.lyric || "";
        const translatedLyric = data?.tlyric?.lyric || "";

        if (!originalLyric && !translatedLyric) return [];

        if (!originalLyric && translatedLyric) {
            console.log("[Lyrics] 原文为空，使用翻译作为主歌词");
            return this.parseLyric(translatedLyric);
        }

        return this.parseLyric(originalLyric, ENABLE_LYRICS_TRANSLATION ? translatedLyric : undefined);
    }

    async triggerLyricFetch(playId: string): Promise<void> {
        const dispatchScript = `
      (function() {
        const store = window.__REDUX_STORE__;
        if (!store) return false;
        store.dispatch({
          type: 'async:lyric/fetchLyric',
          payload: { id: '${playId}', force: true }
        });
        return true;
      })()
    `;

        await this.evaluateScript(dispatchScript);

        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 100));
            const value = await this.evaluateScript<{ isLoading: boolean; hasLines: boolean }>(
                `(function() {
                const store = window.__REDUX_STORE__;
                if (!store) return null;
                const lyric = store.getState()['async:lyric'];
                return {
                  isLoading: lyric?.isLoading,
                  hasLines: (lyric?.lyricLines?.length || 0) > 0
                };
              })()`
            );

            if (value && !value.isLoading) {
                return;
            }
        }
    }

    async fetchLyricsFromRedux(): Promise<LyricLine[] | null> {
        const script = `
      (function() {
        const store = window.__REDUX_STORE__;
        if (!store) return null;

        const state = store.getState();
        const lyric = state['async:lyric'];
        if (!lyric || lyric.currentUsedLyric === 'none') return [];

        const lyricLines = lyric.lyricLines || [];
        const tlyricLines = lyric.tlyricLines || [];

        // 创建翻译映射 (时间 -> 翻译文本)
        const tMap = new Map();
        for (const t of tlyricLines) {
          if (t.lyric) tMap.set(Math.round(t.time * 1000), t.lyric);
        }

        // 合并原文和翻译
        return lyricLines
          .filter(l => l.lyric)
          .map(l => ({
            time: l.time,
            text: l.lyric,
            translatedText: tMap.get(Math.round(l.time * 1000)) || undefined
          }));
      })()
    `;

        return await this.evaluateScript<LyricLine[]>(script);
    }

    async fetchSongDetail(playId: string): Promise<SongInfo | null> {
        if (this.songCache.has(playId)) {
            return this.songCache.get(playId)!;
        }

        // 优先 Redux Store
        const reduxInfo = await this.fetchSongInfoFromRedux();
        if (reduxInfo && reduxInfo.playId === playId) {
            console.log("[Song] From Redux Store");
            const lyrics = await this.fetchLyrics(playId);
            const info: SongInfo = {
                title: reduxInfo.title,
                artist: reduxInfo.artist,
                duration: reduxInfo.duration,
                lyrics
            };
            this.songCache.set(playId, info);
            return info;
        }

        console.log("[Song] Fallback to API");
        const data = await this.fetchAPI(`https://music.163.com/api/song/detail?ids=[${playId}]`);
        if (!data?.songs?.[0]) return null;

        const song = data.songs[0];
        const lyrics = await this.fetchLyrics(playId);
        const info: SongInfo = {
            title: song.name,
            artist: song.artists.map((a: any) => a.name).join(" / "),
            duration: song.duration / 1000,
            lyrics
        };
        this.songCache.set(playId, info);
        return info;
    }

    async fetchSongInfoFromRedux(): Promise<{
        playId: string;
        title: string;
        artist: string;
        duration: number;
    } | null> {
        const script = `
      (function() {
        const store = window.__REDUX_STORE__;
        if (!store) return null;

        const state = store.getState();
        const playing = state.playing;
        if (!playing || !playing.playId) return null;

        return {
          playId: String(playing.playId),
          title: playing.resourceName || '',
          artist: (playing.resourceArtists || []).map(a => a.name || a).join(' / '),
          duration: playing.resourceDuration || 0
        };
      })()
    `;

        return await this.evaluateScript(script);
    }

    async getPlayStatus(): Promise<PlayStatus> {
        const value = await this.evaluateScript<PlayStatus>("window.__NCM_PLAY_STATE__");
        if (!value)
            return {
                playId: null,
                current: null,
                cacheProgress: null,
                lastUpdate: null,
                state: null,
                isPlaying: false
            };
        return value;
    }

    async startMonitoring(intervalMs = 500): Promise<void> {
        // 等待页面完全加载
        let isPageReady = false;
        for (let i = 0; i < 30; i++) {
            const ready = await this.evaluateScript<boolean>(
                `(function() {
                    const hasWebpack = window.webpackJsonp && window.webpackJsonp.push;
                    const pageReady = document.readyState === 'complete';

                    return hasWebpack && pageReady;
                })()`
            );

            if (ready) {
                isPageReady = true;
                console.log("[Launch] Page fully loaded", ready);
                break;
            }

            await new Promise((r) => setTimeout(r, 500));
        }

        if (!isPageReady) {
            console.warn("[Launch] Page may not be fully loaded, proceeding anyway");
        }

        console.log(await this.evaluateScript(INJECT_SCRIPT, true));
        console.log("[Monitor] Native callbacks subscribed\n");

        let lastPlayId: string | null = null;
        let lastLyric: string = "";
        let currentSongInfo: SongInfo | null = null;

        const logSongInfo = (time: string, info: SongInfo, current: number) => {
            const cur = current.toFixed(2);
            const dur = info.duration.toFixed(2);
            const pct = ((current / info.duration) * 100).toFixed(1);
            console.log(`[${time}] 🎵 ${info.title} - ${info.artist} | ${cur}s / ${dur}s (${pct}%)`);
        };

        const logLyric = (time: string, lyric: LyricLine) => {
            console.log(`[${time}] 🎤 ${lyric.text}`);
            if (ENABLE_LYRICS_TRANSLATION && lyric.translatedText) {
                console.log(`[${time}] 🌐 ${lyric.translatedText}`);
            }
        };

        const poll = async () => {
            if (this.abortController.signal.aborted) return;

            try {
                const s = await this.getPlayStatus();
                s.songInfo = currentSongInfo || undefined;

                if (!s.playId || s.current === null) return;

                // 过滤无效的状态
                if (s.current === 0 && (s.playId !== lastPlayId || lastPlayId === null)) {
                    return;
                }
                if (s.current === 0 && s.playId === lastPlayId) {
                    return;
                }

                const time = new Date().toLocaleTimeString();
                if (s.playId) {
                    // 新歌
                    if (s.playId !== lastPlayId) {
                        lastPlayId = s.playId;
                        lastLyric = "";
                        const info = await this.fetchSongDetail(s.playId);
                        if (info) {
                            currentSongInfo = info;
                            s.songInfo = info;
                            logSongInfo(time, info, s.current);
                            const lyric = getCurrentLyric(info.lyrics, s.current);
                            if (lyric) {
                                logLyric(time, lyric);
                                lastLyric = lyric.text;
                            }
                        } else {
                            console.log(`[${time}] 🎵 ID: ${s.playId} | ${s.current.toFixed(2)}s`);
                        }
                    } else {
                        // 变化时输出
                        const info = this.songCache.get(s.playId);
                        if (info) {
                            const lyric = getCurrentLyric(info.lyrics, s.current);
                            if (lyric && lyric.text !== lastLyric) {
                                logSongInfo(time, info, s.current);
                                logLyric(time, lyric);
                                lastLyric = lyric.text;
                            }
                        }
                    }
                    this.win.webContents.send("ncm-play-state", s);
                } else {
                    if (lastPlayId !== null) {
                        console.log(`[${time}] Waiting for playback...`);
                    }
                    lastPlayId = null;
                    lastLyric = "";
                    currentSongInfo = null;
                }
            } catch (error) {
                // 重连
                if ((error as Error).message === "Not connected") {
                    console.log("[Monitor] Connection lost, attempting to reconnect...");
                    if (!this.isManualDisconnect && !this.abortController.signal.aborted) {
                        this.tryReconnect();
                    }
                    return;
                }
                console.error("[Monitor] Poll error:", error);
            }
        };

        await poll();

        const pollLoop = async () => {
            while (!this.abortController.signal.aborted) {
                await new Promise<void>((resolve) => {
                    setTimeout(() => {
                        if (!this.abortController.signal.aborted) {
                            resolve();
                        }
                    }, intervalMs);
                });

                if (!this.abortController.signal.aborted) {
                    await poll();
                }
            }
        };

        pollLoop().catch((error) => {
            if (error.name !== "AbortError") {
                console.error("[Monitor] Poll loop error:", error);
            }
        });
    }

    disconnect(): void {
        this.isManualDisconnect = true;

        this.abortController.abort();

        if (this.ws) {
            try {
                this.ws.close();
                this.ws = null;
                console.log("[Monitor] Disconnected");
            } catch (error) {
                console.error("[Monitor] Error closing WebSocket:", error);
            }
        }
        this.pending.clear();
        this.sessionId = null;
    }
}

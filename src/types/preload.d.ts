export {};

import type { api } from "../../electron/preload";

declare global {
    interface Window {
        api: typeof api;
    }
}

export {};

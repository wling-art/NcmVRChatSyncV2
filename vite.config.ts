import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import AutoImport from "unplugin-auto-import/vite";
import { NaiveUiResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import pkg from "./package.json";

const isBuildMode = process.env.NODE_ENV === "production";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        tailwindcss(),
        vue(),
        AutoImport({
            eslintrc: { filepath: "./auto-eslint.mjs", enabled: true },
            imports: [
                "vue",
                {
                    "naive-ui": ["useDialog", "useMessage", "useNotification", "useLoadingBar"]
                }
            ]
        }),
        Components({
            resolvers: [NaiveUiResolver()]
        }),
        electron({
            main: {
                // Shortcut of `build.lib.entry`.
                entry: "electron/main.ts"
            },
            preload: {
                // Shortcut of `build.rollupOptions.input`.
                // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
                input: path.join(__dirname, "electron/preload.ts")
            },
            // Ployfill the Electron and Node.js API for Renderer process.
            // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
            // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
            renderer:
                process.env.NODE_ENV === "test"
                    ? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
                      undefined
                    : {}
        })
    ],
    build: {
        minify: isBuildMode ? "esbuild" : false,
        sourcemap: !isBuildMode,
        rollupOptions: {
            external: [
                "bufferutil",
                "utf-8-validate",
                "electron",
                ...Object.keys(pkg.dependencies).filter((dep) => dep !== "lodash-es")
            ]
        }
    }
});

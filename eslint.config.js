import typescriptEslint from "@typescript-eslint/eslint-plugin";
import vue from "eslint-plugin-vue";
import globals from "globals";
import { defineConfig } from "eslint/config";
import autoEslint from "./auto-eslint.mjs";

export default defineConfig([
    {
        ignores: ["**/node_modules", "**/dist", "**/out", "**/.gitignore", "**/auto-imports.d.ts", "**/components.d.ts"]
    },
    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts,vue}"],
        plugins: {
            "@typescript-eslint": typescriptEslint,
            vue
        },
        extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...autoEslint.globals
            },

            ecmaVersion: "latest",
            sourceType: "module",

            parserOptions: {
                parser: "@typescript-eslint/parser"
            }
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "vue/multi-word-component-names": "off"
        }
    },
    {
        files: ["**/.eslintrc.{js,cjs}"],

        languageOptions: {
            globals: { ...globals.node },
            ecmaVersion: 5,
            sourceType: "commonjs"
        }
    }
]);

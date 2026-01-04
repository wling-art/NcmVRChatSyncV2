<script setup lang="ts">
import { useColorMode } from "@vueuse/core";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import { darkTheme, type GlobalTheme, type GlobalThemeOverrides } from "naive-ui";
import { nextTick, ref, watch } from "vue";

const colorMode = useColorMode();

hljs.registerLanguage("typescript", typescript);

const theme = ref<GlobalTheme | null>(colorMode.value === "dark" ? darkTheme : null);

watch(colorMode, async (mode) => {
    await nextTick(); // 不加这个会没有自带的过渡效果
    theme.value = mode === "dark" ? darkTheme : null;
});

const themeOverrides: GlobalThemeOverrides = {
    common: {
        fontSize: "13px",
        lineHeight: "1.4"
    },
    Button: {
        heightSmall: "26px",
        heightMedium: "28px"
    },
    Input: {
        heightSmall: "26px",
        heightMedium: "28px"
    },
    Card: {
        paddingSmall: "8px"
    }
};
</script>

<template>
    <n-config-provider :hljs="hljs" :theme="theme" :theme-overrides="themeOverrides">
        <main>
            <router-view />
        </main>
    </n-config-provider>
</template>

<style scoped></style>

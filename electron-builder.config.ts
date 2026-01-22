import type { Configuration } from "electron-builder";

const config: Configuration = {
    // 应用程序的产品名称
    productName: "NcmVRChatSync",
    // 构建资源所在的目录
    directories: {
        output: "release"
    },
    // 包含在最终应用程序构建中的文件列表
    // 使用通配符 ! 表示排除不需要的文件
    files: [
        "public/**",
        "dist/**",
        "dist-electron/**",
        "!**/.vscode/*",
        "!src/*",
        "!electron.vite.config.{js,ts,mjs,cjs}",
        "!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}",
        "!{.env,.env.*,.npmrc,pnpm-lock.yaml}"
    ],
    afterPack: "./script/removeLocales.ts",
    // 哪些文件将不会被压缩，而是解压到构建目录
    asarUnpack: ["public/**"],
    win: {
        // 可执行文件名
        executableName: "NcmVRChatSync",
        // 应用程序的图标文件路径
        // icon: "public/icons/logo.ico",
        // Windows 平台全局文件名模板
        artifactName: "${productName}-${version}-${arch}.${ext}",
        // 是否对可执行文件进行签名和编辑
        // signAndEditExecutable: false,
        // 构建类型（架构由命令行参数 --x64 或 --arm64 指定）
        target: [
            // 便携版
            {
                target: "portable",
                arch: ["x64"]
            }
        ]
    },
    // 是否在构建之前重新编译原生模块
    npmRebuild: false,
    // Electron 下载镜像配置
    electronDownload: {
        mirror: "https://npmmirror.com/mirrors/electron/"
    },
    asar: true,
    compression: "maximum"
};

export default config;

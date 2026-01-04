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
            // 安装版
            {
                target: "nsis",
                arch: ["x64", "arm64"]
            },
            // 打包版
            {
                target: "portable",
                arch: ["x64", "arm64"]
            }
        ],
        // 注册协议
        protocols: [
            {
                name: "Orpheus Protocol",
                schemes: ["orpheus"]
            }
        ]
    },

    // macOS 平台配置
    mac: {
        // 可执行文件名
        executableName: "NcmVRChatSync",
        // 应用程序的图标文件路径
        // icon: "public/icons/icon.icns",
        // 权限继承的文件路径
        entitlementsInherit: "build/entitlements.mac.plist",
        // macOS 平台全局文件名模板
        artifactName: "${productName}-${version}-${arch}.${ext}",
        // 扩展信息，如权限描述
        extendInfo: {
            NSCameraUsageDescription: "Application requests access to the device's camera.",
            NSMicrophoneUsageDescription: "Application requests access to the device's microphone.",
            NSDocumentsFolderUsageDescription: "Application requests access to the user's Documents folder.",
            NSDownloadsFolderUsageDescription: "Application requests access to the user's Downloads folder.",
            // 注册协议
            CFBundleURLTypes: [
                {
                    CFBundleURLName: "Orpheus Protocol",
                    CFBundleURLSchemes: ["orpheus"]
                }
            ]
        },
        // 是否启用应用程序的 Notarization（苹果的安全审核）
        notarize: false,
        darkModeSupport: true,
        category: "public.app-category.music",
        target: [
            // DMG 安装版
            {
                target: "dmg",
                arch: ["x64", "arm64"]
            },
            // 压缩包安装版
            {
                target: "zip",
                arch: ["x64", "arm64"]
            }
        ]
    },
    // 是否在构建之前重新编译原生模块
    npmRebuild: false,
    // Electron 下载镜像配置
    electronDownload: {
        mirror: "https://npmmirror.com/mirrors/electron/"
    },
    // 发布配置
    // 先留空，不自动上传
    publish: []
};

export default config;

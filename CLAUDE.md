# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

OpenSSH Client 是一个基于 Electron + Vue 3 构建的现代化 SSH 客户端应用程序。核心架构分为三层：

1. **主进程 (src/main/)** - 负责 SSH 连接管理、数据存储、IPC 通信
2. **预加载脚本 (src/preload/)** - 使用 contextBridge 安全地暴露 API 给渲染进程
3. **渲染进程 (src/renderer/)** - Vue 3 前端界面

## 常用命令

### 开发
```bash
npm run dev          # 启动开发服务器（支持热重载）
npm run build        # 构建生产版本到 out/ 目录
npm run preview      # 预览构建结果
```

### 打包
```bash
npm run package      # 打包当前平台应用
npm run build:win    # 构建 Windows 安装包 (.exe)
npm run build:mac    # 构建 macOS 应用 (.dmg)
npm run build:linux  # 构建 Linux AppImage
npm run build:all    # 打包所有平台
```

## 核心架构

### SSH 连接管理 (src/main/ssh-manager.js)

- 使用 `ssh2` 库建立 SSH 连接
- 活跃连接存储在 `Map` 结构中：`sessionId -> { client, stream, sftp }`
- 支持密码和私钥两种认证方式，私钥支持 passphrase
- 每个连接通过 sessionId 唯一标识
- 提供测试连接功能（`testSSHConnection`），连接成功后立即断开

### 数据存储 (src/main/db.js)

- 使用 `electron-store` 存储主机配置
- 数据存储在用户目录的配置文件中（JSON 格式）
- 主机数据结构包含：id、host、port、username、auth_type、password/private_key、passphrase、group_name 等
- 自动追踪最后连接时间（`last_connected`）

### IPC 通信模式

**单向调用 (渲染进程 → 主进程)**:
- `ipcRenderer.invoke()` + `ipcMain.handle()` - 异步调用，返回结果
- `ipcRenderer.send()` + `ipcMain.on()` - 单向发送，不返回结果

**事件推送 (主进程 → 渲染进程)**:
- `mainWindow.webContents.send()` + `ipcRenderer.on()` - 主进程主动推送

所有 API 通过 `contextBridge` 暴露在 `window.electronAPI` 上，按功能分组：
- `window.electronAPI.hosts.*` - 主机管理
- `window.electronAPI.ssh.*` - SSH 连接操作
- `window.electronAPI.sftp.*` - SFTP 文件操作
- `window.electronAPI.updater.*` - 自动更新

### Vue 组件结构

- **App.vue** - 根组件，管理标签页状态和会话列表
- **TitleBar.vue** - 自定义无边框标题栏（支持窗口最小化、最大化、关闭）
- **Sidebar.vue** - 主机列表，支持分组和搜索
- **TabBar.vue** - 多标签管理，支持右键菜单（复制会话、重命名、关闭其他）
- **TerminalPane.vue** - 终端面板，基于 xterm.js
- **HostDialog.vue** - 主机管理对话框（添加/编辑主机）
- **SettingsDialog.vue** - 设置对话框（语言、主题、自动更新）
- **WelcomeScreen.vue** - 欢迎页面

### 国际化 (i18n)

- 使用 `vue-i18n` 实现多语言
- 语言文件位于 `src/renderer/src/locales/` (zh.js, en.js)
- 语言偏好存储在 `localStorage` 中
- 支持运行时切换语言

### 主题系统

- 亮色/暗色主题切换
- CSS 变量定义在 `src/renderer/src/styles/global.css`
- 主进程通过 `nativeTheme` 管理，渲染进程同步

### 自动更新

- 使用 `electron-updater` 实现自动更新
- 更新源配置在 package.json 的 `publish` 字段中（GitHub releases）
- 用户可控制是否自动检查更新
- 支持手动检查更新

## 安全考虑

- 渲染进程禁用 `nodeIntegration`，启用 `contextIsolation`
- 所有 Node.js API 访问通过 preload 脚本安全暴露
- 主机密码等敏感信息仅在内存中管理，不记录日志

## 构建配置

- 使用 `electron-vite` 作为构建工具
- 配置文件：`electron.vite.config.js`
- 渲染进程支持 `@` 别名指向 `src/renderer/src`
- ASAR 打包时排除 `ssh2` 的原生依赖（通过 `asarUnpack` 配置）

<div align="center">

<img src="./src-tauri/icons/128x128.png" width="96" height="96" alt="LynxShell">

# LynxShell

**A lightweight, clean & modern SSH client built with Tauri v2 + Vue 3 + Rust**

**基于 Tauri v2 + Vue 3 + Rust 构建的轻量、简洁、现代 SSH 客户端**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24c8db?logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.77%2B-000000?logo=rust)](https://www.rust-lang.org/)
[![Vue](https://img.shields.io/badge/Vue-3-42b883?logo=vue.js)](https://vuejs.org/)

[English](#english) | [中文](#中文-chinese)

</div>

---

## English

### Features

#### Host Management
- Add, edit, and delete SSH hosts with full form support
- Group hosts into custom categories (Default Group supported)
- Search hosts by name or address in real-time

#### Authentication
- **Password Authentication** - standard username/password login
- **Private Key Authentication** - PEM format private key with optional passphrase

#### Multi-Tab Session
- Open multiple SSH sessions simultaneously in tabs
- **Duplicate Session** - right-click a tab to clone a connection instantly
- **Rename Tab** - double-click tab title to rename
- **Close Others** - right-click to close all other tabs

#### Modern Terminal
- Powered by xterm.js with full True Color support
- **High Performance** - Backed by Rust russh crate for low-latency terminal experience
- **Day / Night Mode** - switch between Light and Dark themes with one click
- **Shell History Autocomplete** - real-time command suggestions from server history (~/.bash_history, zsh, fish). Floating popup with ghost text preview. Tab to accept, Up/Down to navigate, Esc to dismiss
- Right-click context menu: Copy, Paste, Clear
- Keyboard shortcuts: Ctrl+Shift+C (Copy), Ctrl+Shift+V (Paste)
- Auto-fit terminal on window resize

#### SFTP File Browser
- **Dual-Pane Layout** - intuitive directory tree and file list view
- **File Management** - create, delete, rename, and move files/folders
- **Bookmarks** - instantly pin directories with custom aliases
- **Upload & Download** - high-speed transfers powered by Rust async I/O
- **Transfer Queue** - progress, speed, pause/resume/cancel support
- **Drag & Drop** - drag files directly into the pane to upload

#### Seamless Integration
- **Terminal to SFTP** - click the folder icon on the tab to open SFTP at the current terminal path

#### Internationalization (i18n)
- Switch between **English** and **Chinese** at runtime
- Language preference is saved and restored on next launch

#### Refined UI
- Custom frameless title bar with window controls
- Clean sidebar with host list, search, and refresh
- Smooth animations and transitions throughout

---

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Core / Backend | **Tauri v2**, **Rust** |
| Frontend | Vue 3, Vite |
| Terminal | xterm.js, addon-fit |
| SSH (Rust) | russh, russh-keys, russh-sftp |
| Icons | Lucide Vue Next |
| i18n | vue-i18n |

---

### Getting Started

#### Prerequisites
- Node.js **v20+**
- Rust **v1.77+**
- cargo & npm

#### Install

```bash
git clone https://github.com/litianfu1997/lynxshell.git
cd lynxshell
npm install
```

#### Development

```bash
npm run dev
```

#### Build

```bash
npm run build
```

---

### Project Structure

```
lynxshell/
├── src-tauri/              # Rust backend (Tauri core, SSH logic)
│   ├── src/                # Rust source code
│   └── tauri.conf.json     # Tauri configuration
├── src/                    # Frontend source code
│   └── renderer/           # Vue 3 frontend
│       ├── src/
│       │   ├── components/ # UI components
│       │   ├── locales/    # i18n language files
│       │   └── api/        # Tauri bridge API
│       └── index.html
├── resources/              # Static assets
└── package.json
```

---

### License

This project is licensed under the [MIT License](LICENSE).

---

## 中文 (Chinese)

### 功能特性

#### 主机管理
- 完整的增删改查表单，轻松管理 SSH 主机
- 支持自定义分组（默认分组自动归类）
- 实时搜索主机名或地址

#### 认证方式
- **密码认证** - 标准用户名 + 密码登录
- **私钥认证** - 支持 PEM 格式私钥

#### 多标签会话
- 同时开启多个 SSH 标签会话
- **复制会话** - 右键标签一键克隆当前连接
- **重命名标签** - 双击标签名即可重命名
- **关闭其他标签** - 右键菜单快速关闭其余所有标签

#### 现代终端
- 基于 xterm.js，完整支持 True Color
- **高性能** - 由 Rust russh 驱动，极速响应，更低内存占用
- **日夜模式** - 一键切换亮色与暗色主题，终端配色同步切换
- **Shell 历史命令补全** - 连接后自动通过 SFTP 读取服务器 ~/.bash_history（兼容 bash/zsh/fish），在终端光标处弹出浮动候选列表，同时显示幽灵预览文字。Tab 接受补全，上下键切换候选，Esc 关闭
- 右键菜单：复制、粘贴、清屏
- 快捷键：Ctrl+Shift+C 复制，Ctrl+Shift+V 粘贴
- 窗口缩放时终端自动适配尺寸

#### SFTP 文件浏览器
- **双面板布局** - 直观的左侧目录树与右侧文件列表
- **文件管理** - 支持新建、删除、重命名、移动文件或文件夹
- **路径收藏系统** - 一键收藏常用目录并支持自定义备注
- **文件传输** - 基于 Rust 异步 I/O 的极速上传与下载
- **传输队列** - 实时显示传输进度、速度，并支持暂停、恢复与取消
- **拖拽上传** - 支持直接拖拽本地文件到窗口进行上传

#### 无缝互通
- **终端转 SFTP** - 点击标签右侧文件夹图标，即可在当前路径打开 SFTP 面板

#### 国际化 (i18n)
- 运行时切换中文（简体）与 English
- 语言偏好自动保存，下次启动恢复

#### 精致 UI
- 自定义无边框标题栏，集成窗口控制按钮
- 简洁侧边栏，包含主机列表、搜索和刷新
- 全局动画过渡效果，体验流畅

---

### 技术栈

| 层级 | 技术 |
|------|------|
| 核心 / 后端 | **Tauri v2**, **Rust** |
| 前端 | Vue 3, Vite |
| 终端 | xterm.js, addon-fit |
| SSH (Rust) | russh, russh-keys, russh-sftp |
| 图标库 | Lucide Vue Next |
| 国际化 | vue-i18n |

---

### 快速开始

#### 前置要求
- Node.js **v20+**
- Rust **v1.77+**
- cargo & npm

#### 安装

```bash
git clone https://github.com/litianfu1997/lynxshell.git
cd lynxshell
npm install
```

#### 开发模式运行

```bash
npm run dev
```

#### 打包构建

```bash
npm run build
```

---

### 项目结构

```
lynxshell/
├── src-tauri/              # Rust 后端 (Tauri 核心, SSH 逻辑)
│   ├── src/                # Rust 源码
│   └── tauri.conf.json     # Tauri 配置文件
├── src/                    # 前端源码
│   └── renderer/           # Vue 3 前端
│       ├── src/
│       │   ├── components/ # UI 组件
│       │   ├── locales/    # 国际化语言文件
│       │   └── api/        # Tauri 桥接 API
│       └── index.html
├── resources/              # 静态资源
└── package.json
```

---

### 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。

# SFTP 文件浏览器设计文档

**日期**: 2025-02-23
**状态**: 已批准

## 1. 概述

为 OpenSSH Client 添加全功能 SFTP 文件浏览器，支持文件浏览、上传、下载、管理、预览和在线编辑。

### 核心需求

- **模式**: 独立标签（与终端标签并列）
- **布局**: 双面板（左侧目录树 + 右侧文件列表）
- **核心功能**: 浏览、上传、下载、文件管理
- **高级功能**: 在线编辑、文件预览、传输队列、收藏夹
- **操作**: 批量操作 + 拖拽

---

## 2. 架构设计

### 2.1 组件层级

```
App.vue (标签管理)
└── SftpPane.vue (主容器)
    ├── SftpTree.vue (左侧目录树)
    ├── SftpFileList.vue (右侧文件列表)
    ├── SftpPreview.vue (预览面板)
    ├── SftpBreadcrumb.vue (面包屑导航)
    ├── SftpToolbar.vue (工具栏)
    └── TransferQueue.vue (传输队列)
```

### 2.2 数据流

- `SftpPane` 维护核心状态（当前路径、选中项、预览文件）
- 子组件通过 props 接收数据，通过 events 通知父组件变更
- IPC 调用统一在 `SftpPane` 中处理，子组件不直接与主进程通信

### 2.3 SSH 连接复用

- SFTP 会话基于现有的 SSH 连接（sessionId）
- 使用 `getSFTP(sessionId)` 获取或初始化 SFTP 会话
- SFTP 标签关闭时不断开 SSH 连接（仅释放 SFTP 句柄）

---

## 3. UI 布局

```
┌─────────────────────────────────────────────────┐
│ SftpToolbar (新建、上传、下载、删除、刷新、收藏) │
├──────────────┬──────────────────────────────────┤
│              │ SftpBreadcrumb (/home/user/docs) │
│  SftpTree    ├──────────────────────────────────┤
│  (目录树)     │                                  │
│              │  SftpFileList                    │
│  📁 home     │  📁 folder1   📄 file1.txt       │
│  📁 docs     │  📁 folder2   📄 file2.jpg       │
│  📁 downloads│  📄 file3.pdf  📄 file4.py       │
│              │                                  │
│              │  (可选) SftpPreview              │
│              │  ┌────────────────────────────┐  │
│              │  │ 文件预览内容                │  │
│              │  └────────────────────────────┘  │
├──────────────┴──────────────────────────────────┤
│ TransferQueue (折叠/展开)                        │
│ ▼ 传输中: file1.zip (45%) 2MB/s                 │
└─────────────────────────────────────────────────┘
```

### 3.1 组件职责

| 组件 | 职责 |
|------|------|
| `SftpToolbar` | 提供操作按钮（新建文件夹、上传、下载、删除、刷新、收藏） |
| `SftpTree` | 显示可展开/折叠的目录树，点击切换当前路径 |
| `SftpBreadcrumb` | 显示当前路径，支持点击跳转上级目录 |
| `SftpFileList` | 显示当前目录文件列表，支持多选、拖拽、右键菜单 |
| `SftpPreview` | 预览选中文件（图片、文本、代码） |
| `TransferQueue` | 显示上传/下载队列，支持暂停/取消 |

---

## 4. 数据流与状态管理

### 4.1 核心状态

```typescript
interface SftpState {
  sessionId: string           // SSH 会话 ID
  currentPath: string         // 当前路径
  treeData: FileNode[]        // 目录树数据
  fileList: FileInfo[]        // 当前目录文件列表
  selectedFiles: string[]     // 选中的文件
  previewFile: FileInfo | null // 预览的文件
  bookmarks: Bookmark[]       // 收藏夹
  transfers: TransferItem[]   // 传输队列
  isTreeLoading: boolean      // 目录树加载中
  isListLoading: boolean      // 文件列表加载中
}
```

### 4.2 操作流程

| 操作 | 流程 |
|------|------|
| 切换目录 | 用户点击 → 调用 `sftp:ls` → 更新 fileList 和 currentPath |
| 上传文件 | 选择文件 → 调用 `sftp:upload` → 添加到 transferQueue → 刷新列表 |
| 下载文件 | 选中文件 → 调用 `sftp:download` → 保存到本地 |
| 删除文件 | 选中文件 → 调用 `sftp:delete` → 刷新列表 |
| 新建文件夹 | 输入名称 → 调用 `sftp:mkdir` → 刷新列表 |
| 拖拽上传 | 拖入文件 → 调用 `sftp:upload` → 同上传流程 |
| 拖拽移动 | 拖拽文件到目录 → 调用 `sftp:move` → 刷新列表 |

---

## 5. IPC API 设计

### 5.1 新增 API

| API | 功能 | 参数 | 返回值 |
|-----|------|------|--------|
| `sftp:upload` | 上传文件 | `{ sessionId, localPath, remotePath }` | `{ transferId }` |
| `sftp:download` | 下载文件 | `{ sessionId, remotePath, localPath }` | `{ transferId }` |
| `sftp:delete` | 删除文件/文件夹 | `{ sessionId, path }` | `{ success }` |
| `sftp:rename` | 重命名 | `{ sessionId, oldPath, newPath }` | `{ success }` |
| `sftp:mkdir` | 创建目录 | `{ sessionId, path }` | `{ success }` |
| `sftp:move` | 移动文件 | `{ sessionId, oldPath, newPath }` | `{ success }` |
| `sftp:getFile` | 读取文件内容 | `{ sessionId, path }` | `{ content }` |
| `sftp:putFile` | 保存文件内容 | `{ sessionId, path, content }` | `{ success }` |
| `sftp:stat` | 获取文件信息 | `{ sessionId, path }` | `{ stats }` |
| `transfer:progress` | 传输进度事件（推送） | - | `{ transferId, progress, speed }` |
| `transfer:complete` | 传输完成事件（推送） | - | `{ transferId, success }` |

### 5.2 ssh-manager.js 新增函数

```javascript
export function uploadFile(sessionId, localPath, remotePath, onProgress)
export function downloadFile(sessionId, remotePath, localPath, onProgress)
export function deletePath(sessionId, path)
export function renamePath(sessionId, oldPath, newPath)
export function mkdir(sessionId, path)
export function movePath(sessionId, oldPath, newPath)
export function readFile(sessionId, path)
export function writeFile(sessionId, path, content)
export function getStats(sessionId, path)
```

---

## 6. 错误处理

### 6.1 错误类型处理

| 错误场景 | 处理方式 |
|----------|----------|
| SSH 连接断开 | 显示错误提示，禁用所有操作，提示重连 |
| 权限不足 | 显示 "Permission denied" 提示 |
| 文件不存在 | 显示 "File not found" 提示 |
| 磁盘空间不足 | 上传前检查，显示 "Not enough space" |
| 网络中断 | 暂停传输队列，支持恢复 |
| 文件名冲突 | 上传时询问：覆盖/重命名/跳过 |
| 路径过长 | 显示 "Path too long" 提示 |
| 符号链接 | 显示特殊图标，谨慎处理 |

### 6.2 边界情况

| 场景 | 处理方式 |
|------|----------|
| 空目录 | 显示 "此文件夹为空" 提示 |
| 大文件列表 | 分页加载（每页 1000 项）或虚拟滚动 |
| 大文件上传/下载 | 显示进度，支持取消 |
| 特殊字符文件名 | 正确转义显示 |
| 隐藏文件 | 提供 "显示隐藏文件" 选项 |
| 快速连续操作 | 操作队列化，避免冲突 |

---

## 7. 测试策略

### 7.1 单元测试
- `ssh-manager.js` 中所有 SFTP 函数
- 加密/解密功能（crypto.js）

### 7.2 集成测试
- SFTP IPC 调用流程
- 上传/下载/删除等操作的端到端流程
- 传输队列的事件推送

### 7.3 UI 交互测试
- 目录树展开/折叠
- 文件列表多选、拖拽
- 面包屑导航
- 预览面板切换

### 7.4 边界测试
- 大文件（>100MB）上传/下载
- 特殊字符文件名
- 空目录、根目录
- 网络中断场景

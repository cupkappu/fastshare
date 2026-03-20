# Implementation Plan: WebRTC 文件共享工具

**Branch**: `001-webrtc-file-share` | **Date**: 2026 年 3 月 19 日 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-webrtc-file-share/spec.md`

## Summary

构建一个类似 LocalSend 的文件共享工具，支持局域网内自动发现设备和通过 WebRTC 进行远程连接。核心差异化功能是通过短码连接远程设备，短码存储在 cookie 中实现自动重连。

## Technical Context

**Language/Version**: TypeScript 5+ (类型安全，现代 ECMAScript)
**Primary Dependencies**: Vue 3, simple-peer, Vite 8
**Storage**: IndexedDB (加密短码) + HttpOnly Cookie (设备 ID)
**Testing**: Vitest (单元测试), Playwright (E2E 测试)
**Target Platform**: Web 浏览器 (Chrome/Firefox/Safari/Edge)
**Project Type**: Web 应用 (单页应用 SPA)
**Performance Goals**: 文件传输速度达本地带宽 80%+，设备发现<3 秒，短码输入<10 秒
**Constraints**: 短码≤8 字符，支持断点续传，HTTPS 强制 (WebRTC 要求)
**Scale/Scope**: 个人/小团队使用，支持 10+ 并发设备，单文件最大 2GB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

基于行业最佳实践的默认原则：

**Gate 1 - 技术栈选择**: ✅ 通过
- 前端：Vue 3 + Vite（轻量级，快速开发）
- WebRTC: simple-peer（简单封装）
- 信令：Node.js + WebSocket（可选，仅用于设备发现）

**Gate 2 - 架构复杂度**: ✅ 通过
- 单项目结构（src/ + tests/）
- 信令服务器可选（纯局域网场景不需要）
- 文件 P2P 直连，无中转服务器

**Gate 3 - 测试策略**: ✅ 通过
- 单元测试：Vitest（短码生成、数据验证）
- 集成测试：WebRTC 连接、设备发现
- E2E 测试：Playwright（完整文件传输流程）

**Gate 4 - 安全性**: ✅ 通过
- DTLS 强制加密（WebRTC 内置）
- 短码 HMAC + Base32 + 校验和
- IndexedDB 加密存储 + HttpOnly Cookie

**Gate 5 - 性能**: ✅ 通过
- 流式读取（恒定 16-32KB 内存占用）
- 16 KiB 分块传输（跨浏览器兼容）
- 背压控制（防止缓冲区膨胀）

## Project Structure

### Documentation (this feature)

```text
specs/001-webrtc-file-share/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── models/              # 数据模型：设备、短码、文件传输会话、连接
├── services/            # 核心服务：设备发现、WebRTC 连接、短码管理
├── components/          # UI 组件：设备列表、文件选择器、进度显示
└── utils/               # 工具函数：cookie 操作、错误处理

tests/
├── unit/                # 单元测试
├── integration/         # 集成测试：WebRTC 连接、设备发现
└── e2e/                 # 端到端测试：完整文件传输流程
```

**Structure Decision**: 采用单项目结构，按功能模块组织代码

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| WebRTC 技术 | 支持跨网络点对点传输 | 传统 HTTP 中转需要服务器，增加复杂度和成本 |
| Cookie 持久化 | 实现自动重连体验 | 手动每次输入短码降低用户体验 |
| 设备发现协议 | 局域网内自动发现 | 手动输入 IP 地址不友好 |

## Phase 0: Research Summary

已完成的研究任务及成果：

### 1. 技术栈选择 ✅

**决策**: Vue 3 + Vite + simple-peer

- **前端框架**: Vue 3（轻量级~20KB，组合式 API）
- **构建工具**: Vite 8（极速 HMR，生产优化）
- **WebRTC 库**: simple-peer（~25KB，EventEmitter API）
- **信令服务器**: Node.js + ws（WebSocket 库）

详见：[research.md#1-技术栈选择](./research.md#1-技术栈选择)

### 2. 目标平台 ✅

**决策**: Web 应用（现代浏览器）

- **支持浏览器**: Chrome/Firefox/Safari/Edge（最新版）
- **HTTPS 要求**: 生产环境强制（WebRTC 规范）
- **iOS 注意**: 仅可靠支持 H.264 编解码

详见：[research.md#2-目标平台](./research.md#2-目标平台)

### 3. WebRTC 最佳实践 ✅

**核心决策**:
- **连接建立**: 公共 STUN + 自建 TURN（可选）
- **文件传输**: Data Channel（可靠有序模式）
- **分块大小**: 16 KiB（跨浏览器最稳定）
- **背压控制**: `bufferedAmountLowThreshold = 32 KiB`
- **断点续传**: 文件 ID + 分块序号 + SHA-256 校验

详见：[research.md#3-webRTC-最佳实践](./research.md#3-webrtc-最佳实践)

### 4. 设备发现协议 ✅

**决策**: 信令服务器辅助的 WebRTC P2P 方案

- **信令服务器**: WebSocket 转发 SDP/ICE 候选
- **纯局域网**: 不需要 STUN/TURN
- **远程连接**: 通过短码配对建立连接

详见：[research.md#4-设备发现协议](./research.md#4-设备发现协议)

### 5. 短码生成算法 ✅

**决策**: TOTP-inspired HMAC + Base32 + 双字符校验和

- **格式**: `XXXXXX-YY` (6 位数据 + 2 位校验，共 8 字符)
- **字符集**: Base32 (A-Z, 2-7)，无 0/O、1/I 混淆
- **熵值**: 30 bits
- **有效期**: 10 分钟
- **安全**: 速率限制 + 尝试限制 + 加密存储

详见：[research.md#5-短码生成算法](./research.md#5-短码生成算法)

### 6. Cookie 安全实践 ✅

**决策**: 分层存储策略

- **短期存储**: IndexedDB（AES-256 加密短码）
- **长期存储**: HttpOnly Cookie（设备 ID，Secure + SameSite=Strict）
- **自动清理**: 过期短码自动删除
- **撤销机制**: 短码撤销后加入黑名单

详见：[research.md#6-cookie-安全实践](./research.md#6-cookie-安全实践)

---

## Phase 1: Design & Contracts

### 1. 数据模型 ✅

已创建：[data-model.md](./data-model.md)

**核心实体**:
- **Device**: 设备标识与状态
- **ShortCode**: 短码凭证（8 字符 Base32 格式）
- **FileTransferSession**: 文件传输会话
- **Connection**: WebRTC 连接
- **PairedDevice**: 配对设备（用于自动重连）

**状态机**:
- 设备状态：`online` → `busy` → `offline`
- 短码状态：`active` → `used`/`expired`/`revoked`
- 传输状态：`pending` → `transferring` → `completed`

### 2. 接口契约 ✅

已创建：[contracts/](./contracts/)

**信令服务器 API** ([signaling-api.md](./contracts/signaling-api.md)):
- WebSocket 协议
- 设备注册与发现
- SDP offer/answer 交换
- ICE 候选交换
- 短码生成与验证

**WebRTC DataChannel 协议** ([webrtc-datachannel.md](./contracts/webrtc-datachannel.md)):
- 控制消息格式（JSON）
- 文件传输流程
- 断点续传协议
- 背压控制机制

### 3. 快速入门指南 ✅

已创建：[quickstart.md](./quickstart.md)

**内容包括**:
- 环境要求与安装
- 开发模式与生产构建
- 核心功能使用场景
- 项目结构说明
- 调试技巧与常见问题

### 4. Agent 上下文更新 ✅

已运行：`.specify/scripts/bash/update-agent-context.sh qwen`

**更新内容**:
- 添加技术栈：TypeScript, Vue 3, simple-peer, Vite 8
- 添加存储方案：IndexedDB + HttpOnly Cookie
- 添加测试框架：Vitest, Playwright

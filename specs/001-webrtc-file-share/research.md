# Phase 0 Research Report: WebRTC 文件共享工具

**Generated**: 2026 年 3 月 19 日  
**Feature**: 001-webrtc-file-share  
**Purpose**: 解决 Technical Context 中的所有 NEEDS CLARIFICATION 问题

---

## 1. 技术栈选择

### Decision: Vue 3 + Vite + simple-peer

**前端框架**: Vue 3 + Vite  
**WebRTC 库**: simple-peer  
**构建工具**: Vite 8  
**信令服务器**: Node.js + WebSocket

**Rationale**:
- **Vue 3**: 轻量级（~20KB），组合式 API 适合快速开发，响应式系统适合实时更新
- **simple-peer**: 最简单的 WebRTC 封装库（~25KB），将 RTCPeerConnection 封装为 EventEmitter
- **Vite 8**: 极速开发体验，HMR 近即时更新，生产构建比 Webpack 小约 13%

**Alternatives considered**:
| 选项 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| React | 生态最大 | 包体积较大（~40KB） | 备选 |
| Preact | 最轻量（3.5KB） | 生态较小 | 备选 |
| PeerJS | 内置信令 | 包体积大（~50KB） | 备选 |
| 原生 WebRTC | 零依赖 | API 复杂 | 不推荐 |

---

## 2. 目标平台

### Decision: Web 应用（浏览器）

**Target Platform**: 现代浏览器（Chrome/Firefox/Safari/Edge）  
**Project Type**: Web 应用（单页应用 SPA）  
**部署方式**: 静态文件托管 + 可选信令服务器

**Rationale**:
- **WebRTC 原生支持**: 所有现代浏览器内置 WebRTC 支持
- **零安装**: 用户打开浏览器即可使用
- **跨平台**: 桌面/移动均可访问
- **HTTPS 要求**: WebRTC 强制安全上下文（localhost 开发除外）

**浏览器兼容性注意事项**:
- Safari (iOS) 仅可靠支持 H.264 编解码
- Chrome 142+ 需关注 LNA 权限对本地网络访问的影响
- 所有功能需在 HTTPS 上下文中运行（localhost 除外）

---

## 3. WebRTC 最佳实践

### Decision: Data Channel + 二进制压缩 SDP + 临时凭证

**连接建立**:
- **STUN/TURN**: 公共 STUN（Google）+ 自建 TURN（Coturn，可选）
- **SDP 交换**: 通过信令服务器 WebSocket 转发
- **短码映射**: 短码 → 会话 ID → ICE 候选 两层映射

**文件传输**:
- **通道类型**: Data Channel（可靠有序模式）
- **分块大小**: 16 KiB（跨浏览器最稳定）
- **背压控制**: `bufferedAmountLowThreshold = 32 KiB`
- **断点续传**: 文件 ID + 分块序号 + SHA-256 校验和

**安全性**:
- **DTLS 加密**: WebRTC 内置强制加密
- **短码安全**: 6 位数字（10^6 组合）+ 5 分钟过期 + 3 次尝试限制
- **临时凭证**: TURN 凭证 24 小时过期

**性能优化**:
- **内存管理**: 流式读取分块处理（恒定 ~16-32KB 占用）
- **并发传输**: 通道池（2-4 并发通道）+ 优先级队列
- **流量控制**: SCTP 内置流控 + 应用层背压感知

**Alternatives considered**:
| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| Media Channel | 实时传输 | 不适合文件完整性 | 不推荐 |
| 整文件发送 | 简单 | >64 KiB 容易失败 | 不推荐 |
| 仅 STUN | 零成本 | 对称 NAT 下失败率 10-15% | 不推荐 |

---

## 4. 设备发现协议

### Decision: 信令服务器辅助的 WebRTC P2P 方案

**架构**:
```
设备 A ←WebSocket→ 信令服务器 ←WebSocket→ 设备 B
         ↓                              ↓
         └──────── WebRTC P2P ──────────┘
              (文件直连，不经过服务器)
```

**信令服务器功能**:
- 设备注册与发现
- ICE 候选交换（SDP offer/answer 转发）
- 房间/配对管理

**实现方案**:
- **服务端**: Node.js + ws（WebSocket 库）
- **前端**: 标准 WebRTC API + simple-peer 封装

**纯局域网场景配置**:
```javascript
const configuration = {
  iceServers: [], // 纯局域网不需要 STUN/TURN
  iceCandidatePoolSize: 0,
  iceTransportPolicy: 'all'
};
```

**Alternatives considered**:
| 方案 | 可行性 | 原因 |
|------|--------|------|
| UDP 多播广播 | ❌ 不可行 | 浏览器禁止 JavaScript 发送 UDP 包 |
| mDNS/DNS-SD | ❌ 不可行 | Chrome 不支持，安全考虑 |
| Local Network Access API | ⚠️ 不适用 | 用于 HTTP 请求，非设备发现 |
| 信令服务器 + WebRTC | ✅ 推荐 | 成熟方案，Snapdrop/PairDrop 验证 |

---

## 5. 短码生成算法

### Decision: TOTP-inspired HMAC + Base32 + 双字符校验和

**短码格式**: `XXXXXX-YY` (6 位数据 + 2 位校验，共 8 字符)  
**字符集**: Base32 (A-Z, 2-7)，无 0/O、1/I 混淆  
**熵值**: 30 bits（6 位 Base32）  
**有效期**: 10 分钟（可配置）  
**使用限制**: 单次连接或 3 次尝试

**生成流程**:
```javascript
// 1. 生成随机密钥 (160 bits)
const secret = crypto.getRandomValues(new Uint8Array(20));

// 2. 基于时间窗口生成计数器 (10 分钟窗口)
const timeWindow = Math.floor(Date.now() / 600000);

// 3. HMAC-SHA256 计算
const hmac = await crypto.subtle.sign('HMAC', key, timeWindowBytes);

// 4. 动态截断获取 6 位 Base32 码
const code = base32Encode(hmac.slice(0, 5)).toUpperCase().slice(0, 6);

// 5. 计算 Base32Check2 双字符校验和
const checksum = base32Check2(code);

// 6. 最终短码：ABCD12-EF
const shortCode = `${code}-${checksum}`;
```

**存储方案**:
- **短期存储（短码）**: IndexedDB（AES-256 加密）
- **长期存储（设备 ID）**: HttpOnly Cookie（Secure + SameSite=Strict）

**安全机制**:
- **速率限制**: 每 IP 每分钟最多 5 次尝试
- **尝试限制**: 每个短码最多 3 次错误，自动撤销
- **时间容差**: 允许前后 1 个时间窗口（±10 分钟）
- **XSS 防护**: IndexedDB 加密存储 + HttpOnly Cookie
- **CSRF 防护**: SameSite=Strict Cookie + CSRF Token

**Alternatives considered**:
| 方案 | 熵值 | 用户体验 | 安全性 | 结论 |
|------|------|----------|--------|------|
| 6 位数字 | 20 bits | ⭐⭐⭐⭐⭐ | ⭐⭐ | 不推荐 |
| **6 位 Base32 + 校验** | **30 bits** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **推荐** |
| 8 位 Base64 | 48 bits | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 备选 |
| 3 单词组合 | 39 bits | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 备选 |

---

## 6. Cookie 安全实践

### Decision: 分层存储策略

**存储架构**:
```
┌─────────────────────────────────────────┐
│ 应用层数据                               │
├─────────────────────────────────────────┤
│ IndexedDB (加密存储短码映射)             │
│ - AES-256-GCM 加密                       │
│ - 页面关闭后持久化                       │
│ - 自动清理过期数据                       │
├─────────────────────────────────────────┤
│ HttpOnly Cookie (设备 ID)                │
│ - Secure: 仅 HTTPS 传输                  │
│ - SameSite=Strict: 防 CSRF              │
│ - Max-Age: 30 天                        │
└─────────────────────────────────────────┘
```

**Cookie 配置**:
```http
Set-Cookie: paired_device_id=xxx;
            HttpOnly;
            Secure;
            SameSite=Strict;
            Max-Age=2592000;  // 30 天
            Path=/
```

**IndexedDB 加密存储**:
```javascript
// 加密短码存储
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  new TextEncoder().encode(shortCode)
);

await db.put('shortCodes', {
  id: deviceId,
  code: encrypted,
  iv: iv,
  expiresAt: timestamp
});
```

**安全考虑**:
- **不存储短码明文**: Cookie 仅存储设备 ID，短码加密存储在 IndexedDB
- **自动过期清理**: 启动时清理过期短码，定时任务清理服务端数据
- **撤销机制**: 短码撤销后加入黑名单，验证时检查

---

## 技术决策总结

| 领域 | 决策 | 关键参数 |
|------|------|----------|
| **前端框架** | Vue 3 + Vite | ~20KB 运行时 |
| **WebRTC 库** | simple-peer | ~25KB，EventEmitter API |
| **设备发现** | 信令服务器 + WebRTC | WebSocket 转发 SDP |
| **短码生成** | HMAC + Base32 + 校验 | 8 字符，30 bits 熵 |
| **存储方案** | IndexedDB + HttpOnly Cookie | 分层加密存储 |
| **文件传输** | Data Channel | 16 KiB 分块，背压控制 |
| **安全性** | DTLS + 临时凭证 + 速率限制 | 5 分钟过期，3 次尝试 |
| **性能** | 流式读取 + 通道池 | ~16-32KB 恒定内存 |

---

## 下一步行动

1. **Phase 1 设计**: 基于以上技术决策，生成数据模型、接口契约和快速入门指南
2. **架构验证**: 确认技术栈与项目目标一致
3. **原型开发**: 实现最小可行原型（MVP）验证核心功能

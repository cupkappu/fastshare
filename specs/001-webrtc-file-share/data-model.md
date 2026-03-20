# Data Model: WebRTC 文件共享工具

**Version**: 1.0  
**Last Updated**: 2026 年 3 月 19 日  
**Feature**: 001-webrtc-file-share

---

## 核心实体

### 1. Device (设备)

代表一个运行该应用的客户端实例。

**字段**:
| 字段名 | 类型 | 说明 | 验证规则 |
|--------|------|------|----------|
| `deviceId` | string | 设备唯一标识符 | UUID v4，不可变 |
| `displayName` | string | 用户自定义设备名称 | 1-50 字符，可空 |
| `status` | enum | 连接状态 | `online` \| `offline` \| `busy` |
| `lastSeenAt` | timestamp | 最后活跃时间 | 自动更新 |
| `capabilities` | array | 支持的功能列表 | `['file-transfer', 'short-code']` |

**状态转换**:
```
offline ──启动应用──► online
  ▲                       │
  │                       │ 用户开始传输
  │                       ▼
  │                     busy
  │                       │
  │ 传输完成/取消         │
  └───────────────────────┘
```

---

### 2. ShortCode (短码)

用于远程设备连接的临时凭证。

**字段**:
| 字段名 | 类型 | 说明 | 验证规则 |
|--------|------|------|----------|
| `code` | string | 短码本身 | 8 字符 Base32 格式：`XXXXXX-YY` |
| `deviceId` | string | 生成短码的设备 ID | 外键 → Device.deviceId |
| `createdAt` | timestamp | 生成时间 | 自动设置 |
| `expiresAt` | timestamp | 过期时间 | createdAt + 10 分钟 |
| `maxAttempts` | integer | 最大尝试次数 | 默认 3，≥1 |
| `attemptCount` | integer | 已尝试次数 | 默认 0，每次验证 +1 |
| `status` | enum | 短码状态 | `active` \| `used` \| `expired` \| `revoked` |
| `checksum` | string | 校验和 | Base32Check2 双字符 |

**验证规则**:
```javascript
// 短码格式验证
const SHORT_CODE_REGEX = /^[A-Z2-7]{6}-[A-Z2-7]{2}$/;

// 过期检查
function isExpired(shortCode) {
  return Date.now() > shortCode.expiresAt;
}

// 尝试次数检查
function canAttempt(shortCode) {
  return shortCode.attemptCount < shortCode.maxAttempts;
}

// 校验和验证
function verifyChecksum(code) {
  const [data, checksum] = code.split('-');
  return base32Check2Verify(data, checksum);
}
```

**生命周期**:
```
生成 ──► active ──► used (成功连接)
              │
              ├──► expired (超过有效期)
              │
              └──► revoked (用户手动撤销)
```

---

### 3. FileTransferSession (文件传输会话)

代表一次文件传输过程。

**字段**:
| 字段名 | 类型 | 说明 | 验证规则 |
|--------|------|------|----------|
| `sessionId` | string | 会话唯一标识符 | UUID v4 |
| `senderId` | string | 发送方设备 ID | 外键 → Device.deviceId |
| `receiverId` | string | 接收方设备 ID | 外键 → Device.deviceId |
| `files` | array | 文件列表 | 至少 1 个文件 |
| `totalSize` | number | 总文件大小（字节） | ≥1 |
| `status` | enum | 传输状态 | 见下方状态机 |
| `createdAt` | timestamp | 创建时间 | 自动设置 |
| `completedAt` | timestamp | 完成时间 | 可空 |
| `transferredBytes` | number | 已传输字节数 | 0 ≤ transferredBytes ≤ totalSize |
| `currentSpeed` | number | 当前速度（字节/秒） | 实时计算 |
| `error` | object | 错误信息（如有） | `{ code, message }` |

**File 结构**:
```javascript
{
  fileId: string,        // UUID v4
  fileName: string,      // 文件名（含扩展名）
  fileSize: number,      // 文件大小（字节）
  mimeType: string,      // MIME 类型
  sha256: string,        // SHA-256 哈希（传输完成后计算）
  chunks: {
    total: number,       // 总分块数
    size: number,        // 每块大小（16 KiB）
    sent: number,        // 已发送块数
    acked: number        // 已确认块数
  }
}
```

**状态机**:
```
pending ──接收方确认──► transferring ──► completed
   │                           │
   │                           ├──► paused (用户暂停)
   │                           │
   │                           ├──► error (传输失败)
   │                           │
   │                           └──► cancelled (用户取消)
   │
   └──接收方拒绝──► rejected
```

**状态说明**:
- `pending`: 等待接收方确认
- `transferring`: 正在传输文件
- `paused`: 用户暂停传输
- `completed`: 所有文件传输完成
- `error`: 传输过程中发生错误（可重试）
- `cancelled`: 用户主动取消
- `rejected`: 接收方拒绝接收

---

### 4. Connection (连接)

代表两个设备之间的 WebRTC 连接。

**字段**:
| 字段名 | 类型 | 说明 | 验证规则 |
|--------|------|------|----------|
| `connectionId` | string | 连接唯一标识符 | UUID v4 |
| `localDeviceId` | string | 本地设备 ID | 外键 → Device.deviceId |
| `remoteDeviceId` | string | 远程设备 ID | 外键 → Device.deviceId |
| `type` | enum | 连接类型 | `lan` \| `remote` |
| `role` | enum | WebRTC 角色 | `offerer` \| `answerer` |
| `status` | enum | 连接状态 | 见下方状态机 |
| `createdAt` | timestamp | 建立时间 | 自动设置 |
| `lastActivityAt` | timestamp | 最后活动时间 | 每次数据传输更新 |
| `iceCandidates` | array | ICE 候选列表 | `[{ candidate, sdpMid, sdpMLineIndex }]` |
| `dataChannels` | array | DataChannel 信息 | `[{ label, ordered, id }]` |

**状态机**:
```
new ──创建 offer/answer──► connecting ──ICE 连接成功──► connected
                                    │
                                    ├──► failed (连接失败)
                                    │
                                    └──► closed (用户关闭)
```

**连接类型说明**:
- `lan`: 局域网连接（同一 WiFi 网络）
- `remote`: 远程连接（通过短码配对）

---

### 5. PairedDevice (配对设备)

存储用户配对过的远程设备信息（用于自动重连）。

**字段**:
| 字段名 | 类型 | 说明 | 验证规则 |
|--------|------|------|----------|
| `id` | string | 记录唯一标识符 | UUID v4 |
| `localDeviceId` | string | 本地设备 ID | 外键 → Device.deviceId |
| `remoteDeviceId` | string | 远程设备 ID | 外键 → Device.deviceId |
| `remoteDeviceName` | string | 远程设备名称 | 用户自定义 |
| `shortCode` | string | 最后一次使用的短码 | 加密存储 |
| `lastConnectedAt` | timestamp | 最后连接时间 | 自动更新 |
| `autoConnect` | boolean | 是否自动连接 | 默认 true |
| `expiresAt` | timestamp | 配对过期时间 | lastConnectedAt + 30 天 |

**存储位置**:
- `shortCode`: IndexedDB（AES-256 加密）
- 其他字段：应用层状态管理（Vue Reactives）

---

## 实体关系图

```
┌─────────────┐
│   Device    │
└──────┬──────┘
       │
       │ 1:N
       │
       ▼
┌─────────────┐         1:1         ┌─────────────┐
│ ShortCode   │ ◄─────────────────► │  Connection │
└─────────────┘                     └─────────────┘
       ▲                                   │
       │                                   │ N:M
       │ 1:N                               │
       │                                   ▼
┌─────────────┐                     ┌─────────────┐
│   Device    │                     │    File     │
│ (receiver)  │                     │ Transfer    │
└─────────────┘                     │   Session   │
       ▲                            └─────────────┘
       │                                   ▲
       │ N:1                               │
       │                                   │ N:1
       │                                   ▼
┌─────────────┐                     ┌─────────────┐
│   Device    │                     │   Paired    │
│  (sender)   │                     │   Device    │
└─────────────┘                     └─────────────┘
```

---

## 验证规则汇总

### 短码验证
```javascript
function validateShortCode(code) {
  // 格式验证
  if (!/^[A-Z2-7]{6}-[A-Z2-7]{2}$/.test(code)) {
    return { valid: false, error: 'Invalid format' };
  }
  
  // 校验和验证
  const [data, checksum] = code.split('-');
  if (!base32Check2Verify(data, checksum)) {
    return { valid: false, error: 'Invalid checksum' };
  }
  
  // 过期验证
  if (Date.now() > shortCode.expiresAt) {
    return { valid: false, error: 'Code expired' };
  }
  
  // 尝试次数验证
  if (shortCode.attemptCount >= shortCode.maxAttempts) {
    return { valid: false, error: 'Max attempts reached' };
  }
  
  // 状态验证
  if (shortCode.status !== 'active') {
    return { valid: false, error: 'Code not active' };
  }
  
  return { valid: true };
}
```

### 文件传输验证
```javascript
function validateFileTransfer(files) {
  // 至少一个文件
  if (!files || files.length === 0) {
    return { valid: false, error: 'No files selected' };
  }
  
  // 文件大小限制（可选，如单文件最大 2GB）
  const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File too large: ${file.name}` };
    }
    if (file.size === 0) {
      return { valid: false, error: `Empty file: ${file.name}` };
    }
  }
  
  // 总大小限制（可选）
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
  if (totalSize > MAX_TOTAL_SIZE) {
    return { valid: false, error: 'Total size exceeds limit' };
  }
  
  return { valid: true };
}
```

---

## 状态管理设计

### Vue 3 Reactives
```javascript
// stores/connection.js
import { reactive, computed } from 'vue'

export const connectionStore = reactive({
  // 当前设备
  localDevice: null,
  
  // 已发现的设备列表
  discoveredDevices: [],
  
  // 当前连接
  activeConnection: null,
  
  // 配对设备列表（用于自动重连）
  pairedDevices: [],
  
  // 当前传输会话
  activeSession: null,
  
  // 历史传输记录
  transferHistory: [],
  
  // 计算属性
  isConnected: computed(() => !!connectionStore.activeConnection),
  isTransferring: computed(() => 
    connectionStore.activeSession?.status === 'transferring'
  ),
  canAutoConnect: computed(() => 
    connectionStore.pairedDevices.some(d => d.autoConnect && d.expiresAt > Date.now())
  )
})
```

---

## 索引设计

### IndexedDB Schema
```javascript
const dbSchema = {
  name: 'fastshare',
  version: 1,
  stores: [
    {
      name: 'shortCodes',
      keyPath: 'id',
      indexes: [
        { name: 'code', keyPath: 'code', unique: true },
        { name: 'deviceId', keyPath: 'deviceId' },
        { name: 'expiresAt', keyPath: 'expiresAt' }
      ]
    },
    {
      name: 'pairedDevices',
      keyPath: 'id',
      indexes: [
        { name: 'localDeviceId', keyPath: 'localDeviceId' },
        { name: 'remoteDeviceId', keyPath: 'remoteDeviceId' },
        { name: 'lastConnectedAt', keyPath: 'lastConnectedAt' },
        { name: 'expiresAt', keyPath: 'expiresAt' }
      ]
    },
    {
      name: 'transferHistory',
      keyPath: 'sessionId',
      indexes: [
        { name: 'senderId', keyPath: 'senderId' },
        { name: 'receiverId', keyPath: 'receiverId' },
        { name: 'createdAt', keyPath: 'createdAt' }
      ]
    }
  ]
}
```

---

## 变更日志

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2026-03-19 | 初始版本，基于功能规范定义核心实体 |

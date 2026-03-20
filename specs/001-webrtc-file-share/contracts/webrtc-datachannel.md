# WebRTC DataChannel Protocol Contract

**Version**: 1.0  
**Last Updated**: 2026 年 3 月 19 日  
**Protocol**: WebRTC DataChannel (SCTP over DTLS)

---

## 概述

WebRTC DataChannel 用于设备间的 P2P 文件传输。本契约定义应用层消息格式和传输协议。

---

## 通道配置

### 控制通道 (Control Channel)

用于传输控制信令和元数据。

```javascript
const controlChannel = peerConnection.createDataChannel('control', {
  ordered: true,           // 有序传输
  protocol: 'json'         // JSON 格式
})
```

### 文件传输通道 (File Transfer Channel)

用于传输文件数据。

```javascript
const fileChannel = peerConnection.createDataChannel('file', {
  ordered: true,           // 有序传输
  maxPacketLifeTime: null, // 可靠传输
  maxRetransmits: null     // 无限重传
})
```

---

## 消息格式

所有控制消息使用 JSON 格式，通过控制通道传输。

### 通用消息结构

```typescript
interface ControlMessage {
  type: string      // 消息类型
  version: number   // 协议版本，默认 1
  payload: object   // 消息载荷
}
```

---

## 控制消息类型

### 1. File Meta (文件元数据)

发送文件前发送元数据。

**Schema**:
```typescript
{
  type: 'file-meta',
  payload: {
    sessionId: string,     // 会话 ID (UUID v4)
    fileId: string,        // 文件 ID (UUID v4)
    fileName: string,      // 文件名（含扩展名）
    fileSize: number,      // 文件大小（字节）
    mimeType: string,      // MIME 类型
    totalChunks: number,   // 总分块数
    sha256?: string,       // SHA-256 哈希（可选，传输完成后验证）
    chunkSize: number      // 每块大小（字节），默认 16384 (16 KiB)
  }
}
```

**示例**:
```json
{
  "type": "file-meta",
  "version": 1,
  "payload": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "fileId": "660e8400-e29b-41d4-a716-446655440001",
    "fileName": "presentation.pdf",
    "fileSize": 2097152,
    "mimeType": "application/pdf",
    "totalChunks": 128,
    "chunkSize": 16384
  }
}
```

**响应**: `ack` 或 `reject`

---

### 2. File Chunk (文件分块)

发送文件数据分块。

**Schema**:
```typescript
{
  type: 'file-chunk',
  payload: {
    sessionId: string,     // 会话 ID
    fileId: string,        // 文件 ID
    seq: number,           // 分块序号（从 0 开始）
    totalChunks: number,   // 总分块数
    offset: number,        // 字节偏移量
    size: number           // 本块大小（字节）
  }
}
// 紧随其后发送 ArrayBuffer 数据
```

**示例**:
```javascript
// 发送 JSON 消息
controlChannel.send(JSON.stringify({
  type: 'file-chunk',
  payload: {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    fileId: '660e8400-e29b-41d4-a716-446655440001',
    seq: 0,
    totalChunks: 128,
    offset: 0,
    size: 16384
  }
}))

// 发送二进制数据
fileChannel.send(arrayBuffer)
```

**响应**: `chunk-ack` 或 `retransmit-request`

---

### 3. File End (文件传输结束)

通知接收方文件传输完成。

**Schema**:
```typescript
{
  type: 'file-end',
  payload: {
    sessionId: string,
    fileId: string,
    sha256: string       // SHA-256 哈希
  }
}
```

**响应**: `transfer-complete` 或 `transfer-failed`

---

### 4. Ack (确认)

通用确认消息。

**Schema**:
```typescript
{
  type: 'ack',
  payload: {
    originalType: string,  // 原消息类型
    id: string            // 原消息 ID（如 fileId, sessionId）
  }
}
```

**示例**:
```json
{
  "type": "ack",
  "version": 1,
  "payload": {
    "originalType": "file-meta",
    "id": "660e8400-e29b-41d4-a716-446655440001"
  }
}
```

---

### 5. Chunk Ack (分块确认)

确认收到文件分块。

**Schema**:
```typescript
{
  type: 'chunk-ack',
  payload: {
    sessionId: string,
    fileId: string,
    seq: number,         // 确认的分块序号
    received: number     // 累计已收到分块数
  }
}
```

---

### 6. Retransmit Request (重传请求)

请求重传丢失的分块。

**Schema**:
```typescript
{
  type: 'retransmit-request',
  payload: {
    sessionId: string,
    fileId: string,
    missingSeqs: number[]  // 缺失的分块序号列表
  }
}
```

**示例**:
```json
{
  "type": "retransmit-request",
  "version": 1,
  "payload": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "fileId": "660e8400-e29b-41d4-a716-446655440001",
    "missingSeqs": [5, 12, 23]
  }
}
```

**响应**: 重新发送对应的 `file-chunk`

---

### 7. Transfer Complete (传输完成)

接收方确认所有文件传输完成。

**Schema**:
```typescript
{
  type: 'transfer-complete',
  payload: {
    sessionId: string,
    fileId: string,
    sha256Match: boolean  // SHA-256 哈希是否匹配
  }
}
```

---

### 8. Transfer Failed (传输失败)

通知传输失败。

**Schema**:
```typescript
{
  type: 'transfer-failed',
  payload: {
    sessionId: string,
    fileId: string,
    reason: string,      // 失败原因
    error?: {
      code: string,
      message: string
    }
  }
}
```

**失败原因**:
- `CHECKSUM_MISMATCH`: 校验和不匹配
- `INCOMPLETE_TRANSFER`: 传输不完整
- `STORAGE_ERROR`: 存储错误
- `USER_CANCELLED`: 用户取消
- `CONNECTION_LOST`: 连接丢失

---

### 9. Progress Update (进度更新)

发送传输进度更新（可选，用于实时显示）。

**Schema**:
```typescript
{
  type: 'progress-update',
  payload: {
    sessionId: string,
    fileId: string,
    transferredBytes: number,
    totalBytes: number,
    currentSpeed: number,  // 字节/秒
    eta: number           // 预计剩余时间（秒）
  }
}
```

---

### 10. Pause (暂停传输)

请求暂停传输。

**Schema**:
```typescript
{
  type: 'pause',
  payload: {
    sessionId: string
  }
}
```

**响应**: `paused` 或 `error`

---

### 11. Resume (恢复传输)

请求恢复传输。

**Schema**:
```typescript
{
  type: 'resume',
  payload: {
    sessionId: string,
    fromSeq: number  // 从哪个分块继续
  }
}
```

**响应**: `resumed` 或 `error`

---

### 12. Cancel (取消传输)

取消当前传输。

**Schema**:
```typescript
{
  type: 'cancel',
  payload: {
    sessionId: string,
    reason: string
  }
}
```

**响应**: `cancelled`

---

### 13. Reject (拒绝接收)

拒绝接收文件。

**Schema**:
```typescript
{
  type: 'reject',
  payload: {
    fileId: string,
    reason: string
  }
}
```

**拒绝原因**:
- `INSUFFICIENT_STORAGE`: 存储空间不足
- `UNSUPPORTED_TYPE`: 不支持的文件类型
- `FILE_TOO_LARGE`: 文件过大
- `USER_REJECTED`: 用户拒绝

---

### 14. Heartbeat (心跳)

保持连接活跃。

**Schema**:
```typescript
{
  type: 'heartbeat',
  payload: {
    timestamp: number
  }
}
```

**响应**: `heartbeat-ack`

---

## 传输流程

### 完整文件传输流程

```
发送方                              接收方
   │                                   │
   │────── file-meta ─────────────────>│
   │                                   │ 验证元数据
   │<───────── ack ────────────────────│
   │                                   │
   │────── file-chunk (seq=0) ────────>│
   │────── ArrayBuffer ───────────────>│
   │                                   │ 写入磁盘
   │<────── chunk-ack ─────────────────│
   │                                   │
   │────── file-chunk (seq=1) ────────>│
   │────── ArrayBuffer ───────────────>│
   │                                   │
   │              ...                  │
   │                                   │
   │────── file-end ──────────────────>│
   │                                   │ 验证 SHA-256
   │<────── transfer-complete ─────────│
   │                                   │
```

### 断点续传流程

```
发送方                              接收方
   │                                   │
   │────── file-meta ─────────────────>│
   │                                   │ 检查已有文件
   │<───────── ack ────────────────────│
   │                                   │
   │────── file-chunk (seq=0..4) ─────>│
   │                                   │
   │              ⚡ 连接中断            │
   │                                   │
   │         🔁 重新连接                │
   │                                   │
   │────── file-meta ─────────────────>│
   │                                   │ 检查已接收分块
   │<────── retransmit-request ────────│ missingSeqs: [5, 12]
   │                                   │
   │────── file-chunk (seq=5) ────────>│
   │────── file-chunk (seq=12) ───────>│
   │                                   │
   │────── file-end ──────────────────>│
   │<────── transfer-complete ─────────│
   │                                   │
```

---

## 背压控制

### 发送方背压控制

```javascript
const BUFFER_THRESHOLD = 32 * 1024 // 32 KiB

async function sendWithBackpressure(channel, data) {
  // 检查缓冲区
  if (channel.bufferedAmount > BUFFER_THRESHOLD) {
    // 等待缓冲区排空
    await new Promise(resolve => {
      channel.onbufferedamountlow = resolve
    })
  }
  
  channel.send(data)
}
```

### 接收方流控

```javascript
const RECEIVE_BUFFER_SIZE = 64 * 1024 // 64 KiB

fileChannel.onmessage = async (event) => {
  if (event.data instanceof ArrayBuffer) {
    // 写入磁盘（避免内存溢出）
    await writeToFileStream(event.data)
    
    // 发送确认
    sendChunkAck()
  }
}
```

---

## 错误处理

### 发送方错误处理

```javascript
fileChannel.onerror = (error) => {
  console.error('File channel error:', error)
  
  // 发送错误通知
  controlChannel.send(JSON.stringify({
    type: 'transfer-failed',
    payload: {
      sessionId: currentSessionId,
      fileId: currentFileId,
      reason: 'CONNECTION_ERROR',
      error: {
        code: 'CHANNEL_ERROR',
        message: error.message
      }
    }
  }))
}
```

### 接收方错误处理

```javascript
fileChannel.onclose = () => {
  if (!transferComplete) {
    // 传输未完成，连接关闭
    console.error('Connection closed prematurely')
    
    // 保存进度以便续传
    saveTransferProgress()
  }
}
```

---

## 性能优化

### 1. 分块大小优化

```javascript
// 根据网络状况动态调整分块大小
function adjustChunkSize(rtt, lossRate) {
  if (rtt < 50 && lossRate < 0.01) {
    return 32 * 1024 // 高速网络用大块
  } else if (rtt > 200 || lossRate > 0.05) {
    return 8 * 1024  // 低速网络用小块
  }
  return 16 * 1024   // 默认
}
```

### 2. 并发传输

```javascript
// 使用多个 DataChannel 并发传输
const channels = []
for (let i = 0; i < 4; i++) {
  channels.push(pc.createDataChannel(`file-${i}`, {
    ordered: true
  }))
}

// 轮询分配文件到不同通道
function sendFile(file) {
  const channel = channels[fileIndex % channels.length]
  sendOnChannel(channel, file)
}
```

### 3. 进度计算

```javascript
let lastUpdateTime = Date.now()
let lastTransferredBytes = 0

function updateProgress(transferredBytes, totalBytes) {
  const now = Date.now()
  const delta = now - lastUpdateTime
  const deltaBytes = transferredBytes - lastTransferredBytes
  
  const speed = deltaBytes / (delta / 1000) // 字节/秒
  const eta = (totalBytes - transferredBytes) / speed // 秒
  
  // 发送进度更新
  sendProgressUpdate(transferredBytes, totalBytes, speed, eta)
  
  lastUpdateTime = now
  lastTransferredBytes = transferredBytes
}
```

---

## 安全考虑

1. **DTLS 加密**: WebRTC 强制使用 DTLS 加密传输
2. **完整性验证**: 使用 SHA-256 验证文件完整性
3. **身份验证**: 通过短码验证建立连接的身份
4. **速率限制**: 防止恶意大文件传输

---

## 变更日志

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2026-03-19 | 初始版本 |

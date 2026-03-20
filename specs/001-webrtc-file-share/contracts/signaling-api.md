# Signaling Server API Contract

**Version**: 1.0  
**Last Updated**: 2026 年 3 月 19 日  
**Protocol**: WebSocket

---

## 概述

信令服务器用于设备发现和 WebRTC 信令交换（SDP offer/answer、ICE 候选）。文件传输通过 WebRTC DataChannel 直接 P2P 进行，不经过信令服务器。

---

## 连接建立

### WebSocket 连接

```
URL: ws://{host}:{port}/signal
协议：WebSocket
认证：无（可选：JWT Token）
```

**连接示例**:
```javascript
const ws = new WebSocket('ws://localhost:8080/signal')

ws.onopen = () => {
  console.log('Connected to signaling server')
  // 发送注册消息
  ws.send(JSON.stringify({
    type: 'register',
    payload: {
      deviceId: 'xxx',
      displayName: 'My Device'
    }
  }))
}
```

---

## 客户端 → 服务器消息

### 1. Register (设备注册)

注册设备到信令服务器。

**Schema**:
```typescript
{
  type: 'register',
  payload: {
    deviceId: string,      // UUID v4
    displayName?: string,  // 可选，1-50 字符
    capabilities?: string[] // 可选，['file-transfer', 'short-code']
  }
}
```

**示例**:
```json
{
  "type": "register",
  "payload": {
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "displayName": "John's MacBook",
    "capabilities": ["file-transfer", "short-code"]
  }
}
```

**响应**: `register-ack` 或 `error`

---

### 2. Discover (发现设备)

请求当前可用的设备列表。

**Schema**:
```typescript
{
  type: 'discover',
  payload?: {}
}
```

**示例**:
```json
{
  "type": "discover"
}
```

**响应**: `device-list`

---

### 3. Offer (创建连接请求)

向目标设备发送 WebRTC offer。

**Schema**:
```typescript
{
  type: 'offer',
  payload: {
    from: string,      // 发送方设备 ID
    to: string,        // 接收方设备 ID
    sdp: RTCSessionDescriptionInit,
    shortCode?: string // 可选，远程连接时使用
  }
}
```

**示例**:
```json
{
  "type": "offer",
  "payload": {
    "from": "550e8400-e29b-41d4-a716-446655440000",
    "to": "660e8400-e29b-41d4-a716-446655440001",
    "sdp": {
      "type": "offer",
      "sdp": "v=0\r\no=- ..."
    },
    "shortCode": "ABCD12-EF"
  }
}
```

**响应**: `offer-forwarded` 或 `error`

---

### 4. Answer (响应连接请求)

响应收到的 WebRTC offer。

**Schema**:
```typescript
{
  type: 'answer',
  payload: {
    from: string,      // 接收方设备 ID
    to: string,        // 发送方设备 ID
    sdp: RTCSessionDescriptionInit
  }
}
```

**示例**:
```json
{
  "type": "answer",
  "payload": {
    "from": "660e8400-e29b-41d4-a716-446655440001",
    "to": "550e8400-e29b-41d4-a716-446655440000",
    "sdp": {
      "type": "answer",
      "sdp": "v=0\r\no=- ..."
    }
  }
}
```

**响应**: `answer-forwarded` 或 `error`

---

### 5. ICE Candidate (交换 ICE 候选)

发送 ICE 候选给对端。

**Schema**:
```typescript
{
  type: 'ice-candidate',
  payload: {
    from: string,
    to: string,
    candidate: RTCIceCandidateInit
  }
}
```

**示例**:
```json
{
  "type": "ice-candidate",
  "payload": {
    "from": "550e8400-e29b-41d4-a716-446655440000",
    "to": "660e8400-e29b-41d4-a716-446655440001",
    "candidate": {
      "candidate": "candidate:1 1 UDP 1234567890 192.168.1.100 54321 typ host",
      "sdpMid": "0",
      "sdpMLineIndex": 0
    }
  }
}
```

**响应**: `ice-candidate-forwarded` 或 `error`

---

### 6. Generate Short Code (生成短码)

请求生成一个新的短码。

**Schema**:
```typescript
{
  type: 'generate-short-code',
  payload: {
    deviceId: string,
    expiresIn?: number  // 可选，过期时间（秒），默认 600
  }
}
```

**示例**:
```json
{
  "type": "generate-short-code",
  "payload": {
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "expiresIn": 600
  }
}
```

**响应**: `short-code-generated`

---

### 7. Verify Short Code (验证短码)

验证短码是否有效。

**Schema**:
```typescript
{
  type: 'verify-short-code',
  payload: {
    shortCode: string
  }
}
```

**示例**:
```json
{
  "type": "verify-short-code",
  "payload": {
    "shortCode": "ABCD12-EF"
  }
}
```

**响应**: `short-code-verified` 或 `error`

---

### 8. Revoke Short Code (撤销短码)

手动撤销一个短码。

**Schema**:
```typescript
{
  type: 'revoke-short-code',
  payload: {
    shortCode: string
  }
}
```

**响应**: `short-code-revoked` 或 `error`

---

### 9. Heartbeat (心跳)

保持连接活跃。

**Schema**:
```typescript
{
  type: 'heartbeat',
  payload?: {}
}
```

**响应**: `heartbeat-ack`

---

## 服务器 → 客户端消息

### 1. Register Ack (注册确认)

确认设备注册成功。

**Schema**:
```typescript
{
  type: 'register-ack',
  payload: {
    deviceId: string,
    timestamp: number
  }
}
```

**示例**:
```json
{
  "type": "register-ack",
  "payload": {
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": 1710864000000
  }
}
```

---

### 2. Device List (设备列表)

返回当前可用的设备列表。

**Schema**:
```typescript
{
  type: 'device-list',
  payload: {
    devices: Array<{
      deviceId: string,
      displayName?: string,
      status: 'online' | 'busy',
      lastSeenAt: number
    }>
  }
}
```

**示例**:
```json
{
  "type": "device-list",
  "payload": {
    "devices": [
      {
        "deviceId": "550e8400-e29b-41d4-a716-446655440000",
        "displayName": "John's MacBook",
        "status": "online",
        "lastSeenAt": 1710864000000
      }
    ]
  }
}
```

---

### 3. Offer Forwarded (Offer 已转发)

通知发送方 offer 已转发给接收方。

**Schema**:
```typescript
{
  type: 'offer-forwarded',
  payload: {
    from: string,
    to: string
  }
}
```

---

### 4. Answer Forwarded (Answer 已转发)

通知发送方 answer 已转发。

**Schema**:
```typescript
{
  type: 'answer-forwarded',
  payload: {
    from: string,
    to: string
  }
}
```

---

### 5. ICE Candidate Forwarded (ICE 候选已转发)

通知发送方 ICE 候选已转发。

**Schema**:
```typescript
{
  type: 'ice-candidate-forwarded',
  payload: {
    from: string,
    to: string
  }
}
```

---

### 6. Short Code Generated (短码已生成)

返回生成的短码。

**Schema**:
```typescript
{
  type: 'short-code-generated',
  payload: {
    shortCode: string,
    expiresAt: number,
    deviceId: string
  }
}
```

**示例**:
```json
{
  "type": "short-code-generated",
  "payload": {
    "shortCode": "ABCD12-EF",
    "expiresAt": 1710864600000,
    "deviceId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

### 7. Short Code Verified (短码已验证)

短码验证成功，返回目标设备信息。

**Schema**:
```typescript
{
  type: 'short-code-verified',
  payload: {
    shortCode: string,
    deviceId: string,
    displayName?: string
  }
}
```

---

### 8. Short Code Revoked (短码已撤销)

确认短码已撤销。

**Schema**:
```typescript
{
  type: 'short-code-revoked',
  payload: {
    shortCode: string
  }
}
```

---

### 9. Device Join (设备加入)

广播新设备加入网络。

**Schema**:
```typescript
{
  type: 'device-join',
  payload: {
    deviceId: string,
    displayName?: string
  }
}
```

---

### 10. Device Leave (设备离开)

广播设备离开网络。

**Schema**:
```typescript
{
  type: 'device-leave',
  payload: {
    deviceId: string
  }
}
```

---

### 11. Heartbeat Ack (心跳确认)

确认心跳收到。

**Schema**:
```typescript
{
  type: 'heartbeat-ack',
  payload: {
    timestamp: number
  }
}
```

---

### 12. Error (错误)

发生错误时发送。

**Schema**:
```typescript
{
  type: 'error',
  payload: {
    code: string,
    message: string,
    originalType?: string  // 原始请求类型
  }
}
```

**错误码**:
| 错误码 | 说明 |
|--------|------|
| `INVALID_FORMAT` | 消息格式错误 |
| `DEVICE_NOT_FOUND` | 目标设备不存在 |
| `SHORT_CODE_INVALID` | 短码格式错误 |
| `SHORT_CODE_EXPIRED` | 短码已过期 |
| `SHORT_CODE_REVOKED` | 短码已撤销 |
| `MAX_ATTEMPTS_REACHED` | 超过最大尝试次数 |
| `RATE_LIMITED` | 请求频率过高 |
| `SERVER_ERROR` | 服务器内部错误 |

**示例**:
```json
{
  "type": "error",
  "payload": {
    "code": "SHORT_CODE_EXPIRED",
    "message": "The short code has expired",
    "originalType": "verify-short-code"
  }
}
```

---

## 错误处理

### 客户端错误处理

```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  
  if (message.type === 'error') {
    handleError(message.payload)
    return
  }
  
  // 处理正常消息
  handleMessage(message)
}

function handleError(error) {
  console.error(`Error ${error.code}: ${error.message}`)
  
  switch (error.code) {
    case 'SHORT_CODE_EXPIRED':
      // 提示用户短码过期，请求重新生成
      break
    case 'DEVICE_NOT_FOUND':
      // 目标设备离线
      break
    case 'RATE_LIMITED':
      // 等待后重试
      break
  }
}
```

### 服务端错误处理

```javascript
function handleMessage(ws, message) {
  try {
    // 验证消息格式
    const validated = validateMessage(message)
    
    // 处理消息
    processMessage(validated)
  } catch (error) {
    // 发送错误响应
    ws.send(JSON.stringify({
      type: 'error',
      payload: {
        code: error.code || 'SERVER_ERROR',
        message: error.message,
        originalType: message.type
      }
    }))
  }
}
```

---

## 速率限制

| 操作 | 限制 |
|------|------|
| 注册 | 10 次/分钟 |
| 发现设备 | 30 次/分钟 |
| 发送 Offer | 10 次/分钟 |
| 生成短码 | 5 次/分钟 |
| 验证短码 | 5 次/分钟 |
| 心跳 | 60 次/分钟 |

---

## 安全考虑

1. **认证**: 可选 JWT Token 认证（生产环境推荐）
2. **授权**: 仅允许注册设备发送消息
3. **输入验证**: 所有输入必须验证格式和范围
4. **速率限制**: 防止 DDoS 攻击
5. **日志记录**: 记录所有操作便于审计

---

## 变更日志

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2026-03-19 | 初始版本 |

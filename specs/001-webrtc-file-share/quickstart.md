# Quick Start: WebRTC 文件共享工具

**Project**: FastShare  
**Version**: 0.1.0  
**Last Updated**: 2026 年 3 月 19 日

---

## 项目概述

FastShare 是一个类似 LocalSend 的文件共享工具，支持：
- **局域网内**：自动发现设备并传输文件
- **远程连接**：通过短码配对，跨网络传输文件
- **自动重连**：短码存储在 cookie 中，下次自动连接

---

## 快速开始

### 1. 环境要求

- **Node.js**: v20+ 
- **npm**: v10+ 或 yarn v1.22+
- **浏览器**: Chrome/Firefox/Safari/Edge（最新版）

### 2. 安装依赖

```bash
npm install
```

### 3. 开发模式

```bash
# 启动开发服务器（前端）
npm run dev

# 启动信令服务器（后端）
npm run server
```

访问 `http://localhost:5173`（Vite 默认端口）

### 4. 生产构建

```bash
# 构建前端
npm run build

# 构建结果在 dist/ 目录
```

---

## 核心功能使用

### 场景 1: 局域网文件传输

**发送方**:
1. 打开应用，自动发现同一 WiFi 下的设备
2. 在设备列表中点击目标设备
3. 选择要传输的文件
4. 等待接收方确认
5. 查看传输进度

**接收方**:
1. 打开应用，显示为"可接收"状态
2. 收到传输请求弹窗
3. 点击"接收"或"拒绝"
4. 文件保存到下载目录

### 场景 2: 远程设备连接

**接收方（生成短码）**:
1. 点击"生成短码"按钮
2. 显示 8 位短码（如 `ABCD12-EF`）
3. 将短码发送给发送方（通过聊天工具等）
4. 等待连接请求

**发送方（输入短码）**:
1. 点击"远程连接"按钮
2. 输入接收方提供的短码
3. 点击"连接"
4. 连接成功后，选择文件并发送

**自动重连**:
- 下次打开应用时，自动从 cookie 读取短码并尝试连接
- 如需取消自动连接，点击"清除配对记录"

### 场景 3: 短码管理

**刷新短码**:
- 点击"刷新"按钮生成新短码
- 旧短码立即失效

**撤销短码**:
- 点击"撤销"按钮
- 短码失效，但已建立的连接不受影响

**查看有效期**:
- 短码下方显示倒计时（默认 10 分钟）
- 过期后自动失效

---

## 技术架构

### 前端技术栈

- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite 8
- **WebRTC 库**: simple-peer
- **状态管理**: Vue Reactives
- **存储**: IndexedDB + Cookie

### 后端服务

- **信令服务器**: Node.js + WebSocket (ws)
- **功能**: 设备发现、SDP 交换、短码验证
- **部署**: 可选项，纯局域网场景不需要

### 通信协议

```
┌──────────┐    WebSocket     ┌──────────┐
│  浏览器   │ ◄──────────────► │ 信令服务器 │
│ (前端)    │   (SDP/ICE)      │ (可选)    │
└────┬─────┘                  └──────────┘
     │
     │ WebRTC DataChannel (P2P)
     │ 文件直连，不经过服务器
     │
     ▼
┌──────────┐
│  浏览器   │
│ (对端)    │
└──────────┘
```

---

## 项目结构

```
fastshare/
├── src/
│   ├── components/        # UI 组件
│   │   ├── DeviceList.vue
│   │   ├── FileSelector.vue
│   │   ├── ShortCodeInput.vue
│   │   └── TransferProgress.vue
│   ├── services/          # 核心服务
│   │   ├── webrtc.js      # WebRTC 连接管理
│   │   ├── discovery.js   # 设备发现
│   │   ├── short-code.js  # 短码生成与验证
│   │   └── transfer.js    # 文件传输
│   ├── stores/            # 状态管理
│   │   ├── connection.js
│   │   └── transfer.js
│   ├── utils/             # 工具函数
│   │   ├── crypto.js      # 加密相关
│   │   ├── storage.js     # 存储相关
│   │   └── validation.js  # 验证相关
│   ├── App.vue
│   └── main.js
├── server/                # 信令服务器（可选）
│   ├── index.js
│   └── handlers.js
├── specs/
│   └── 001-webrtc-file-share/
│       ├── spec.md        # 功能规范
│       ├── plan.md        # 实现计划
│       ├── research.md    # 技术调研
│       ├── data-model.md  # 数据模型
│       └── contracts/     # 接口契约
└── package.json
```

---

## 开发指南

### 添加新功能

1. **阅读规范**: 查看 `specs/001-webrtc-file-share/spec.md`
2. **理解数据模型**: 查看 `data-model.md`
3. **实现服务层**: 在 `src/services/` 添加逻辑
4. **创建组件**: 在 `src/components/` 添加 UI
5. **编写测试**: 在 `tests/` 添加单元测试

### 调试技巧

**WebRTC 连接问题**:
```javascript
// 在浏览器控制台查看 WebRTC 统计信息
const pc = new RTCPeerConnection()
pc.getStats().then(stats => {
  stats.forEach(report => {
    console.log(report)
  })
})
```

**查看 IndexedDB 数据**:
```javascript
// 在浏览器控制台
const request = indexedDB.open('fastshare', 1)
request.onsuccess = () => {
  const db = request.result
  const tx = db.transaction('shortCodes', 'readonly')
  tx.objectStore('shortCodes').getAll().onsuccess = (e) => {
    console.log(e.target.result)
  }
}
```

### 常见问题

**Q: 局域网内无法发现设备？**
- 检查是否在同一 WiFi 网络
- 确认信令服务器已启动
- 检查防火墙设置

**Q: 远程连接失败？**
- 确认短码输入正确（注意 0/O、1/I 区分）
- 检查短码是否过期（10 分钟）
- 确认双方网络允许 WebRTC 连接

**Q: 文件传输速度慢？**
- 检查网络带宽
- 确认没有防火墙阻挡
- 查看传输进度中的实时速度

---

## 测试

### 运行测试

```bash
# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# E2E 测试
npm run test:e2e
```

### 测试场景

**单元测试**:
- 短码生成与验证
- 文件分块与重组
- 数据模型验证

**集成测试**:
- WebRTC 连接建立
- 设备发现流程
- 短码配对流程

**E2E 测试**:
- 完整文件传输流程
- 远程连接流程
- 自动重连流程

---

## 部署

### 前端部署

```bash
# 构建
npm run build

# 部署 dist/ 到任意静态托管服务
# - Vercel
# - Netlify
# - GitHub Pages
# - 自有服务器 (Nginx/Apache)
```

### 信令服务器部署

```bash
# 使用 Docker 部署
docker run -d -p 8080:8080 fastshare-signaling

# 或使用 Node.js 直接运行
cd server
node index.js
```

### HTTPS 配置

**生产环境必须使用 HTTPS**（WebRTC 要求）：

```bash
# 使用 Let's Encrypt 获取证书
certbot --nginx -d your-domain.com

# 或使用 Caddy（自动 HTTPS）
caddy reverse-proxy --from your-domain.com --to localhost:8080
```

---

## 下一步

1. **实现 MVP**: 完成 P1 优先级的局域网文件传输功能
2. **添加远程连接**: 实现短码配对和远程传输
3. **优化体验**: 添加自动重连、断点续传等功能
4. **编写测试**: 确保核心功能的测试覆盖率
5. **文档完善**: 更新 API 文档和用户手册

---

## 参考链接

- [功能规范](./spec.md)
- [实现计划](./plan.md)
- [技术调研](./research.md)
- [数据模型](./data-model.md)
- [接口契约](./contracts/)

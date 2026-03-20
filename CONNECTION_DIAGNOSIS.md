# FastShare 连接问题诊断

## 问题：Failed to connect to server

### 可能原因和解决方案

#### 1. 信令服务器未运行

**检查方法**:
```bash
# 检查服务器进程
ps aux | grep "node.*server"

# 或者检查端口
lsof -i :8080
```

**解决方法**:
```bash
cd /Users/kifuko/dev/03-toy-softwares/fastshare
npm run server
```

#### 2. 端口被占用

**检查方法**:
```bash
lsof -i :8080
```

**解决方法**:
```bash
# 杀掉占用端口的进程
kill -9 <PID>

# 或者使用其他端口
PORT=8081 npm run server
```

#### 3. 防火墙阻止

**macOS**:
- 系统偏好设置 → 安全性与隐私 → 防火墙
- 允许 Node.js 接受传入连接

#### 4. WebSocket URL 错误

应用会尝试以下 URL:
1. `ws://localhost:8080/signal`
2. `ws://<当前主机名>:8080/signal`
3. `wss://<当前主机名>:8080/signal`

#### 5. 浏览器限制

某些浏览器可能阻止非 HTTPS 的 WebSocket 连接。

**解决方法**:
- 使用 Chrome/Chromium 浏览器
- 或使用 HTTPS（需要配置 SSL）

## 测试工具

### 1. 使用测试页面

访问：http://localhost:5173/test-ws.html

点击 "Connect" 按钮测试连接。

### 2. 使用命令行测试

```bash
# 运行信令服务器测试
node test-signaling.cjs
```

### 3. 查看日志

```bash
# 查看服务器日志
cat /tmp/server.log

# 查看 Vite 日志
cat /tmp/vite.log
```

## 快速修复步骤

1. **停止所有服务**:
   ```bash
   pkill -f "vite|node.*server"
   ```

2. **清理并重启**:
   ```bash
   cd /Users/kifuko/dev/03-toy-softwares/fastshare
   npm run dev:all
   ```

3. **测试连接**:
   - 打开 http://localhost:5173
   - 查看连接状态指示器
   - 绿色 = 已连接
   - 黄色 = 连接中
   - 红色 = 未连接

## 常见问题

### Q: 看到 "Connecting..." 一直转圈

**A**: 信令服务器可能未运行。执行 `npm run server` 启动。

### Q: 看到 "Disconnected" 红色状态

**A**: 连接失败。检查：
1. 服务器是否运行
2. 端口 8080 是否可用
3. 防火墙设置

### Q: 两个浏览器窗口看不到对方

**A**: 
1. 确保两个窗口都连接到同一个信令服务器
2. 检查连接状态是否为绿色 "Connected"
3. 尝试刷新页面

### Q: 短码连接失败

**A**:
1. 确保短码未过期（10 分钟）
2. 短码区分大小写
3. 确保输入正确的格式（6 位数字或 XXXXXX-YY）

## 联系支持

如果以上方法都不奏效，请提供：
1. 浏览器控制台日志
2. 服务器日志 (`cat /tmp/server.log`)
3. 操作系统版本
4. 浏览器版本

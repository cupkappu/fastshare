# Playwright 调试指南

## 快速开始

### 1. 安装依赖

```bash
npm install
npx playwright install chromium
```

### 2. 启动开发服务器

```bash
# 方式 1: 只启动前端
npm run dev

# 方式 2: 同时启动前端和信令服务器
npm run dev:all
```

### 3. 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npx playwright test tests/e2e/basic.spec.ts

# 只运行 Chromium 测试
npx playwright test --project=chromium

# 调试模式（打开 Playwright Inspector）
npm run test:debug

# 在有头模式下运行（显示浏览器）
npm run test:headed

# 使用 UI 模式
npm run test:ui
```

## 调试模式

### Playwright Inspector

```bash
npx playwright test --debug
```

这会打开 Playwright Inspector，提供：
- 逐步执行测试
- 查看选择器
- 检查 DOM 状态
- 实时编辑测试

### 有头模式

```bash
npx playwright test --headed
```

在真实浏览器中运行测试，可以看到实际页面。

### 追踪查看器

```bash
# 运行测试并记录追踪
npx playwright test --trace on

# 打开追踪查看器
npx playwright show-trace
```

## 测试文件结构

```
tests/
└── e2e/
    ├── basic.spec.ts       # 基础 UI 测试
    └── fastshare.spec.ts   # 完整 E2E 测试
```

## 常见调试场景

### 1. 元素未找到

```typescript
// 添加更详细的日志
console.log('Looking for element...');
await page.waitForSelector('.my-element', { timeout: 10000 });
console.log('Element found!');

// 截图调试
await page.screenshot({ path: 'debug.png' });
```

### 2. 异步操作超时

```typescript
// 增加超时
await page.waitForSelector('.my-element', { timeout: 30000 });

// 或者全局设置
// playwright.config.ts
export default defineConfig({
  timeout: 30000,
  expect: {
    timeout: 10000
  }
});
```

### 3. 网络请求失败

```typescript
// 监听网络请求
page.on('request', request =>
  console.log('>>', request.method(), request.url()));
page.on('response', response =>
  console.log('<<', response.status(), response.url()));
```

### 4. Vue 组件未渲染

确保：
- Vite 开发服务器已启动
- Vue 组件正确导入
- 没有 TypeScript 错误

```bash
# 检查 TypeScript
npm run type-check

# 查看 Vite 日志
cat /tmp/vite.log
```

## Playwright 配置

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
```

## HTML 报告

```bash
# 运行测试并生成 HTML 报告
npx playwright test --reporter=html

# 打开 HTML 报告
npx playwright show-report
```

## 调试技巧

### 1. 使用 `pause()`

```typescript
test('my test', async ({ page }) => {
  await page.goto('/');
  
  // 在这里暂停
  await page.pause();
  
  // 继续执行...
});
```

### 2. 使用 `debug()`

```typescript
import { debug } from '@playwright/test';

test('my test', async ({ page }) => {
  debug();
  // 在 DevTools 中调试
});
```

### 3. 慢动作模式

```bash
# 设置 PWDEBUG 环境变量
PWDEBUG=1 npx playwright test
```

## 故障排除

### 问题：测试超时

**解决方案**：
1. 检查开发服务器是否运行
2. 增加超时时间
3. 检查是否有无限加载状态

### 问题：元素选择器不匹配

**解决方案**：
1. 使用 `page.pause()` 检查 DOM
2. 使用 DevTools 检查实际类名
3. 使用更具体的选择器

### 问题：Vue 组件未加载

**解决方案**：
1. 检查浏览器控制台错误
2. 确保所有导入路径正确
3. 运行 `npm run type-check`

### 问题：WebRTC 连接失败

**解决方案**：
1. 确保信令服务器运行
2. 检查防火墙设置
3. 使用 `--headed` 模式查看实际连接状态

## 测试示例

### 基础测试

```typescript
import { test, expect } from '@playwright/test';

test('should load app', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('FastShare');
});
```

### 多浏览器测试

```typescript
test('should work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
```

### 文件上传测试

```typescript
test('should handle file upload', async ({ page }) => {
  await page.goto('/');
  
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test content')
  });
});
```

## 资源

- [Playwright 官方文档](https://playwright.dev)
- [Playwright 测试组件](https://playwright.dev/docs/test-components)
- [Playwright 追踪查看器](https://playwright.dev/docs/trace-viewer)

# DeepSeek Chat

[English](README.md) | 简体中文

基于 DeepSeek API 的静态聊天示例。无需应用后端，浏览器直接请求配置的 API 服务。

点击 [在线体验](https://deepseek-ai.github.io/chat-demo/) 即可使用，也可以前往 [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases) 下载压缩包，解压后双击 `index.html` 在本地使用，无需安装或构建。首次使用时，请在设置中填写 API Key。

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

Windows 上还可以直接双击仓库根目录的 `start.bat` 一键启动：脚本会检查 Node.js 与 pnpm、按需安装依赖、启动开发服务器，并在服务就绪后自动打开浏览器。默认端口 8090 被占用时会自动向后顺延。

```powershell
# 可选参数：起始端口 -Port、只启动不打开浏览器 -NoBrowser
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -Port 9000 -NoBrowser
```

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。

## 功能

- 多会话、自动标题、重命名与删除；就地编辑提问、编辑助手的思考与回答、重新生成、切换消息分支，以及从任意消息分支出新会话。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 会话级生成参数（思考强度、温度、Top P、最大输出、停止序列）：设置 → 模型参数保存新对话的默认值，输入框的「会话设置」入口按会话覆盖或恢复默认，新对话页面也能在发出第一条消息前预设。
- 会话级系统提示词：同一个「会话设置」入口里可以替换内置提示词，留空即使用默认提示词。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 数据

API Key 和设置保存在浏览器 localStorage，会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 开发

| 命令          | 用途                |
| ------------- | ------------------- |
| `pnpm dev`    | 启动开发服务器      |
| `pnpm build`  | 构建到 `dist/`      |
| `pnpm type`   | TypeScript 类型检查 |
| `pnpm lint`   | oxlint 检查         |
| `pnpm format` | oxfmt 格式化        |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`。`createConfig({ apiOrigin, devServer })` 支持自定义 API 地址和开发服务器代理。

聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    platform/          原生壳适配（返回键、文件分享）
    speech/            录音与朗读
  utils/               通用工具
```

## 安卓应用

仓库带一套 [Capacitor](capacitor.config.ts) 壳（`android/`）与 GitHub Actions 构建流程，产物是可直接侧载的 APK。

```bash
pnpm build                 # 构建网页产物到 dist/
pnpm android:sync          # 复制到 android/app/src/main/assets
cd android && ./gradlew assembleRelease
```

推送 `main` 时 [android.yml](.github/workflows/android.yml) 会自动构建 APK 并作为 artifact 上传；打 `v*` 标签时会额外挂到 GitHub Release 上，方便直接下载安装。

签名说明：

1. 运行一次 [keystore.yml](.github/workflows/keystore.yml)（Actions → Generate Android keystore → Run workflow），下载生成的 `keystore.base64.txt`。
2. 在仓库 Secrets 里填 `ANDROID_KEYSTORE_BASE64`（上面文件的全文）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。
3. 没有配置时构建会回退 debug 签名，只能自测；换签名后旧包无法覆盖安装，密钥丢失也只能卸载重装。

版本号取自 `package.json` 的 `version`，`versionCode` 由 semver 推导（`0.1.3` → `103`），升级前先改版本号再打包。安卓端额外做了几处适配：返回键先关浮层再退出、导出 ZIP 走系统分享面板、补齐 `viewport-fit=cover` 与麦克风权限。

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。

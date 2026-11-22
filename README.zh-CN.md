# DeepChat

[English](README.md) | 简体中文

本地优先的网页聊天客户端，对话与附件保存在本机，浏览器直接调用模型接口，不需要自建服务端；同一套前端可以打包成安卓应用。

## 快速开始

需要 Node.js 22 或更高版本，以及 pnpm：

```sh
git clone https://github.com/Wrderly/DeepChat.git
cd DeepChat
pnpm install
pnpm dev
```

打开 http://localhost:8090 ，在设置 → 模型服务里添加提供商并填写 API Key 后即可对话。内置的 DeepSeek 提供商只需填写密钥；自定义提供商可使用 Anthropic 或 OpenAI 协议。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可直接用于静态托管，也可同步进安卓工程。

## 功能

- **会话**：新建会话、按首条提问自动命名、重命名、删除；消息存在多个版本时可在分支间切换；从任意消息分支出新会话，新会话带上该轮提问与回答。
- **消息编辑**：就地编辑提问、编辑助手的思考内容与回答内容，保存后立即写入当前上下文。提问编辑框、思考编辑框、回答编辑框各有独立外观，统一使用「取消 / 保存」。
- **模型服务**：在输入框里为当前会话选择模型；可添加任意数量的 Anthropic / OpenAI 兼容提供商，分别配置名称、API 域名、路径、密钥、额外请求头 / 请求体与模型列表。内置 DeepSeek 提供商始终存在且不可删除，并可从服务端拉取模型列表。
- **对话**：流式输出、深度思考、智能搜索、链接阅读与来源引用；随时停止生成，也可以在符合条件时继续生成。深度思考由所选模型的能力决定；智能搜索、链接阅读、语音输入与朗读由内置 DeepSeek 提供商提供。
- **生成参数**：思考强度、温度、Top P、最大输出、停止序列。设置 → 模型参数保存新会话的默认值；输入框底部的「会话设置」按会话覆盖或恢复默认；新会话页面可在发出第一条消息前预设。
- **系统提示词**：按会话设置，留空时使用内置提示词。
- **输入**：多行输入（Enter 发送、Shift+Enter 换行）、附件上传 / 粘贴 / 拖拽、语音输入、回复朗读。
- **渲染**：Markdown、代码高亮、KaTeX 公式、Mermaid 图表、来源引用卡片。
- **界面**：简体中文与英文、浅色 / 深色 / 跟随系统主题、移动端布局、可折叠侧栏；移动端录音时输入框首行显示实时频谱。
- **数据管理**：历史导入导出（ZIP）、删除所有对话。
- **上下文提示**：每轮请求附带当前日期、星期、地区、平台与语言。

## 设置项

| 设置 | 说明 |
| --- | --- |
| 模型服务 | 提供商、API Key 与模型列表；内置 DeepSeek 提供商始终存在 |
| 语言 | 简体中文 / English |
| 主题 | 浅色、深色或跟随系统 |
| 位置 | 地区信息，用于对话中的上下文提示 |
| 朗读音色 | 回复朗读使用的声音 |
| 模型参数 | 新会话默认使用的思考强度、温度、Top P、最大输出与停止序列 |

## 数据与存储

各提供商的 API Key 与各项设置保存在浏览器 localStorage（键名前缀 `deepchat:`，提供商列表在 `deepchat:providers`），会话与附件原件保存在 IndexedDB（库名 `deepchat`），本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件、语音输入与朗读时，相应内容会提交给配置的 API 服务；请求由浏览器直接发往各提供商的 API 域名。

历史导入导出使用 ZIP 格式，格式说明见[历史导入导出](src/services/chat/history/README.md)。导出包含全部会话与本地可用的图片原件；导入在校验通过后整体替换本地会话与附件。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，并停止正在进行的生成。

## 开发

| 命令                | 用途                    |
| ------------------- | ----------------------- |
| `pnpm dev`          | 启动开发服务器          |
| `pnpm build`        | 构建到 `dist/`          |
| `pnpm type`         | TypeScript 类型检查     |
| `pnpm lint`         | oxlint 检查             |
| `pnpm format`       | oxfmt 格式化            |
| `pnpm android:sync` | 同步网页产物到安卓工程  |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`，`createConfig({ apiOrigin, devServer })` 支持自定义 API 地址与开发服务器代理。

内置 DeepSeek 提供商通过 Anthropic 兼容的 Messages / Files API 通信，语音使用 ASR / TTS 接口，请求带搜索、链接阅读、标题与 `latest_reminder` 等扩展能力。自定义提供商使用 Anthropic Messages 或 OpenAI Chat Completions 协议；由于 Files API 仅内置提供商可用，图片会以 base64 内联，不支持的扩展能力自动忽略。附件可用的格式以服务端校验为准。

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    providers/         提供商定义、存储与模型解析
    markdown/          Markdown 解析、代码高亮与图表
    platform/          原生壳适配（返回键、文件分享）
    speech/            录音与朗读
  utils/               通用工具
android/               Capacitor 安卓工程
```

## 安卓应用

仓库包含一套 [Capacitor](capacitor.config.ts) 壳（`android/`）和 GitHub Actions 构建流程，产物是可直接侧载的 APK。

应用包名（applicationId）为 `com.wrderly.deepchat`；此前的安装包使用 `com.wrderly.deepseekchat`，安卓会视为另一个应用：请先导出历史，卸载旧版后再安装新版。

```sh
pnpm build                 # 构建网页产物到 dist/
pnpm android:sync          # 复制到 android/app/src/main/assets
cd android && ./gradlew assembleRelease
```

推送到 `main` 时，[android.yml](.github/workflows/android.yml) 会构建 APK 并作为 artifact 上传；打 `v*` 标签时同时把 APK 附加到 GitHub Release。

### 签名

1. 运行一次 [keystore.yml](.github/workflows/keystore.yml)：Actions → Generate Android keystore → Run workflow，填写别名与密码，下载生成的 `keystore.base64.txt`。
2. 在仓库 Secrets 中配置四项：`ANDROID_KEYSTORE_BASE64`（上面文件的全文）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。
3. 之后的构建都由这把密钥签名，安装过的版本可以直接覆盖升级。请妥善备份密钥与密码，它决定后续版本能否覆盖安装。

### 版本号

版本号取自 `package.json` 的 `version`，`versionCode` 由 semver 推导（`0.1.3` → `103`）。发布新版本时先改 `version` 再打包。

### 安卓端能力

返回键逐级退出（先关浮层与侧栏抽屉，再退历史，最后退出应用）、导出 ZIP 走系统分享面板、语音输入所需的麦克风权限、全屏安全区适配。

## 许可证

[MIT](LICENSE)。构建会把许可证复制到 `dist/LICENSE`，分发时一并保留；第三方依赖遵循各自的许可证。

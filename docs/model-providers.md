# 多模型提供商设计方案

> 目标版本：0.2.0
> 现状基线：`deepseek-flash` 写死，协议固定为 DeepSeek 的 Anthropic-compatible Messages API。

## 1. 现状梳理

模型与地址目前都是编译期/常量级写死，散落在 6 个位置：

| 位置 | 现状 | 影响 |
| --- | --- | --- |
| `src/services/api/types.ts:7` | `export type ChatModel = 'deepseek-flash' \| 'deepseek-v4-pro'` | 模型是封闭联合类型，无法表达用户自定义模型 |
| `src/services/chat/store.ts:46` | `const MODEL: ChatModel = 'deepseek-flash'` | 所有新回复都用它 |
| `src/services/chat/store.ts:277 / 937 / 1245` | `model: MODEL`、`previous.model ?? MODEL`、`initial.model ?? MODEL` | 新建、续写、流式请求三处回落 |
| `src/services/chat/types.ts:82` | `AssistantMessage.model: ChatModel \| null` | 消息快照只能存内置模型 |
| `src/services/api/client.ts:14-16` | `API_ORIGIN = __API_ORIGIN__`、`${API_ORIGIN}/anthropic/v1` | 只有一个域名、一个固定路径 |
| `src/services/settings.ts:97` | 单一 `apiKey` | 一把钥匙对应一个服务 |

另有三个能力绑死在 DeepSeek 上：

- **文件**：`client.ts` 的 Files API（`/anthropic/v1/files`）与 `attachments.ts` 的上传队列；
- **语音**：`services/api/speech.ts` 的 `${API_ORIGIN}/v1/tools/asr|tts`；
- **DeepSeek 协议扩展**：`safety_check`（设置里可选 高 / 低 / 关）、`role: 'latest_reminder'`、`deepseek_web_search` / `deepseek_read_url` 工具、`title` 服务端标题。

这些扩展不是标准 Anthropic 协议，自定义提供商不会支持，必须做成**可降级的能力开关**，否则接入非 DeepSeek 服务会直接 400。

## 2. 目标与非目标

### 目标

1. 用户可添加任意数量提供商，每项配置：**API 模式（协议）、名称、API 域名、API 路径、密钥**。
2. 每个提供商可维护**模型列表**（模型 ID + 显示名 + 能力），并指定默认模型。
3. 聊天页可选择「提供商 / 模型」，选择结果按会话记忆，消息里保存快照。
4. 历史会话、分支、续写、重新生成、导入导出不因换模型而损坏。
5. 老用户升级后无需重新填 Key：自动迁移为内置 DeepSeek 提供商。

### 非目标（本期不做）

- 不做服务端代理 / 密钥托管；请求仍然是浏览器直连。
- 不做按 token 计费统计、余额查询。
- 不做 OpenAI Responses API、Gemini 原生协议（适配器预留扩展点）。
- 不做多家提供商的语音（语音仍仅 DeepSeek 预设可用）。

## 3. 总体架构

```
UI (ModelPicker / ProviderEditor)
        │
useProviders (zustand + localStorage)
        │  resolve ModelRef → { provider, model }
        ▼
chat/store.ts ── createReply / streamReply
        │
        ▼
api/adapter.ts  (按 protocol 分发)
        ├── anthropic.ts   ← 现有 client.ts 抽离，参数化 baseUrl/apiPath/headers
        └── openai.ts      ← 新增，Chat Completions SSE
        │
        ▼
MessageStreamEvent (内部统一事件流，类型不变)
        │
        ▼
reply.ts applyEvent → UI（完全不用改）
```

**关键决策：适配器向下统一到现有的 `MessageStreamEvent`。** 这样 `reply.ts`、`store.ts` 的流式合并、分支、续写、错误分类都可以零改动复用，UI 层也不需要知道底层是哪家协议。新增协议 = 新增一个事件翻译器。

## 4. 数据模型

新增 `src/services/providers/types.ts`：

```ts
/** 'anthropic' = Anthropic Messages API；'openai' = OpenAI Chat Completions API */
export type ApiProtocol = 'anthropic' | 'openai'

/** 内置预设会启用 DeepSeek 私有扩展（files / speech / search / title / latest_reminder） */
export type ProviderPreset = 'deepseek' | 'custom'

export type ModelCapability = 'thinking' | 'vision' | 'document' | 'prefill' | 'tools'

export type ProviderModel = {
  /** 请求体里的 model 字段 */
  id: string
  /** 选择器里显示的名字 */
  name: string
  capabilities: ModelCapability[]
  contextWindow?: number
  maxOutputTokens?: number
}

export type ModelProvider = {
  id: string
  name: string
  protocol: ApiProtocol
  /** 例如 https://api.deepseek.com、https://api.openai.com */
  baseUrl: string
  /** 例如 /anthropic/v1/messages、/v1/chat/completions */
  apiPath: string
  apiKey: string
  preset: ProviderPreset
  models: ProviderModel[]
  defaultModelId: string | null
  /** 少数服务需要额外请求头（OpenRouter 的 HTTP-Referer、Azure 的 api-key 等） */
  extraHeaders?: Record<string, string>
  /** 少数服务需要额外请求体字段（如 enable_thinking、thinking_budget） */
  extraBody?: Record<string, unknown>
  createdAt: number
}

/** 消息与会话里保存的模型快照 */
export type ModelRef = {
  providerId: string
  modelId: string
  /** 提供商被删除后仍能在历史里显示 */
  providerName?: string
  modelName?: string
}
```

### 4.1 字段与需求对应

| 需求 | 字段 |
| --- | --- |
| API 模式 | `protocol`（Anthropic / OpenAI 兼容） |
| 名称 | `name` |
| API 域名 | `baseUrl` |
| API 路径 | `apiPath` |
| 密钥 | `apiKey` |
| 模型列表 | `models[]` + `defaultModelId` |

`apiPath` 允许带 query（如 Azure 的 `?api-version=2024-10-21`），拼接时保留。

### 4.2 默认值

新增提供商时的默认值按模式切换：

```ts
const DEFAULTS: Record<ApiProtocol, Pick<ModelProvider, 'baseUrl' | 'apiPath'>> = {
  anthropic: { baseUrl: 'https://api.anthropic.com', apiPath: '/v1/messages' },
  openai: { baseUrl: 'https://api.openai.com', apiPath: '/v1/chat/completions' },
}
```

## 5. 存储与迁移

### 5.1 存储位置

沿用现有 `deepseek-chat:` 前缀，同一份 localStorage：

```
deepseek-chat:providers = {
  version: 1,
  items: ModelProvider[],
  defaultProviderId: string | null
}
```

- 不新增 IndexedDB 表；提供商配置量级很小。
- 密钥与现状一样以明文存 localStorage（现有 `deepseek-chat:api-key` 已经如此）。**导出历史不包含 localStorage**，所以密钥不会随备份泄露，这一点保持不变。
- 设置里的 `apiKey` 字段废弃：保留读取用于迁移，写入口移除。

### 5.2 迁移（首次启动）

在 `useProviders` 初始化时执行一次：

```ts
const legacyKey = readLegacyApiKey() // deepseek-chat:api-key
if (items.length === 0) {
  items = [createDeepSeekPreset(legacyKey ?? '')]
}
```

内置预设的固定值：

```ts
{
  id: 'deepseek',
  name: 'DeepSeek',
  protocol: 'anthropic',
  baseUrl: API_ORIGIN,
  apiPath: '/anthropic/v1/messages',
  preset: 'deepseek',
  models: [
    { id: 'deepseek-flash', name: 'DeepSeek Flash', capabilities: ['thinking', 'vision', 'document', 'prefill'] },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', capabilities: ['thinking', 'document', 'prefill'] },
  ],
  defaultModelId: 'deepseek-flash',
}
```

内置预设**不可删除**（只允许改名/换 Key/改模型列表），避免用户把自己锁死。若要完全自定义，另建提供商即可。

### 5.3 消息与会话迁移

`AssistantMessage.model` 由 `ChatModel | null` 改为 `ModelRef | null`。旧数据里是字符串，在 `src/services/chat/branches.ts` 的 `normalizeSession` 中顺带升级（该函数已在 `store.ts:362` 加载会话时调用）：

```ts
const normalizeModel = (model: unknown): ModelRef | null => {
  if (typeof model === 'string') {
    return { providerId: 'deepseek', modelId: model, providerName: 'DeepSeek' }
  }
  return isModelRef(model) ? model : null
}
```

`Session` 新增可选 `model?: ModelRef`，用于「这个会话上次用哪个模型」。缺省 = 用全局默认。

DB 不需要升版本：sessions 存的是整体 JSON 对象，`idb` 不做字段校验。历史导出格式需要 +1 版本（见 7.3）。

## 6. 请求适配器

### 6.1 接口

新增 `src/services/api/adapter.ts`：

```ts
export type AdapterTarget = {
  provider: ModelProvider
  /** 已解析的密钥，默认取 provider.apiKey */
  apiKey: string
}

export type StreamRequest = {
  model: string
  system: string
  messages: MessageParam[]
  thinking: boolean
  options: ApiOptions
  /** DeepSeek 预设才有 */
  tools?: ToolParam[]
  safetyCheck?: boolean
  requestTitle?: boolean
  latestReminder?: string
}

export interface ChatAdapter {
  stream(target: AdapterTarget, request: StreamRequest, signal: AbortSignal): AsyncGenerator<MessageStreamEvent>
}
```

`store.ts` 里 `streamMessage(useSettings.apiKey, body, signal)` 变为：

```ts
const adapter = getAdapter(provider.protocol)
for await (const event of adapter.stream({ provider, apiKey }, request, controller.signal)) { … }
```

### 6.2 URL 拼接

```ts
const joinUrl = (baseUrl: string, apiPath: string) =>
  `${baseUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`
```

校验规则（保存时）：

- `baseUrl` 必须能被 `new URL()` 解析，协议只允许 `http:` / `https:`；
- `apiPath` 必须以 `/` 开头（自动补），不允许 `//`；
- 非 `https` 且 host 不是 `localhost` / `127.0.0.1` 时给出黄色警告（仍允许保存，局域网自建服务是真实场景）。

### 6.3 Anthropic 适配器

由现有 `client.ts` 的 `streamMessage` 抽出，唯一变化是把常量换成参数：

```ts
const headers = {
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
  // 浏览器直连 Anthropic 官方必需；其他兼容服务会忽略
  'anthropic-dangerous-direct-browser-access': 'true',
  'content-type': 'application/json',
  accept: 'text/event-stream',
  ...provider.extraHeaders,
}
```

请求体：

```ts
{
  model,
  system,
  messages,
  max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
  thinking: { type: thinking ? 'enabled' : 'disabled' },
  ...toRequestParams(options, thinking),
  // 安全审核级别由设置决定：low / high 显式携带，'off' 时请求体里不出现该字段
  ...(isDeepSeekEndpoint ? toSafetyCheckFields(request.safetyCheck) : {}),
  ...(preset === 'deepseek'
    ? { tools, ...(requestTitle ? { title: { enabled: true } } : {}) }
    : {}),
  ...provider.extraBody,
  stream: true,
}
```

注意：`max_tokens` 在 Anthropic 协议里是**必填**。现在由服务端决定，自定义服务必须给值，因此引入 `DEFAULT_MAX_TOKENS = 4096`，并允许模型配置覆盖。

`latest_reminder` 角色只有 DeepSeek 认。非预设时在适配器里把它从 `messages` 里摘掉，拼到 `system` 末尾：

```ts
const messages = preset === 'deepseek' ? request.messages : mergeReminderIntoSystem(request)
```

### 6.4 OpenAI 适配器（新增）

`POST {baseUrl}{apiPath}`，`Accept: text/event-stream`，`Authorization: Bearer {key}`。

请求体由内部请求转换而来：

```ts
{
  model,
  messages: toOpenAIMessages(request), // system 放首条
  stream: true,
  stream_options: { include_usage: true }, // 部分服务不支持，失败时降级重试一次
  ...(thinking ? { reasoning_effort: mapEffort(options.effort) } : {}),
  ...(options.temperature !== null ? { temperature: options.temperature } : {}),
  ...(options.topP !== null ? { top_p: options.topP } : {}),
  ...(options.maxTokens !== null ? { max_tokens: options.maxTokens } : {}),
  ...(options.stopSequences.length ? { stop: options.stopSequences } : {}),
  ...provider.extraBody,
}
```

**消息转换 `toOpenAIMessages`**

| 内部 | OpenAI |
| --- | --- |
| `system: string` | `{ role: 'system', content }` |
| user 纯文本 | `{ role: 'user', content }` |
| user 含图片（inline 模式） | `content: [{type:'text'}, {type:'image_url', image_url:{url:'data:...'}}]` |
| user 含文件块 | 直接丢弃并在发送前拦截（见 8.1） |
| assistant `TextPart` | 拼成一个字符串 |
| assistant `ThinkingPart` | 丢弃（无 signature 概念） |
| assistant 服务端工具块 | 丢弃 |
| `role: 'latest_reminder'` | 拼进 system 末尾 |
| 续写 prefill | 仅当模型声明 `prefill` 能力时，作为最后一条 assistant 消息 |

**事件映射（核心）**

| OpenAI SSE | 内部 `MessageStreamEvent` |
| --- | --- |
| 首个 chunk（含 `id`/`model`） | `message_start` |
| `delta.reasoning_content` 或 `delta.reasoning` | 首次：`content_block_start{thinking}`；随后 `thinking_delta` |
| `delta.content` | 首次：`content_block_start{text}`；随后 `text_delta` |
| `delta.tool_calls` | 忽略（v1 不渲染） |
| `finish_reason` | `message_delta{stop_reason}` |
| `usage.prompt_tokens` | `input_tokens` |
| `usage.completion_tokens` | `output_tokens` |
| `usage.prompt_tokens_details.cached_tokens` | `cache_read_input_tokens` |
| `data: [DONE]` | `message_stop` |

`finish_reason` 映射：`stop → end_turn`、`length → max_tokens`、`tool_calls → tool_use`、`content_filter → refusal`、`null → end_turn`。

**思考内容的兼容差异**：DeepSeek 官方 OpenAI 接口用 `reasoning_content`，OpenRouter 用 `reasoning`，部分服务用 `reasoning_content` 但只在非流式返回。适配器同时识别两个字段，缺省按「无思考」处理，不影响正文。

### 6.5 能力矩阵

| 能力 | DeepSeek 预设 | 自定义 Anthropic | 自定义 OpenAI |
| --- | --- | --- | --- |
| SSE 流式 | ✓ | ✓ | ✓ |
| 思考块 | ✓ | 服务端返回才有 | `reasoning_content` 映射 |
| 图片输入 | Files API | base64 / url | `image_url` data URL |
| 文档输入 | Files API | ✗ | ✗ |
| 智能搜索 | ✓ | ✗ | ✗ |
| 链接读取 | ✓ | ✗ | ✗ |
| 服务端标题 | ✓ | ✗（本地截断） | ✗（本地截断） |
| `latest_reminder` 角色 | ✓ | 并入 system | 并入 system |
| 续写（prefill） | ✓ | ✓ | 需显式开启 |
| 语音 ASR/TTS | ✓ | ✗ | ✗ |

UI 一律读这张表决定开关的可见性/禁用态，不在组件里散落 `preset === 'deepseek'` 判断。

### 6.6 错误归一

现有 `ApiError.(http|stream|network|interrupted|protocol)` 与 `classifyStatus` 足够，适配器只做一件事：把 OpenAI 的错误体 `{error:{message,type,code}}` 转成同一套 `ApiError`，并保留 `status`。新增一个语义：

- `code === 'context_length_exceeded'` → `ApiError('http', message, 400)`，由 `describe.ts` 走通用错误文案，避免误报为网络问题。

## 7. 会话与消息

### 7.1 选择优先级

```
本次请求的模型 = 会话 model（Session.model）
              ?? 全局默认（providers.defaultProviderId + provider.defaultModelId）
              ?? 第一个可用提供商的第一个模型
```

- 新会话：输入框的模型选择器写入草稿态，发送时落到 `Session.model`。
- 已有会话：选择器直接改 `Session.model`，**不影响**已生成消息的快照。
- 续写/重新生成：优先用 `previous.model`；若该提供商已删除或模型已从列表移除，回落到全局默认，并在回复下方给一条轻提示「原模型不可用，已切换为 X」。

### 7.2 请求链路改动点

`src/services/chat/store.ts`：

1. 删除 `MODEL` 常量；`createReply` 改为接收 `ModelRef`，解析出 `provider` + `model`。
2. `AssistantMessage.model` 写入完整 `ModelRef`（含名称快照），历史里能自解释。
3. `streamReply` 用 `getAdapter(provider.protocol)`，请求体由 `StreamRequest` 生成。
4. 文件上传、语音、搜索工具、标题请求全部按 provider 能力分支。

### 7.3 历史导入导出

`history/schema.ts` 的导出格式 +1 版本，新增可选字段：

```
assistant.model?: { providerId, modelId, providerName?, modelName? }
session.model?: { providerId, modelId, ... }
```

导入策略：`toLocal.ts` 目前把 `model` 直接置 `null`（`toLocal.ts:219`），改为**保留**该字段；提供商在本地不存在时只保留名称用于展示，不阻断导入。旧版本备份（无此字段）继续走 `model: null`。

## 8. 附件 / 语音 / 搜索的降级

### 8.1 附件

三类处理，由提供商能力决定：

1. **Files API（DeepSeek 预设、以及未来显式声明 `filesApi: true` 的提供商）**
   完全复用现有 `attachments.ts` + `client.ts` 的上传/重传逻辑。

2. **inline（自定义 Anthropic / OpenAI）**
   添加附件时**不上传**，直接把本地 blob 标记为 `done`。发送时从 IndexedDB 读出、复用 `resizeUploadImage` 压缩，转 base64 内联：
   - Anthropic：`{ type:'image', source:{ type:'base64', media_type, data } }`
   - OpenAI：`{ type:'image_url', image_url:{ url:'data:${mime};base64,...' } }`
   文档类（PDF/Word/PPT）在 inline 模式下直接拒绝并提示「当前模型不支持文档，仅支持图片」。

3. **none**
   附件按钮禁用。

实现上 `FileAttachment.serverId` 保持不变（仅 Files 模式使用），inline 模式不需要新字段。`prepareDraftMessage` 里「必须有 serverId」的断言要按模式放宽。

### 8.2 语音

`speech.ts` 的 ASR/TTS 接口是 DeepSeek 专属。规则：

- 当前会话模型属于 `preset === 'deepseek'` → 语音可用；
- 否则隐藏录音按钮、禁用「朗读」；
- 设置页的「朗读音色」仅在存在 DeepSeek 提供商时显示。

### 8.3 搜索 / 链接读取

`serverTools()` 只在预设下注入；`thinking` 开关按模型能力显示。非预设时「智能搜索」整项隐藏，避免用户打开后请求 400。

## 9. UI

### 9.1 设置页新增分组

`SettingsSection` 从 `'general' | 'model' | 'data'` 扩为 `'general' | 'model' | 'providers' | 'data'`，顺序：通用 → 模型参数 → **模型服务** → 数据管理。

「模型服务」页：

```
┌─────────────────────────────────────────────┐
│ 模型服务                                     │
│ 管理聊天使用的 API 提供商与模型               │
├─────────────────────────────────────────────┤
│ DeepSeek            [默认] [Anthropic]       │
│ https://api.deepseek.com                     │
│ 2 个模型 · 密钥已配置                 编辑 ⋯ │
├─────────────────────────────────────────────┤
│ 我的中转站                       [OpenAI]    │
│ https://relay.example.com/v1                 │
│ 3 个模型 · 未配置密钥                 编辑 ⋯ │
├─────────────────────────────────────────────┤
│ + 添加提供商                                 │
└─────────────────────────────────────────────┘
```

每项的「⋯」菜单：设为默认 / 编辑 / 删除（内置项无删除）。

### 9.2 提供商编辑器

移动端用 `Modal` 的 sheet 形态，桌面用居中弹窗，与现有 `SettingsDialog` 的交互一致。

| 字段 | 控件 | 校验 |
| --- | --- | --- |
| API 模式 | `Select`：Anthropic 兼容 / OpenAI 兼容 | 切换时若地址仍是旧默认值则同步替换 |
| 名称 | 文本框 | 必填，≤40 字 |
| API 域名 | 文本框 | URL 合法、http(s) |
| API 路径 | 文本框 | 以 `/` 开头 |
| 密钥 | 密码框 + 显示切换 | 可为空（先存后填） |
| 模型列表 | 行式编辑器 | 至少 1 个；ID 必填且不重复 |
| 默认模型 | `Select` | 只能是列表内项 |
| 高级 | 折叠：额外请求头 / 额外请求体 / 默认 max_tokens | JSON 合法性 |

模型行：

```
[deepseek-flash        ] [DeepSeek Flash      ] [思考][图片][文档] [×]
```

「从服务端拉取模型」按钮：`GET {baseUrl}/v1/models`（OpenAI）或 `/v1/models`（Anthropic），把返回的 `id` 批量填入，名称默认同 ID。失败不阻塞，提示「无法拉取，请手动填写」。

「验证密钥」按钮复用 `useApiKeyForm` 的交互：成功 → 绿色「连接正常」；失败 → 按 `classifyStatus` 显示 401/402/429/网络错误。**验证不是保存的前置条件**，很多自建服务没有 `/models`。

### 9.3 模型选择器（输入框）

放在 `ChatInput` 的 toggles 行最左侧，`ApiOptionsPanel` 之前：

```
[ DeepSeek / Flash ▾ ]  [深度思考] [智能搜索] [📎] ...
```

- 点击开 `Menu`，按提供商分组，组内列模型，当前项打勾；
- 顶部一行「默认模型：…」，点击写入全局默认；
- 无任何可用提供商时显示「添加模型」，点击 `openSettings('providers')`。

### 9.4 门控汇总

| 控件 | 条件 |
| --- | --- |
| 深度思考 | 模型含 `thinking` |
| 智能搜索 | 提供商为 DeepSeek 预设 |
| 附件（图片） | 模型含 `vision` |
| 附件（文档） | 模型含 `document` |
| 语音输入 / 朗读 | DeepSeek 预设且已配 Key |
| 续写 | 模型含 `prefill` |

## 10. 安全

1. **密钥仍存 localStorage**。浏览器直连模型没有更安全的方案；UI 只展示掩码，编辑时才回填。
2. **导出不包含密钥**。`toArchive.ts` 只导出会话，天然满足；新增字段时不要顺手带上 `apiKey`。
3. **http 警告**：非 localhost 的 `http://` 地址在编辑器里常驻黄条「密钥将以明文通过 HTTP 传输」。
4. **CORS 提示**：编辑器的说明文案里写明「浏览器直连需要服务端允许跨域；官方 OpenAI 接口不允许浏览器直连，请使用支持 CORS 的中转服务」。Anthropic 官方需要 `anthropic-dangerous-direct-browser-access`，适配器已默认带上。
5. **不记录请求体日志**，避免密钥/隐私进控制台。

## 11. 文件改动清单

### 新增

| 文件 | 内容 |
| --- | --- |
| `src/services/providers/types.ts` | `ModelProvider`、`ProviderModel`、`ModelRef`、能力常量 |
| `src/services/providers/store.ts` | zustand store、localStorage 读写、CRUD、默认项解析、迁移 |
| `src/services/providers/select.ts` | `resolveModelRef`、`getAdapterTarget`、能力判断纯函数 |
| `src/services/api/adapter.ts` | `ChatAdapter` 接口与按协议分发 |
| `src/services/api/anthropic.ts` | 由 `client.ts` 抽出的 Messages 流式实现（参数化） |
| `src/services/api/openai.ts` | Chat Completions 流式实现 + SSE → 内部事件映射 |
| `src/services/api/convert.ts` | `toOpenAIMessages`、`toOpenAIBody`、effort 映射 |
| `src/components/providers/ProviderSection.tsx` | 设置页「模型服务」 |
| `src/components/providers/ProviderEditor.tsx` | 添加/编辑弹窗 |
| `src/components/providers/ModelListEditor.tsx` | 模型行编辑器 |
| `src/components/providers/Provider.module.css` | 样式 |
| `src/components/chatInput/ModelPicker.tsx` + `.module.css` | 输入框模型选择器 |

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/services/api/types.ts` | 删除 `ChatModel` 联合；`model` 改 `string`；`CreateMessageRequest` 拆成内部 `StreamRequest` |
| `src/services/api/client.ts` | 保留 `request` / `uploadFile` / `deleteFile`；流式部分移入 `anthropic.ts`；文件接口接收 provider |
| `src/services/settings.ts` | 移除 `apiKey` 读写（保留一次性迁移读） |
| `src/services/chat/types.ts` | `AssistantMessage.model: ModelRef \| null`；`Session.model?: ModelRef` |
| `src/services/chat/store.ts` | 删 `MODEL`；模型解析、适配器分发、能力分支 |
| `src/services/chat/reply.ts` | `toRequestMessages` 接受 `latestReminder` 策略；新增 OpenAI 侧消息转换入口 |
| `src/services/chat/branches.ts` | `normalizeSession` 迁移旧 `model` 字符串 |
| `src/services/chat/attachments.ts` | 上传/内联/禁用三态 |
| `src/services/chat/history/toLocal.ts` / `toArchive.ts` / `schema.ts` | 模型快照字段与版本 |
| `src/components/settings/SettingsDialog.tsx` / `settingsDialogState.ts` | 新分组、`ensureChatReady` 替代 `ensureApiKey` |
| `src/components/settings/ApiKeyField.tsx` | 删除或降级为内置提供商专用入口 |
| `src/components/chatInput/ChatInput.tsx` | 模型选择器 + 能力门控 + 发送带 `ModelRef` |
| `src/i18n/zh.ts` / `en.ts` | 新增约 50 个 `provider*` / `modelPicker*` 键；修正 `zh.ts:193` 写死模型名的说明 |
| `README.md` | 设置项说明、支持自定义提供商 |
| `src/app/App.tsx` | `ensureApiKey` → `ensureChatReady` |

## 12. 分阶段实施

**阶段 1：数据层与请求层（不改 UI）**

- 新增 providers 类型、store、迁移；
- 抽出 anthropic 适配器，接入 openai 适配器；
- `store.ts` 走适配器，默认仍是 DeepSeek 预设。
- 验收：现有功能零回归，`pnpm type` / `lint` 通过。

**阶段 2：设置页管理**

- 「模型服务」分组、提供商编辑器、模型列表编辑器、验证与拉取；
- 删除旧的单 Key 入口，`ensureChatReady` 接管。

**阶段 3：选择器与会话快照**

- `ModelPicker`、`Session.model`、`AssistantMessage.model` 快照、续写回落提示。

**阶段 4：能力降级与收尾**

- 附件三态、语音/搜索门控、历史格式、README、i18n 补全。

每个阶段独立可发布，阶段 1 完成时对用户完全无感知。

## 13. 验收标准

1. ~~老用户升级：原有 Key 自动变成 DeepSeek 提供商，历史会话正常打开、续写、重新生成。~~ 按 m00168 的决定取消：项目处于破坏性更新期，不做旧数据迁移，`deepseek-chat:*` 与旧 IndexedDB 库直接忽略。
2. 新增一个 OpenAI 兼容提供商（如 `https://api.openai.com` + `/v1/chat/completions`），填入 Key、手填模型 `gpt-4o`，能正常流式对话、显示思考（若返回 `reasoning_content`）。
3. 新增一个 Anthropic 兼容提供商，能流式对话；不发送 `safety_check` / `title` / DeepSeek 工具（`baseUrl` 指向 `api.deepseek.com` 的自定义端点只额外发送 `safety_check`）。
4. 同一个会话里切换模型：新回复用新模型，旧回复保留各自的模型快照（用于续写与重新生成；界面暂不展示模型名），分支切换不串模型。
5. 删除正在被历史引用的提供商：历史仍可读，续写回落到默认并提示。
6. 无模型配置时点击发送：跳转「模型服务」页而不是报错。
7. 非 DeepSeek 提供商下：搜索/语音/文档按钮不可见或禁用，且没有请求带私有扩展字段。
8. `pnpm type`、`pnpm lint`、`pnpm build` 全部通过。
9. 安全审核：设置页「模型参数」可选 高 / 低 / 关作为新对话默认值（默认关），会话浮层可逐会话覆盖或跟随默认；只有 DeepSeek 端点发送 `safety_check`，重新生成与续写沿用消息上的快照，`provider.extraBody` 里手写的值优先级最高。`关`（不发送）与 `低` 都是服务端默认检查，只有 `高` 会额外审核输入输出。

## 14. 风险与对策

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| CORS | 浏览器直连多数厂商会被拦 | 编辑器常驻提示；错误文案区分「网络/CORS」并给排查建议 |
| 协议方言 | 同为「OpenAI 兼容」，`reasoning_content`、`stream_options`、`max_tokens` 命名各不相同 | 能力开关 + `extraBody` / `extraHeaders` 逃生口；不支持时自动降级重试一次 |
| prefill | 部分 OpenAI 兼容服务拒绝末尾 assistant 消息 | 默认关闭，模型级开关，失败时提示改用「重新生成」 |
| Files API 的 file_id 与账号绑定 | 换 Key 后旧附件失效 | 现有 `reuploadInvalidatedFiles` 已处理；inline 模式无此问题 |
| 密钥明文 | localStorage 可被 XSS 读取 | 与现状一致；不新增日志、不进导出 |
| 迁移失败 | 旧 Key 丢失会让用户以为数据没了 | 迁移只读不删旧键；失败时仍允许手动添加提供商 |

## 15. 实现状态（2026-11-22）

阶段 1–4 已全部落地：`src/services/providers/*`（类型、常量、存储、选择）、`src/services/api/{adapter,chat,anthropic,convert,openai}.ts`、设置页「模型服务」分组（`ProviderSection` / `ProviderEditor`）、输入框 `ModelPicker`、能力门控（深度思考按模型能力、搜索仅内置 DeepSeek、非预设附件仅图片 base64）、会话 `Session.model` 快照与消息 `AssistantMessage.model` 快照。

**破坏性变更**：按 m00168 的决定不做旧数据迁移。localStorage 前缀统一为 `deepchat:`（提供商列表 `deepchat:providers`），IndexedDB 库名统一为 `deepchat`；旧的 `deepseek-chat` 数据直接忽略。

**与原设计的差异**：

- 非预设提供商统一走「无 Files API」的图片 base64 内联；文档附件在 OpenAI 协议下不发送，Anthropic 协议下若模型声明 document 能力则以 file 块发送。
- 语音输入、朗读、智能搜索、链接阅读、自动标题始终使用内置 DeepSeek 提供商的 Key，不受当前会话模型影响。
- 删除提供商后，指向它的本地选择与会话快照在读取时回退到默认模型；续写/重新生成若模型不可用，回复提示 `replyModelUnavailable`。
- 结构化输出（`output_config`）、prefill 续写在非预设提供商下不发或降级为普通消息。

**验收**：第 2–8 项已人工过一遍（新增 OpenAI 兼容提供商、切换模型、设为默认、删除回落、非 DeepSeek 下搜索隐藏、无 Key 时打开「模型服务」）；`pnpm type`、`pnpm lint`、`pnpm build` 均通过。

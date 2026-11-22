# 相册选择（系统照片选择器）设计方案

> 目标版本：0.3.0（拍照 / 相册 / 文件 托盘已实现，本文按实现结果更新）
> 现状基线（0.2.0）：输入框只有 `<input type="file">`，安卓上固定落到文件管理器
> 参考：DeepSeek 官方安卓端的「拍照 / 相册 / 文件」托盘，以及点「相册」后的系统照片选择器浮窗

## 0. 结论

用**一个薄原生插件 + 系统照片选择器（Photo Picker）**：不申请任何存储权限，支持多选，选中的图片复制到应用缓存后交给现有 `addDraftFiles` 上传链路；Web 端退化成 `<input type="file" accept="image/*" multiple>`。

| 类型 | 内容 |
| --- | --- |
| 新增 | `android/app/src/main/java/com/wrderly/deepchat/AlbumPickerPlugin.java`（约 460 行，含拍照）、`src/services/platform/albumPicker.ts`、托盘 UI、4 条文案、4 个图标 |
| 改动 | `MainActivity.java` 注册 1 行、`ChatInput.tsx` 入口、`ChatInput.module.css` 托盘样式、`android/app/build.gradle` 依赖 1 行 |
| 不改 | 上传队列、草稿、消息渲染、IndexedDB、`AndroidManifest.xml`（拍照也不需要 `CAMERA` 权限） |

选这个方案的关键原因：**系统照片选择器只能从原生代码唤起**。WebView 的 `<input type="file">` 无论 `accept` 怎么写，最终都走 `Intent.ACTION_GET_CONTENT`，落到文件管理器，拿不到「照片 / 相册」双 Tab 的那套 UI（见第 1 节）。

## 1. 现状

### 1.1 当前链路

| 步骤 | 位置 | 行为 |
| --- | --- | --- |
| 入口 | `src/components/chatInput/ChatInput.tsx:369-376` | 回形针按钮 `IconPaperclipOutline16`，点击后 `fileInputRef.current?.click()` |
| 选择器 | `src/components/chatInput/ChatInput.tsx:377-387` | 隐藏的 `<input type="file" multiple accept={ACCEPT}>` |
| 过滤条件 | `src/services/attachments.ts:14` | `ACCEPT` 由扩展名清单拼成，例如 `.png,.jpg,...,.pdf,.txt` |
| 校验 | `src/services/attachments.ts:49-61` | 扩展名白名单 → 单文件大小 → 数量（`MAX_COUNT = 50`） |
| 入草稿 | `src/services/chat/drafts.ts:64-94` | 建 `DraftAttachment`，Files API 走 `uploadAttachment`，否则 `markUploadInline` |
| 上传 | `src/services/api/client.ts:98-108` | `POST /files`，图片上传前做 `resizeUploadImage`（长边 4096，`src/utils/resizeUploadImage.ts:22`） |

这条链路本身不用动：相册只要能产出 `File[]`，后面完全复用。

### 1.2 为什么现在只能进文件管理器

1. WebView 触发 `onShowFileChooser`，交给 Capacitor 的 `BridgeWebChromeClient.onShowFileChooser`（`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java:276-305`）。
2. 非拍照场景进入 `showFilePicker`（同文件 `:375-386`），它直接用 `fileChooserParams.createIntent()`，即 `Intent.ACTION_GET_CONTENT`，再把 `accept` 转成 `EXTRA_MIME_TYPES`。
3. `ACTION_GET_CONTENT` 在安卓上由 DocumentsUI 接管，所以看到的是文件管理器。

也就是说：

- `accept` 是扩展名清单时，Capacitor 会把它们映射成一长串 MIME（`:380-386`），仍然是文件管理器；
- 就算改成 `accept="image/*"`，也只是把 DocumentsUI 的筛选条件变成图片，**依旧不会出现照片选择器**；
- 想改这个行为只能替换 Capacitor 的 `WebChromeClient`，比写插件侵入更大。

### 1.3 系统照片选择器（Photo Picker）的能力

- Android 13（API 33）起系统内置；Android 11 / 12 可经 Google Play 系统组件回填；更早的系统上 androidx 的契约会退回系统文件选择器（只筛图片）。
- **不需要 `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`**：用户勾选哪几张，系统只授予这几张的临时读权限。
- 支持多选，上限由系统给出（API 33+ 用 `MediaStore.getPickImagesMaxLimit()` 查询）。
- 界面就是官方截图里的「选择项目 / 照片 · 相册 / 最近」网格。

## 2. 目标与非目标

### 目标

1. 点「相册」打开系统照片选择器，支持一次多选，不弹任何权限申请。
2. 选完的图片与文件选择行为完全一致：同样的格式 / 大小 / 数量校验、草稿缩略图、上传进度、失败重试。
3. 保留「文件」入口，文件管理器路径不回归。
4. 浏览器（`pnpm dev`、网页版、Android Chrome）有等价降级，不出现只能原生使用的死按钮。
5. 「拍照」复用同一个托盘入口，与相册、文件共用校验、草稿与上传链路。

### 非目标

- **不做应用内自建相册网格**：要读取全部媒体就得申请相册权限，与「本地优先、最小权限」的定位冲突，也拿不到系统选择器的「仅授予选中项」隐私语义。
- **不做应用内相机预览**：拍照直接交给系统相机（`ACTION_IMAGE_CAPTURE`），不自建取景器，也就不需要 `CAMERA` 权限。
- **不做 iOS**：仓库里只有 `android/`，iOS 后续要另接 PHPicker。

## 3. 方案对比

| 方案 | 选择器 UI | 多选 | 新依赖 | 权限 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 官方 `@capacitor/camera`（`Camera.getPhoto({ source: Photos })`） | 系统相册 / 选择器 | ❌ 单张 | `@capacitor/camera` | Android 需声明相机权限（拍照用） | 不满足多选 |
| 社区 `@capawesome/capacitor-file-picker` | 系统照片选择器 | ✅ | 第三方插件 | 无 | 备选；但返回 `content://` 或 base64，取文件要么走 base64（多张大图内存翻倍），要么自己再解析 |
| 纯 Web：`<input accept="image/*">` | 文件管理器（部分 OEM 会路由到相册） | ✅ | 无 | 无 | 只能当降级 |
| **自研薄插件 + androidx `PickMultipleVisualMedia`** | 系统照片选择器 | ✅ | 无（androidx.activity 已在 `android/variables.gradle:6` 锁定 1.11.0，只需在 app 模块显式声明 1 行） | 无 | **推荐** |

选自研的理由：

1. `androidx.activity` 的 `PickMultipleVisualMedia` 已经把「系统选择器可用 / Play 服务回填 / 退回文档选择器」和数量上限都封装好了，不用自己判断版本。
2. 复制文件、HEIC 转码、命名、缓存清理都在自己手里，行为可预期。
3. 不引入社区插件，避免 Capacitor 大版本升级时被第三方插件卡住。
4. 仓库本来就带自定义原生代码（`MainActivity.java`），多一个本地插件类不增加分发复杂度：`android/` 是提交进仓库的，`cap sync` 不会覆盖 `app/src`。

## 4. 总体流程

```text
[相册按钮]
   │
   ├─ 前置检查：ensureChatReady / 已有 API Key / 非导入中
   │
   ▼
src/services/platform/albumPicker.ts  pickAlbumImages(limit)
   │
   ├─ Android：AlbumPicker.pickImages({ limit })
   │     └─ androidx PickMultipleVisualMedia.createIntent()
   │          ├─ 系统照片选择器（优先）
   │          └─ 文档选择器（仅图片，兜底）
   │     └─ 用户勾选 → content:// URIs（临时授权）
   │     └─ 原生复制到 cacheDir/album-picker/，HEIC 转 JPEG
   │     └─ 返回 [{ path, name, mimeType, size }]
   │     └─ JS: convertFileSrc(path) → fetch → Blob → new File(...)
   │     └─ 清空缓存目录
   │
   └─ Web：<input type="file" accept="image/*" multiple>
   │
   ▼
acceptFiles(files)（现有 ChatInput.tsx:145-163）
   ▼
addDraftFiles → validateFiles → 上传队列 → 草稿缩略图 → 发送
```

**关键点：`acceptFiles` 之后的代码一行不改。**

## 5. 原生层设计

### 5.1 依赖与注册

`android/app/build.gradle` 的 `dependencies`（`:60-70`）加一行，版本沿用 `variables.gradle` 里已有的值：

```groovy
implementation "androidx.activity:activity:$androidxActivityVersion"
```

`MainActivity.java:20-21` 改为**先注册插件再 `super.onCreate`**（Capacitor 要求插件注册发生在桥创建之前）：

```java
@Override
protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(AlbumPickerPlugin.class);
    super.onCreate(savedInstanceState);
    // ...现有 safe-area 逻辑不动
}
```

`AndroidManifest.xml` 不需要新增任何权限（对比现有只声明了 `INTERNET` 与 `RECORD_AUDIO`，`:40-42`）。

### 5.2 插件骨架

```java
@CapacitorPlugin(name = "AlbumPicker")
public class AlbumPickerPlugin extends Plugin {

    private static final String CACHE_DIR = "album-picker";
    private static final int MAX_EDGE = 4096;

    @PluginMethod
    public void pickImages(PluginCall call) {
        int limit = Math.max(1, Math.min(call.getInt("limit", 9), 50));
        Intent intent = buildIntent(limit);
        try {
            startActivityForResult(call, intent, "onPicked");
        } catch (ActivityNotFoundException e) {
            call.reject("photo picker unavailable");
        }
    }

    private Intent buildIntent(int limit) {
        if (limit == 1) {
            // PickMultipleVisualMedia 要求 maxItems > 1，只剩一个名额时用单选契约
            return new ActivityResultContracts.PickVisualMedia()
                    .createIntent(getContext(), request());
        }
        int max = limit;
        if (Build.VERSION.SDK_INT >= 33) {
            max = Math.min(max, MediaStore.getPickImagesMaxLimit());
        }
        return new ActivityResultContracts.PickMultipleVisualMedia(Math.max(2, max))
                .createIntent(getContext(), request());
    }

    private PickVisualMediaRequest request() {
        return new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
                .build();
    }
}
```

为什么不用裸 `Intent(MediaStore.ACTION_PICK_IMAGES)`：Android 11 / 12 的回填、以及 API 24–29 的退路（`ACTION_OPEN_DOCUMENT`，仅图片、带 `EXTRA_ALLOW_MULTIPLE`）都由 androidx 的契约处理，裸 Intent 要自己判断三套分支和数量上限。

为什么不用 `registerForActivityResult`：`ActivityResultLauncher` 必须在 Activity 进入 STARTED 之前注册，插件 `load()` 的时机和 Activity 生命周期耦合；Capacitor 自带 `startActivityForResult` + `@ActivityCallback` 更稳，也天然支持旋转后的回调恢复。

### 5.3 读取结果

`ACTION_PICK_IMAGES` 多选结果在 `ClipData` 里，单选在 `getData()` 里，两条都要处理：

```java
@ActivityCallback
private void onPicked(PluginCall call, ActivityResult result) {
    if (call == null) return;                       // 进程被回收后回调丢失，直接返回
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
        call.resolve(new JSObject().put("files", new JSArray()));   // 取消 → 空数组，不是错误
        return;
    }
    List<Uri> uris = readUris(result.getData());
    // 复制是 IO，放后台线程；完成后回主线程 resolve
    new Thread(() -> {
        JSArray files = new JSArray();
        for (int i = 0; i < uris.size(); i++) {
            try {
                files.put(copyToCache(uris.get(i), i));
            } catch (IOException ignored) {
                // 单张失败跳过，不拖垮整批
            }
        }
        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        });
    }).start();
}
```

### 5.4 复制、命名与 HEIC

逐张处理：

1. `resolver.getType(uri)` 取 MIME；缺失时按扩展名反推。
2. `OpenableColumns.DISPLAY_NAME` / `SIZE` 取原始名与大小（拿不到就自己拼 `IMG_<时间戳>_<序号>`）。
3. 文件名做一次清洗（去掉 `/ \ : * ? " < > |` 和控制字符），没有扩展名时按 MIME 补。
4. 复制到 `context.getCacheDir()/album-picker/<uuid>.<ext>`，返回 `Uri.fromFile(out).toString()`。

**HEIC / HEIF 必须转码**，否则两边都会挂：

- `src/services/uploadExts.ts:2-4` 的白名单明确不含 `heic / heif`，上传会直接报「暂未支持的文件格式」；
- WebView 的 `<img>` 也解不了 HEIC，草稿缩略图会是破图。

做法：MIME 是 `image/heic` / `image/heif` 时用 `ImageDecoder`（API 28+，HEIC 机型必然满足）解码，按长边 4096 等比缩放（`setTargetSize`，避免整张 50MP 进内存），压成 JPEG（质量 92），文件名改成 `.jpg`、MIME 改成 `image/jpeg`。`ImageDecoder` 会按 EXIF 方向自动摆正，不会出现横竖颠倒。

其余格式（JPEG / PNG / WebP / GIF / AVIF 等）**原样复制字节**，保留 EXIF 与动图帧；尺寸压缩继续交给现有的 `resizeUploadImage`，保证「历史里存原图、上传时压到 4096」这条现有规则不被打破。

### 5.5 数量上限

- JS 传入 `limit = MAX_COUNT - 当前草稿附件数`（`MAX_COUNT = 50`，`src/services/attachments.ts:19`）。
- 原生侧再夹一层：`min(limit, 系统上限)`；`limit == 1` 走单选契约。
- 万一用户选超了（比如系统对回填版本的限额判断有偏差），现有 `validateFiles` 会整批拒绝并提示「上传文件最多支持 50 个」——与文件选择的行为一致，不额外发明规则。

### 5.6 隐私

- 不申请、不读取媒体库；只拿到用户勾选的那几个 `content://`。
- 这些 URI 的读权限是临时的、跟着本次选择走，进程重启即失效，所以必须**选完立刻复制**，不能把 `content://` 存进 IndexedDB。
- 复制出来的缓存文件在下次选择前清空，JS 读完也主动清一次；`cacheDir` 本身可被系统回收。
- 不改 `AndroidManifest.xml`，不触发「照片和视频」权限弹窗——这也是相对「自建相册」最大的体验优势。

### 5.7 拍照（`takePhoto`）

拍照走系统相机，不自建取景器，因此**不需要 `CAMERA` 权限**：调用方只是拉起一个已经装了相机的应用，权限属于那个相机应用。

1. `MediaStore.ACTION_IMAGE_CAPTURE` + `EXTRA_OUTPUT`，输出到 `cacheDir/camera/IMG_<时间戳>.jpg`。
2. 输出 Uri 由现有 `FileProvider`（`AndroidManifest.xml:27-35`，`res/xml/file_paths.xml` 的 `cache-path`）提供，按 `${applicationId}.fileprovider` 取 authority。
3. 除了 `EXTRA_OUTPUT`，还要给 `FLAG_GRANT_WRITE_URI_PERMISSION | FLAG_GRANT_READ_URI_PERMISSION` 并 `setClipData(ClipData.newRawUri("", uri))`：部分相机应用只从 ClipData 里取授权，只给 `EXTRA_OUTPUT` 会写失败。
4. `ACTION_IMAGE_CAPTURE` 不回传图片，所以拍照前把输出文件记在 `pendingPhoto` 字段里，回调里检查「文件存在且长度大于 0」，否则当作取消。
5. 结果同样走 `resolveFiles`：一次只有一张，仍复制到 `album-picker/` 再交给 Web 层，保证「相册 / 拍照 / 文件」三条入口拿到的都是同一种结构。
6. 取消、相机不可用、写入失败都返回空数组或 `reject`，由界面静默处理。

Web 降级用 `<input type="file" accept="image/*" capture="environment">`：手机浏览器会直接开相机，桌面浏览器退化成选文件，不影响使用。

## 6. Web 层设计

### 6.1 模块

新增 `src/services/platform/albumPicker.ts`，与 `src/services/platform/shareFile.ts` 同层，沿用 `Capacitor.isNativePlatform()` 的判断习惯（`shareFile.ts:27`）：

```ts
import { Capacitor, registerPlugin } from '@capacitor/core'

type PickedFile = { path: string; name: string; mimeType: string; size: number }

interface AlbumPickerPlugin {
  pickImages(options: { limit: number }): Promise<{ files: PickedFile[] }>
  takePhoto(): Promise<{ files: PickedFile[] }>
  clearCache(): Promise<void>
}

const AlbumPicker = registerPlugin<AlbumPickerPlugin>('AlbumPicker')

/** 只有原生壳里才有系统照片选择器；浏览器走 input 降级 */
const native = Capacitor.getPlatform() === 'android'

export const pickAlbumImages = async (limit: number): Promise<File[]> => {
  if (!native) {
    return pickWithInput(limit)
  }
  const { files } = await AlbumPicker.pickImages({ limit })
  const picked = await Promise.all(files.map(toFile))
  void AlbumPicker.clearCache().catch(() => {})   // 读完就清，失败不影响结果
  return picked
}

const toFile = async ({ path, name, mimeType }: PickedFile) => {
  // Capacitor 把 file:// 映射到 https://localhost/_capacitor_file_/...
  const blob = await (await fetch(Capacitor.convertFileSrc(path))).blob()
  return new File([blob], name, { type: mimeType || blob.type })
}
```

返回 `File[]` 而不是自定义结构，是为了让 `acceptFiles` / `addDraftFiles` 完全无感。

上面的代码是示意，实际实现多两处：`takePhoto()` 与相册共用 `readPicked`（读完统一 `clearCache`），`toFile` 对单张失败返回 `null` 而不是整批 reject——一张图解码失败不应该拖垮整批选择。

### 6.2 浏览器降级

```ts
const pickWithInput = (limit: number) =>
  new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'      // 注意：MIME，不是扩展名清单；手机浏览器会直接开相册
    input.multiple = true
    input.style.display = 'none'
    document.body.append(input)
    const done = () => {
      const files = Array.from(input.files ?? []).slice(0, limit)
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', done, { once: true })
    input.addEventListener('cancel', () => { input.remove(); resolve([]) }, { once: true })
    input.click()
  })
```

- 取消时 resolve `[]`，调用方统一按「没选」处理，不弹错。
- `cancel` 事件在 Chrome 113+ / Safari 16.4+ 才有；更老的浏览器取消后 Promise 会悬着，但因为不展示 loading 状态，用户感知只是「没反应」，可以接受；如需兜底可加 `visibilitychange` 判断。

### 6.3 取消与失败语义

| 情况 | 插件返回 | 调用方 |
| --- | --- | --- |
| 用户取消 | `{ files: [] }` | 静默返回 |
| 全部复制失败 | `{ files: [] }`（逐张跳过） | 静默返回（可加一条 toast） |
| 选择器不可用 | `call.reject` | catch 后 toast「无法打开相册」 |
| 回调丢失（进程被回收） | 永不 resolve | 无 loading，无残留状态 |

## 7. 入口交互

### 7.1 移动端（< 768px，`src/app/viewport.ts:4`）

对齐官方：回形针改成**附件托盘**——点一下，功能行下方展开三个大按钮（`拍照` / `相册` / `文件`），再点一次收起。

- 托盘是输入框容器内的普通块，输入框是吸底布局（`src/components/session/SessionView.module.css` 的 `.inputContainer`），托盘撑高后输入框自然上抬，正好是官方截图里「对话框上抬」的效果。
- 开合有过渡：托盘常驻挂载，用 `grid-template-rows: 0fr → 1fr`（200ms）过渡高度，因此高度仍由内容决定、不写死像素；内部三格同时淡入并从下方位移 4px。收起动画播完后才把 `visibility` 置为 `hidden`，避免动画期间按钮仍可聚焦。
- 三个入口都放：`拍照` / `相册` / `文件`，与官方一致；三者共用 `pickFromSystem` 的前置检查（导入态、会话就绪、API Key）。
- 打开托盘与唤起选择器前先 `blur()` 当前焦点，避免从选择器回来时键盘又弹起来遮住刚选好的缩略图。
- 托盘用 `useDismiss`（`src/components/base/anchored.ts`）处理点外部关闭。
- 系统开启「减少动态效果」（`prefers-reduced-motion: reduce`）时直接切换，不播过渡。

### 7.2 桌面端

同一个回形针，用现成的 `Menu`（`src/components/base/Menu.tsx`）下拉两项「相册 / 文件」。桌面上两者最终都落到 `<input>`，只是 `accept` 不同（`image/*` vs 现有扩展名清单）。

桌面不提供「拍照」：`capture` 属性在桌面浏览器上没有意义，反而会多一个打开本地摄像头选文件的入口，容易让人误解成应用内拍照。

`Menu` 本身也加了进出场过渡（`src/components/base/Menu.tsx` + `Menu.module.css`）：挂载时先量好位置再切到可见态，用 `usePresence`（`src/components/base/presence.ts`）在关闭后多留 180ms 播完淡出与 0.96 → 1 的缩放，因此**模型选择浮窗**、桌面附件菜单、会话与消息的右键菜单都一起有了开合动画。模型选择按钮在展开时箭头翻转 180°。

### 7.3 文案与图标

`src/i18n/zh.ts` / `src/i18n/en.ts` 各加：

| key | 中文 | English |
| --- | --- | --- |
| `uploadAttachments` | 添加附件 | Add attachments |
| `uploadFromAlbum` | 相册 | Album |
| `uploadFromCamera` | 拍照 | Camera |
| `uploadPickFailed` | 无法打开相册或相机，请重试 | Could not open the album or camera. Please try again. |

图标：`src/components/base/icons.tsx` 原本 44 个图标里没有相册 / 相机 / 文件的独立图标（只有 `IconPaperclipOutline16`、`IconUploadOutline14`）。新增 `IconPlusOutline16`（托盘开关）、`IconImageOutline20`、`IconCameraOutline20`、`IconFileOutline20`，线宽与 `IconModelOutline16` 一致。

### 7.4 ChatInput 改动点

```tsx
// 三条入口共用一个预检：导入态 / 会话就绪 / API Key，避免用户白选一轮
const pickFromSystem = async (pick: () => Promise<File[]>) => {
  if (useChatStore.getState().importingHistory) return
  if (!ensureChatReady() || !active) return
  if (!active.provider.apiKey) { openSettings('providers'); return }
  setTrayOpen(false)
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  try {
    acceptFiles(await pick())
  } catch {
    showToast({ key: 'uploadPickFailed' })
  }
}

const openAlbum = () => void pickFromSystem(() => pickAlbumImages(MAX_COUNT - attachments.length))
const openCamera = () => void pickFromSystem(takePhoto)
```

注意 `acceptFiles`（`ChatInput.tsx:153-171`）里已有 Key / 导入态 / 数量校验，这里的前置检查只是为了「不白选一次」，不是重复逻辑。选择器返回后输入框会失焦，主动 `blur()` 是为了回来时键盘不再弹起来挡住缩略图。

## 8. 边界情况

| 场景 | 行为 |
| --- | --- |
| 系统选择器返回空 / 取消 | 静默，无 toast |
| 选中的图片里有 HEIC | 原生转 JPEG 后照常上传 |
| 单张超过 64MB | 现有 `validateFiles` 拒绝，提示 `uploadMaxMBSize` |
| 加上已有附件超过 50 个 | 现有 `validateFiles` 整批拒绝，提示 `uploadMaxFiles`（与文件选择一致，不静默截断） |
| 自定提供商（Files API 关闭） | 图片本来就走内联 base64，相册入口可用；反而是「文件」入口会提示 `uploadImageOnly` |
| 没有 API Key | 打开选择器前就跳设置 |
| 正在导入历史 | 按钮禁用 + `acceptFiles` 拦截 |
| 选择期间旋转 / 分屏 | `MainActivity` 已声明 `configChanges`（`AndroidManifest.xml:13`），系统选择器自己重建 |
| 选择期间 App 被回收 | Capacitor 回调丢失；因为没有 loading 状态，不会留下卡住的界面 |
| 同一张图连选两次 | 两个独立附件、两次上传，与现在选两次文件一致 |
| 文件名重复 / 非法字符 | 原生清洗文件名，草稿用本地 id 做主键，不冲突 |
| WebView 里 `fetch(convertFileSrc(...))` 失败 | catch 后 toast「无法打开相册或相机，请重试」；不影响文件入口 |

## 9. 测试清单

- [ ] Android 15（ColorOS / HyperOS）：点相册出现与官方一致的「选择项目 / 照片 · 相册 / 最近」；多选 9 张；全部出现在草稿并上传成功。
- [ ] Android 13：系统照片选择器，无权限弹窗；返回键取消无异常。
- [ ] Android 12 与 Android 7（API 24）：回填选择器或文档选择器；仍能多选图片。
- [ ] 三星 / Pixel 的 HEIC 原图：草稿缩略图正常，上传成功，扩展名变 `.jpg`。
- [ ] 50 张上限、64MB 上限、GIF 动图、竖拍 EXIF 方向。
- [ ] 选择过程中旋转、切后台再回来。
- [ ] 桌面 Chrome、Android Chrome（Web 降级）走 `accept="image/*"`。
- [ ] 深浅色主题下托盘样式；768px 断点两侧入口不重复不缺失。
- [ ] 托盘展开 / 收起、模型选择浮窗进出的过渡是否顺滑；系统「减少动态效果」时不应有动画。

## 10. 实施拆分

| 阶段 | 内容 | 主要文件 |
| --- | --- | --- |
| 1 | 原生插件 + JS 服务，先用临时按钮跑通「选图 → 上传」 | `AlbumPickerPlugin.java`、`MainActivity.java`、`app/build.gradle`、`albumPicker.ts` |
| 2 | 入口 UI（移动托盘 / 桌面菜单）、文案、图标 | `ChatInput.tsx`、`ChatInput.module.css`、`i18n/*.ts`、`icons.tsx` |
| 3 | 拍照（`ACTION_IMAGE_CAPTURE` + 现有 FileProvider） | 同插件、`albumPicker.ts`（拍照不需要 `CAMERA` 权限） |
| 4 | 文档与回归 | `README.md`、`README.zh-CN.md`、本文件 |

## 11. 风险与回退

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| AndroidX 大版本变化导致 `PickVisualMedia` API 变动 | 编译失败 | 版本已由 `android/variables.gradle:6` 锁在 1.11.0，跟 Capacitor 同步升级 |
| 低版本 WebView 不支持 `https://localhost/_capacitor_file_` | 取不到文件 | 概率极低（Capacitor 3 起就是这个机制）；失败时 toast 并保留文件入口 |
| 缓存目录残留大图 | 占空间 | 每次选择前清空 + JS 读完清一次；`cacheDir` 系统可回收 |
| 回填版本的选择器上限与本地判断不一致 | 多选被系统截断 | 系统会按上限截断，不报错；数量最终仍由 `validateFiles` 把关 |

回退很简单：删掉插件类、`MainActivity` 的注册行、`albumPicker.ts` 和入口改动即可回到今天的行为，没有数据迁移、没有 schema 变化。

## 12. 已确认的取舍

实现前留了三个待确认问题，结论如下（均已落地）：

1. **入口按官方改托盘**：移动端点加号展开「拍照 / 相册 / 文件」三格，再点收起；回形针在移动端不再直连文件管理器。桌面端保持回形针 + 下拉菜单（相册 / 文件）。
2. **拍照本期一起做**：`takePhoto` 与相册共用插件和结果结构；因为不自建取景器、只拉起系统相机，所以不新增 `CAMERA` 权限。
3. **单次上限沿用 50**：JS 传 `MAX_COUNT - 当前附件数`，原生夹在 1..50 与系统上限之间，与文件入口同一套规则，不额外发明更小的数字。

# DeepChat

English | [简体中文](README.zh-CN.md)

A local-first web chat client: chats and attachments stay on your device, and the browser calls the model API directly, so no server of your own is needed. The same frontend packages into an Android app.

## Getting started

Requires Node.js 22 or newer and pnpm:

```sh
git clone https://github.com/Wrderly/DeepSeekChat.git
cd DeepSeekChat
pnpm install
pnpm dev
```

Open http://localhost:8090 and add your API Key under Settings → Data to start chatting.

Build the static bundle:

```sh
pnpm build
```

The output lives in `dist/`, ready for any static host or for the Android shell.

## Features

- **Chats**: create chats, auto-title them from the first question, rename and delete; switch between message branches; branch a new chat from any message, carrying that question and answer along.
- **Message editing**: edit a question in place, or edit the assistant's thinking and answer, with changes written into the context immediately. Question, thinking and answer editors have distinct looks and share the same Cancel / Save actions.
- **Conversation**: streaming replies, deep thinking, smart search, link reading with source citations; stop a reply at any time and continue it when eligible.
- **Generation parameters**: thinking effort, temperature, top P, max output and stop sequences. Settings → Model parameters stores defaults for new chats; the Session settings entry at the bottom of the composer overrides or resets them per chat; a new chat can preset them before the first message.
- **System prompt**: set per chat; the built-in prompt applies when the field is empty.
- **Input**: multi-line composer (Enter sends, Shift+Enter adds a line), attachments by upload / paste / drag, voice input, and read-aloud replies.
- **Rendering**: Markdown, syntax highlighting, KaTeX math, Mermaid diagrams and source citation cards.
- **Interface**: Simplified Chinese and English, light / dark / follow-system themes, mobile layout and a collapsible sidebar; mobile recording shows a live spectrum on the composer's first line.
- **Data management**: import and export history (ZIP), delete all chats.
- **Context hints**: every request carries the current date, weekday, region, platform and language.

## Settings

| Setting | Purpose |
| --- | --- |
| API Key | Stored locally; used for chat, files, speech and read-aloud requests |
| Language | Simplified Chinese or English |
| Theme | Light, dark, or follow the system |
| Location | Region info used for the in-conversation context hint |
| Read-aloud voice | Voice used when reading replies |
| Model parameters | Default thinking effort, temperature, top P, max output and stop sequences for new chats |

## Data and storage

The API Key and settings live in localStorage (keys prefixed `deepseek-chat:`), while chats and attachment originals live in IndexedDB (database `deepseek-chat`). Local data is scoped to the browser profile and site origin. Sending a message, uploading attachments, voice input and read-aloud send the corresponding content to the configured API service.

History import and export use ZIP; the format is documented in [history import and export](src/services/chat/history/README.md). Exports contain all chats plus available image originals; an import replaces local chats and attachments once validation passes.

Settings → Data → Delete all chats clears every local chat, attachment original and unsent draft, and stops any reply in progress.

## Development

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Build into `dist/` |
| `pnpm type` | TypeScript type check |
| `pnpm lint` | oxlint check |
| `pnpm format` | oxfmt formatting |
| `pnpm android:sync` | Sync the web build into the Android project |

[rspack.config.ts](rspack.config.ts) points at `https://api.deepseek.com` by default; `createConfig({ apiOrigin, devServer })` accepts a custom API origin and dev-server proxy.

Chat defaults to `deepseek-flash` and talks over the Anthropic-compatible Messages / Files API, with speech on the ASR / TTS endpoints. Requests use extensions such as search, link reading, title and `latest_reminder`. Attachment formats follow server-side validation.

```text
src/
  app/                  app shell, theme and global styles
  components/           chat, settings and Markdown UI
  i18n/                 Chinese and English copy
  services/
    api/                API requests, SSE and protocol types
    chat/               chats, message branches, local storage, history import/export
    markdown/           Markdown parsing, highlighting and diagrams
    platform/           native shell adapters (back button, file sharing)
    speech/             recording and read-aloud
  utils/                shared utilities
android/               Capacitor Android project
```

## Android app

The repo ships a [Capacitor](capacitor.config.ts) shell (`android/`) plus a GitHub Actions pipeline that produces a sideloadable APK.

```sh
pnpm build                 # build the web bundle into dist/
pnpm android:sync          # copy it into android/app/src/main/assets
cd android && ./gradlew assembleRelease
```

A push to `main` makes [android.yml](.github/workflows/android.yml) build the APK and upload it as an artifact; pushing a `v*` tag also attaches it to a GitHub Release.

### Signing

1. Run [keystore.yml](.github/workflows/keystore.yml) once: Actions → Generate Android keystore → Run workflow, choose an alias and password, then download the generated `keystore.base64.txt`.
2. Add four repository secrets: `ANDROID_KEYSTORE_BASE64` (the full file), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.
3. Every later build is signed with that key, so installed versions upgrade in place. Back up the key and password — they decide whether future versions can install over older ones.

### Versioning

The version comes from `version` in `package.json`, and `versionCode` is derived from semver (`0.1.3` → `103`). Bump `version` before packaging a release.

### Android behaviour

The back button steps out gradually (closes overlays and the sidebar drawer, then walks history, then exits), ZIP exports open the system share sheet, voice input has the microphone permission it needs, and the layout respects full-screen insets.

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; keep it when redistributing. Third-party dependencies keep their own licenses.

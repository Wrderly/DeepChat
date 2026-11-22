import { Capacitor, registerPlugin } from '@capacitor/core'

/** 原生选择器返回的文件描述；path 指向应用缓存目录里的临时副本 */
export type PickedFile = {
  path: string
  name: string
  mimeType: string
  size: number
}

type PickerResult = { files: PickedFile[] }

interface AlbumPickerPlugin {
  pickImages(options: { limit: number }): Promise<PickerResult>
  takePhoto(): Promise<PickerResult>
  clearCache(): Promise<void>
}

/** 原生壳里的薄插件，实现在 AlbumPickerPlugin.java；浏览器里不会调用到它 */
const AlbumPicker = registerPlugin<AlbumPickerPlugin>('AlbumPicker')

const isNative = () => Capacitor.isNativePlatform()

/**
 * 把缓存副本读成 File：content:// 不能进 IndexedDB，而且选择器给的读权限只在本次会话有效，
 * 所以原生侧先复制到 cacheDir，这里再一次性读进内存。
 */
const toFile = async ({ path, name, mimeType }: PickedFile): Promise<File | null> => {
  try {
    const response = await fetch(Capacitor.convertFileSrc(path))
    if (!response.ok) {
      return null
    }
    const blob = await response.blob()
    return new File([blob], name, { type: mimeType || blob.type })
  } catch {
    return null
  }
}

/** 读完就清缓存：附件原件随后由草稿链路写进 IndexedDB，缓存副本不再需要 */
const readPicked = async (files: PickedFile[]): Promise<File[]> => {
  const results = await Promise.all(files.map(toFile))
  if (isNative()) {
    void AlbumPicker.clearCache().catch(() => {})
  }
  return results.filter((file): file is File => file !== null)
}

/**
 * 浏览器降级：动态创建 input，选完即移除。
 * 取消依赖 cancel 事件（Chrome 113+ / Safari 16.4+），更老的浏览器干脆不返回，
 * 因为界面没有等待态，悬空不影响使用。
 */
const pickWithInput = (accept: string, limit: number, capture = false) =>
  new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = !capture
    if (capture) {
      input.setAttribute('capture', 'environment')
    }
    input.style.display = 'none'
    document.body.append(input)

    let settled = false
    const finish = (files: File[]) => {
      if (settled) {
        return
      }
      settled = true
      input.remove()
      resolve(files)
    }

    input.addEventListener('change', () => finish(Array.from(input.files ?? []).slice(0, limit)), {
      once: true,
    })
    // cancel 不在 HTMLInputElement 的标准事件映射里，用通用事件重载监听
    input.addEventListener('cancel', () => finish([]), { once: true })
    input.click()
  })

/**
 * 打开系统照片选择器（多选）。返回空数组表示用户取消；失败时抛出，由调用方提示。
 * limit 为本次最多可选数量，原生侧限制在 1..50。
 */
export const pickAlbumImages = async (limit: number): Promise<File[]> => {
  const max = Math.max(1, Math.floor(limit))
  if (!isNative()) {
    return pickWithInput('image/*', max)
  }
  const { files } = await AlbumPicker.pickImages({ limit: max })
  return readPicked(files)
}

/** 打开系统相机；取消返回空数组 */
export const takePhoto = async (): Promise<File[]> => {
  if (!isNative()) {
    return pickWithInput('image/*', 1, true)
  }
  const { files } = await AlbumPicker.takePhoto()
  return readPicked(files)
}

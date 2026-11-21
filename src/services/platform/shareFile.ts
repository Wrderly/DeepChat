import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** 把 Blob 读成不带 data URL 前缀的 base64，Capacitor 的 Filesystem 只接受这种格式。 */
const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => {
      const { result } = reader
      if (typeof result !== 'string') {
        reject(new Error('read failed'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })

/**
 * 原生壳里把文件写进应用缓存目录并唤起系统分享面板。
 * 浏览器里返回 false，调用方继续用 `<a download>` 下载。
 */
export const shareFile = async (blob: Blob, name: string): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false
  }
  const data = await toBase64(blob)
  const { uri } = await Filesystem.writeFile({
    path: name,
    data,
    directory: Directory.Cache,
    recursive: true,
  })
  await Share.share({ title: name, url: uri, dialogTitle: name })
  return true
}

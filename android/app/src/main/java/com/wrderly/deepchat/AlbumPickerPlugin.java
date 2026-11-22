package com.wrderly.deepchat;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.ImageDecoder;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * 相册与拍照入口：调用系统照片选择器与系统相机，把选中项的临时授权复制到应用缓存目录，
 * 再把可以自由读取的文件路径交给 Web 层。
 *
 * 不申请任何存储权限：照片选择器只把当前选中项的读权限临时授予本应用，复制完即可断开，
 * 也不需要 READ_MEDIA_IMAGES。相机用 MediaStore.ACTION_IMAGE_CAPTURE 输出到 FileProvider，
 * 同样不需要 CAMERA 权限（本应用没有在清单里声明它）。
 */
@CapacitorPlugin(name = "AlbumPicker")
public class AlbumPickerPlugin extends Plugin {

    /** 选择结果的缓存目录，与相机输出目录分开，清理由前端在读完之后触发 */
    private static final String PICK_DIR = "album-picker";
    private static final String CAMERA_DIR = "camera";
    /** 转码后的长边上限与 Web 层的 resizeUploadImage 保持一致 */
    private static final int MAX_EDGE = 4096;
    private static final int JPEG_QUALITY = 92;
    /** 文件名过长在部分文件系统上会创建失败，截断时保留扩展名 */
    private static final int MAX_NAME_LENGTH = 60;

    /** 相机输出文件：ACTION_IMAGE_CAPTURE 不通过返回的 Intent 带回图片，只能自己记住写入位置 */
    @Nullable
    private File pendingPhoto;

    /** 打开系统照片选择器；limit 为单次可选数量，1 张时用单选契约 */
    @PluginMethod
    public void pickImages(final PluginCall call) {
        final AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.reject("no activity");
            return;
        }
        final Integer requested = call.getInt("limit", 9);
        final int limit = Math.max(1, Math.min(requested == null ? 9 : requested, 50));
        activity.runOnUiThread(() -> {
            // 上一次的结果如果没被读走（比如 fetch 失败），下次打开前清掉，避免缓存无限增长
            deleteChildren(new File(getContext().getCacheDir(), PICK_DIR));
            try {
                startActivityForResult(call, buildPickIntent(limit), "onPicked");
            } catch (ActivityNotFoundException e) {
                call.reject("picker unavailable");
            }
        });
    }

    /** 打开系统相机；取消或失败都返回空数组，由界面静默处理 */
    @PluginMethod
    public void takePhoto(final PluginCall call) {
        final AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.reject("no activity");
            return;
        }
        activity.runOnUiThread(() -> {
            File dir = ensureDir(CAMERA_DIR);
            if (dir == null) {
                call.reject("cache unavailable");
                return;
            }
            deleteChildren(dir);
            File output = new File(dir, "IMG_" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", output);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, uri)
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // 部分相机应用只认 ClipData 里的授权，EXTRA_OUTPUT 单独给不够；setClipData 返回 void，不能串在构造链上
            intent.setClipData(ClipData.newRawUri("", uri));
            pendingPhoto = output;
            try {
                startActivityForResult(call, intent, "onPhotoTaken");
            } catch (ActivityNotFoundException e) {
                pendingPhoto = null;
                output.delete();
                call.reject("camera unavailable");
            }
        });
    }

    /** 前端读完文件后调用；也用于清理异常中断留下的残片 */
    @PluginMethod
    public void clearCache(PluginCall call) {
        deleteChildren(new File(getContext().getCacheDir(), PICK_DIR));
        deleteChildren(new File(getContext().getCacheDir(), CAMERA_DIR));
        call.resolve();
    }

    /**
     * 单选时用 PickVisualMedia、多选时用 PickMultipleVisualMedia：后者要求数量大于 1，
     * 且不能超过系统选择器的上限（Android 13 起由 MediaStore 给出）。
     */
    private Intent buildPickIntent(int limit) {
        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
                .build();
        if (limit <= 1) {
            return new ActivityResultContracts.PickVisualMedia().createIntent(getContext(), request);
        }
        int max = limit;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            max = Math.min(max, MediaStore.getPickImagesMaxLimit());
        }
        return new ActivityResultContracts.PickMultipleVisualMedia(Math.max(2, max))
                .createIntent(getContext(), request);
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            resolveFiles(call, new ArrayList<>());
            return;
        }
        resolveFiles(call, readUris(result.getData()));
    }

    @ActivityCallback
    private void onPhotoTaken(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        File photo = pendingPhoto;
        pendingPhoto = null;
        if (result.getResultCode() != Activity.RESULT_OK || photo == null
                || !photo.isFile() || photo.length() == 0) {
            if (photo != null) {
                photo.delete();
            }
            resolveFiles(call, new ArrayList<>());
            return;
        }
        List<Uri> uris = new ArrayList<>();
        uris.add(Uri.fromFile(photo));
        resolveFiles(call, uris);
    }

    /** 多选结果可能在 ClipData 里，单选结果在 data 上；同一张图只保留一次 */
    private static List<Uri> readUris(Intent data) {
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null && !uris.contains(uri)) {
                    uris.add(uri);
                }
            }
        }
        Uri single = data.getData();
        if (uris.isEmpty() && single != null) {
            uris.add(single);
        }
        return uris;
    }

    /** 复制到缓存目录在后台线程进行，大图与 HEIC 转码不会卡住界面 */
    private void resolveFiles(final PluginCall call, final List<Uri> uris) {
        new Thread(() -> {
            JSArray files = new JSArray();
            for (int i = 0; i < uris.size(); i++) {
                JSObject item = copyToCache(uris.get(i), i);
                if (item != null) {
                    files.put(item);
                }
            }
            JSObject result = new JSObject();
            result.put("files", files);
            AppCompatActivity activity = getActivity();
            if (activity != null) {
                activity.runOnUiThread(() -> call.resolve(result));
            } else {
                call.resolve(result);
            }
        }).start();
    }

    /**
     * 把一张图落到缓存里并返回展示信息。HEIC/HEIF 必须转成 JPEG：WebView 解不了，
     * 上传白名单里也没有这两个扩展名。
     */
    @Nullable
    private JSObject copyToCache(Uri uri, int index) {
        File dir = ensureDir(PICK_DIR);
        if (dir == null) {
            return null;
        }
        ContentResolver resolver = getContext().getContentResolver();
        String mime = resolver.getType(uri);
        String displayName = queryDisplayName(resolver, uri);
        String ext = extensionOf(displayName);
        if (ext.isEmpty()) {
            ext = extensionOf(uri.getLastPathSegment());
        }
        if (ext.isEmpty()) {
            ext = guessExtension(mime);
        }
        if (ext.isEmpty()) {
            ext = "jpg";
        }
        String mimeType = mime != null ? mime : guessMime(ext);

        String base = stripExtension(displayName);
        if (base == null || base.trim().isEmpty()) {
            base = "IMG_" + System.currentTimeMillis() + "_" + index;
        }
        base = sanitize(base);

        // 磁盘名加随机前缀保证不重名；返回给界面的仍是清洗后的原始名
        String prefix = UUID.randomUUID().toString().substring(0, 8) + "_";

        if (isHeic(mimeType, ext) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            String name = base + ".jpg";
            File out = new File(dir, prefix + name);
            if (!convertHeic(resolver, uri, out)) {
                return null;
            }
            return resultOf(out, name, "image/jpeg");
        }

        String name = base + "." + ext;
        File out = new File(dir, prefix + name);
        if (!copyRaw(resolver, uri, out)) {
            return null;
        }
        return resultOf(out, name, mimeType);
    }

    private static JSObject resultOf(File file, String name, String mimeType) {
        JSObject item = new JSObject();
        item.put("path", file.getAbsolutePath());
        item.put("name", name);
        item.put("mimeType", mimeType);
        item.put("size", file.length());
        return item;
    }

    private static boolean copyRaw(ContentResolver resolver, Uri uri, File out) {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return false;
            }
            try (OutputStream os = new FileOutputStream(out)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    os.write(buffer, 0, read);
                }
            }
            return out.length() > 0;
        } catch (IOException | SecurityException e) {
            out.delete();
            return false;
        }
    }

    /** ImageDecoder 自带 EXIF 方向处理，缩放到长边 4096 后按 JPEG 重编码 */
    @RequiresApi(Build.VERSION_CODES.P)
    private static boolean convertHeic(ContentResolver resolver, Uri uri, File out) {
        Bitmap bitmap = null;
        try {
            ImageDecoder.Source source = ImageDecoder.createSource(resolver, uri);
            bitmap = ImageDecoder.decodeBitmap(source, (decoder, info, src) -> {
                int width = info.getSize().getWidth();
                int height = info.getSize().getHeight();
                int longest = Math.max(width, height);
                if (longest > MAX_EDGE) {
                    float scale = MAX_EDGE / (float) longest;
                    decoder.setTargetSize(
                            Math.max(1, Math.round(width * scale)),
                            Math.max(1, Math.round(height * scale)));
                }
            });
            boolean written;
            try (OutputStream os = new FileOutputStream(out)) {
                written = bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, os);
            }
            if (!written || out.length() == 0) {
                out.delete();
                return false;
            }
            return true;
        } catch (IOException | RuntimeException | OutOfMemoryError e) {
            out.delete();
            return false;
        } finally {
            if (bitmap != null) {
                bitmap.recycle();
            }
        }
    }

    @Nullable
    private static String queryDisplayName(ContentResolver resolver, Uri uri) {
        if ("file".equals(uri.getScheme())) {
            return uri.getLastPathSegment();
        }
        try (Cursor cursor = resolver.query(
                uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    String value = cursor.getString(column);
                    if (value != null && !value.trim().isEmpty()) {
                        return value;
                    }
                }
            }
        } catch (RuntimeException ignored) {
            // 少数提供方不支持查询，退回用 URI 末段
        }
        return uri.getLastPathSegment();
    }

    @Nullable
    private File ensureDir(String child) {
        File dir = new File(getContext().getCacheDir(), child);
        if (dir.isDirectory()) {
            return dir;
        }
        return dir.mkdirs() ? dir : null;
    }

    private static void deleteChildren(File dir) {
        File[] children = dir.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (child.isDirectory()) {
                deleteChildren(child);
            }
            child.delete();
        }
    }

    private static boolean isHeic(String mimeType, String ext) {
        String mime = mimeType.toLowerCase(Locale.ROOT);
        return mime.equals("image/heic") || mime.equals("image/heif")
                || ext.equals("heic") || ext.equals("heif");
    }

    private static String extensionOf(@Nullable String name) {
        if (name == null) {
            return "";
        }
        int dot = name.lastIndexOf('.');
        if (dot <= 0 || dot == name.length() - 1) {
            return "";
        }
        String ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
        return ext.matches("[a-z0-9]{1,8}") ? ext : "";
    }

    @Nullable
    private static String stripExtension(@Nullable String name) {
        if (name == null) {
            return null;
        }
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private static String guessExtension(@Nullable String mime) {
        if (mime == null) {
            return "";
        }
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        return ext == null ? "" : ext.toLowerCase(Locale.ROOT);
    }

    private static String guessMime(String ext) {
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return mime == null ? "image/jpeg" : mime;
    }

    /** 去掉路径分隔符与控制字符，过长的名字截断但保留扩展名 */
    private static String sanitize(String name) {
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (cleaned.isEmpty()) {
            return "image";
        }
        if (cleaned.length() > MAX_NAME_LENGTH) {
            String ext = extensionOf(cleaned);
            int keep = MAX_NAME_LENGTH - (ext.isEmpty() ? 0 : ext.length() + 1);
            cleaned = cleaned.substring(0, Math.max(1, keep)) + (ext.isEmpty() ? "" : "." + ext);
        }
        return cleaned;
    }
}

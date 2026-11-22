package com.wrderly.deepchat;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * 安卓 15 起应用默认全屏绘制，WebView 会画到状态栏和手势条下面。
 * 这里把系统栏与刘海的内边距换算成 CSS 变量，交给页面自己留白，
 * 这样状态栏区域显示的是页面背景色，跟随浅色/深色主题切换。
 */
public class MainActivity extends BridgeActivity {

    private String safeAreaScript = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 插件必须在 super.onCreate() 之前注册，Bridge 创建时才会带上它
        registerPlugin(AlbumPickerPlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() == null) {
            return;
        }
        final WebView webView = getBridge().getWebView();

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            safeAreaScript = buildSafeAreaScript(bars);
            webView.evaluateJavascript(safeAreaScript, null);
            return windowInsets;
        });

        // 页面重新加载后 html 上的内联样式会被清掉，加载完成时再写一次
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                if (!safeAreaScript.isEmpty()) {
                    view.evaluateJavascript(safeAreaScript, null);
                }
            }
        });

        ViewCompat.requestApplyInsets(webView);
    }

    private String buildSafeAreaScript(Insets bars) {
        float density = getResources().getDisplayMetrics().density;
        return "(() => {"
                + "const style = document.documentElement.style;"
                + "style.setProperty('--safe-area-top', '" + toCssPixels(bars.top, density) + "');"
                + "style.setProperty('--safe-area-right', '" + toCssPixels(bars.right, density) + "');"
                + "style.setProperty('--safe-area-bottom', '" + toCssPixels(bars.bottom, density) + "');"
                + "style.setProperty('--safe-area-left', '" + toCssPixels(bars.left, density) + "');"
                + "})();";
    }

    private String toCssPixels(int physicalPixels, float density) {
        return Math.round(physicalPixels / density) + "px";
    }
}

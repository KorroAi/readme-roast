package com.korroai.deepdown;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Thin native shell around the web build of DEEP DOWN.
 *
 * The game files ship in assets/www and are served from a virtual HTTPS origin
 * (the same scheme AndroidX WebViewAssetLoader uses), because module scripts and
 * persistent storage do not work reliably from file:// URLs. No network access is used.
 *
 * This one source builds two ways: android/build-apk.sh compiles it against the API 23
 * platform (the smoke-test APK) and Gradle against API 36 (the Play bundle). So every call
 * newer than API 23 goes through reflection, or a java.lang.reflect.Proxy for the API 33
 * back callback, guarded by Build.VERSION. The one exception is onRenderProcessGone (API 26),
 * which must be an override: build-apk.sh compiles it against a compile-only stub of
 * RenderProcessGoneDetail (android/stubs), never packaged.
 */
public class MainActivity extends Activity {
    private static final String TAG = "DeepDown";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml");
        MIME.put("wasm", "application/wasm");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("txt", "text/plain");
    }

    // API constants not in the API 23 platform.
    private static final int LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES = 1; // API 28
    private static final int BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE = 2; // API 30
    private static final int PRIORITY_DEFAULT = 0; // API 33 OnBackInvokedDispatcher

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private boolean resumed;
    /** The page wants Back (DeepDownAndroid.setBackHandled): true except at the main menu root. */
    private boolean backHandled = true;
    private Object backCallback; // android.window.OnBackInvokedCallback (API 33+), a Proxy
    private boolean backRegistered;
    /** Display cutout safe insets in device px: left, top, right, bottom. */
    private final int[] insets = new int[4];
    private final long[] rendererDeaths = new long[3];
    private int rendererDeathCount;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Hardware volume keys change the game's (media) volume, not the ringer.
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        // The screen is kept on only while the game says it is being played (see Bridge).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        layoutIntoCutouts();
        // Remote debugging only for debuggable builds (the smoke-test APK), never for Play.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        web = createWebView();
        setContentView(web);
        hideSystemUi();
        updateBackCallback();
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(START_URL);
        }
    }

    private WebView createWebView() {
        WebView w = new WebView(this);
        w.setBackgroundColor(0xff05080c);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        // The UI has its own Large Text setting sized for this layout; don't let the system font
        // scale enlarge text inside fixed-size buttons and panels.
        s.setTextZoom(100);
        w.addJavascriptInterface(new Bridge(), "DeepDownAndroid");
        w.setWebChromeClient(new WebChromeClient());
        w.setWebViewClient(new AssetClient());
        w.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                readCutoutInsets(in);
                pushInsets();
                return v.onApplyWindowInsets(in);
            }
        });
        return w;
    }

    /** Called from the page (window.DeepDownAndroid). Only bundled local pages are ever loaded. */
    private final class Bridge {
        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        /**
         * The page reports whether Back is its to handle (src/main.ts polls this every 250 ms).
         * False only at the main menu root: then the system handles Back with its predictive
         * back-to-home animation instead of asking the page.
         */
        @JavascriptInterface
        public void setBackHandled(final boolean handled) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    backHandled = handled;
                    updateBackCallback();
                }
            });
        }
    }

    private final class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme();
            // In-memory URLs (generated icons are data: PNGs) never touch the network.
            if ("data".equals(scheme) || "blob".equals(scheme)) return null;
            if (!"https".equals(scheme) || !HOST.equals(url.getHost())) {
                // The game is fully offline: refuse anything that is not a bundled file.
                return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, empty());
            }
            String path = url.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
            try {
                InputStream in = getAssets().open("www" + path);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse(mimeFor(path), "utf-8", 200, "OK", headers, in);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, empty());
            }
        }

        // The String overload exists on every API level we support (the request overload is API 24+).
        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (HOST.equals(uri.getHost()) && "https".equals(uri.getScheme())) return false;
            // Links out of the game (licences, store page, support mail) open in the browser or
            // mail app, never inside the game's WebView. Anything else is ignored.
            if ("https".equals(uri.getScheme()) || "mailto".equals(uri.getScheme())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException e) {
                    Log.w(TAG, "no app opens " + uri.getScheme() + " links");
                }
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pushInsets();
        }

        /**
         * API 26+: the renderer crashed or was killed for memory. Returning true keeps the app
         * alive; the dead WebView is replaced and the game reloads (its last autosave is intact).
         * Three losses within a minute end the activity instead of looping.
         */
        @SuppressWarnings("unused")
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view != web) return true; // an older WebView already replaced
            long now = SystemClock.elapsedRealtime();
            rendererDeaths[rendererDeathCount % rendererDeaths.length] = now;
            rendererDeathCount++;
            if (rendererDeathCount >= rendererDeaths.length && now - rendererDeaths[rendererDeathCount % rendererDeaths.length] < 60_000L) {
                Log.e(TAG, "renderer lost 3 times in a minute; closing");
                finish();
                return true;
            }
            Log.w(TAG, "renderer gone, recreating the WebView");
            recreateWebView();
            return true;
        }
    }

    private void recreateWebView() {
        WebView dead = web;
        web = createWebView();
        setContentView(web);
        try {
            dead.destroy();
        } catch (RuntimeException e) {
            Log.w(TAG, "destroying the dead WebView failed", e);
        }
        hideSystemUi();
        web.loadUrl(START_URL);
        if (!resumed) web.onPause();
    }

    private static InputStream empty() {
        return new ByteArrayInputStream(new byte[0]);
    }

    private static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        String m = MIME.get(ext);
        return m != null ? m : "application/octet-stream";
    }

    // ------------------------------------------------------------------------------------
    // Display: edge to edge, into the cutout, system bars hidden

    /** API 28+: draw into the cutout on the short edges (the long sides in landscape). */
    private void layoutIntoCutouts() {
        if (Build.VERSION.SDK_INT < 28) return;
        try {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            WindowManager.LayoutParams.class.getField("layoutInDisplayCutoutMode").setInt(lp, LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES);
            getWindow().setAttributes(lp);
        } catch (Exception e) {
            Log.w(TAG, "cutout mode unavailable", e);
        }
    }

    /** Immersive: WindowInsetsController on API 30+, system UI flags below. */
    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                Window w = getWindow();
                Window.class.getMethod("setDecorFitsSystemWindows", boolean.class).invoke(w, false);
                Object controller = Window.class.getMethod("getInsetsController").invoke(w);
                if (controller != null) {
                    Class<?> wic = Class.forName("android.view.WindowInsetsController");
                    int bars = (Integer) Class.forName("android.view.WindowInsets$Type").getMethod("systemBars").invoke(null);
                    wic.getMethod("setSystemBarsBehavior", int.class).invoke(controller, BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    wic.getMethod("hide", int.class).invoke(controller, bars);
                    return;
                }
            } catch (Exception e) {
                Log.w(TAG, "WindowInsetsController unavailable, using system UI flags", e);
            }
        }
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /** API 28+: the display cutout's safe insets (0 elsewhere). */
    private void readCutoutInsets(WindowInsets in) {
        int[] next = new int[4];
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                Object cutout = WindowInsets.class.getMethod("getDisplayCutout").invoke(in);
                if (cutout != null) {
                    Class<?> dc = Class.forName("android.view.DisplayCutout");
                    String[] names = {"getSafeInsetLeft", "getSafeInsetTop", "getSafeInsetRight", "getSafeInsetBottom"};
                    for (int i = 0; i < 4; i++) next[i] = (Integer) dc.getMethod(names[i]).invoke(cutout);
                }
            } catch (Exception e) {
                Log.w(TAG, "cutout insets unavailable", e);
            }
        }
        System.arraycopy(next, 0, insets, 0, 4);
    }

    /**
     * Hand the cutout insets to the page as CSS variables (--dd-inset-*), in CSS px. styles.css
     * takes the larger of these and env(safe-area-inset-*), which older WebViews leave at 0.
     */
    private void pushInsets() {
        if (web == null) return;
        float d = getResources().getDisplayMetrics().density;
        if (d <= 0) d = 1;
        String[] sides = {"left", "top", "right", "bottom"};
        StringBuilder js = new StringBuilder("(function(s){");
        for (int i = 0; i < 4; i++) {
            js.append("s.setProperty('--dd-inset-").append(sides[i]).append("','")
                    .append(String.format(Locale.ROOT, "%.1f", insets[i] / d)).append("px');");
        }
        js.append("})(document.documentElement.style)");
        web.evaluateJavascript(js.toString(), null);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    // ------------------------------------------------------------------------------------
    // Back: predictive (OnBackInvokedCallback) on API 33+, onBackPressed on 32 and below

    /** Register the back callback while the page wants Back; unregister at the menu root. */
    private void updateBackCallback() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            Class<?> cbClass = Class.forName("android.window.OnBackInvokedCallback");
            Class<?> dispatcherClass = Class.forName("android.window.OnBackInvokedDispatcher");
            Object dispatcher = Activity.class.getMethod("getOnBackInvokedDispatcher").invoke(this);
            if (dispatcher == null) return;
            if (backCallback == null) {
                backCallback = Proxy.newProxyInstance(MainActivity.class.getClassLoader(), new Class<?>[] {cbClass}, new InvocationHandler() {
                    @Override
                    public Object invoke(Object proxy, Method m, Object[] args) {
                        String n = m.getName();
                        if ("onBackInvoked".equals(n)) {
                            askPageForBack();
                            return null;
                        }
                        if ("hashCode".equals(n)) return System.identityHashCode(proxy);
                        if ("equals".equals(n)) return args != null && args.length == 1 && proxy == args[0];
                        if ("toString".equals(n)) return "DeepDownBackCallback";
                        return null;
                    }
                });
            }
            if (backHandled && !backRegistered) {
                dispatcherClass.getMethod("registerOnBackInvokedCallback", int.class, cbClass).invoke(dispatcher, PRIORITY_DEFAULT, backCallback);
                backRegistered = true;
            } else if (!backHandled && backRegistered) {
                dispatcherClass.getMethod("unregisterOnBackInvokedCallback", cbClass).invoke(dispatcher, backCallback);
                backRegistered = false;
            }
        } catch (Exception e) {
            Log.w(TAG, "OnBackInvokedDispatcher unavailable", e);
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // API 32 and below (and API 33+ builds without the predictive-back manifest flag): no
        // system animation to keep, so the page is always asked.
        askPageForBack();
    }

    /**
     * Let the game handle Back (pause / close a screen); exit only from the main menu.
     * The page answers true (handled), false (at the main menu, or on the crash panel: exit) or
     * nothing (a page without a handler, e.g. the Visual Lab): then go back in history.
     * Anonymous class rather than a lambda: the dx dexer used for local builds predates desugaring.
     */
    private void askPageForBack() {
        web.evaluateJavascript("(window.deepDownBack ? window.deepDownBack() : null)", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if ("true".equals(value)) return;
                if (!"false".equals(value) && web.canGoBack()) web.goBack();
                else leave();
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void leave() {
        // API 33+: what the system's own Back does for a root activity since Android 12. The
        // callback stays registered: the page's next setBackHandled decides the next Back.
        if (Build.VERSION.SDK_INT >= 33) moveTaskToBack(true);
        else super.onBackPressed();
    }

    // ------------------------------------------------------------------------------------
    // Lifecycle: the page saves and pauses first, then its timers stop

    @Override
    protected void onPause() {
        resumed = false;
        final WebView w = web;
        // src/main.ts: saveNow('background'), pause, audio suspend. Timers stop once it answered,
        // or after 500 ms if the page is unresponsive.
        final Runnable stopTimers = new Runnable() {
            @Override
            public void run() {
                if (!resumed && w == web) w.pauseTimers();
            }
        };
        w.evaluateJavascript("(window.deepDownLifecycle ? window.deepDownLifecycle('pause') : null)", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                main.removeCallbacks(stopTimers);
                stopTimers.run();
            }
        });
        main.postDelayed(stopTimers, 500);
        w.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        web.resumeTimers();
        web.onResume();
        web.evaluateJavascript("(window.deepDownLifecycle ? window.deepDownLifecycle('resume') : null)", null);
        hideSystemUi();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}

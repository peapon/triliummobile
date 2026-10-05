package org.triliumnotes.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The Android half of the shell.
 *
 * It does three things, and the web bundle does everything else: serve the bundle from a real
 * https origin, answer HTTP on the page's behalf, and hand the file chooser its files.
 *
 * The origin matters. `file://` and `resource://` have no Web Worker and no OPFS, and this client
 * keeps its whole database in a worker's OPFS — so the page has to be served from something with an
 * origin a browser will trust. `WebViewAssetLoader` gives exactly that, and it is also why the same
 * bundle runs unchanged under HarmonyOS, which serves it from `https://localhost`.
 *
 * The bridge is deliberately one method. The page asks for an HTTP request and gets base64 back;
 * session cookies live here and are never shown to the page, so there is one owner of the session.
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "TriliumShell";
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int FILE_CHOOSER_REQUEST = 4711;

    private WebView webView;
    private final ExecutorService httpPool = Executors.newFixedThreadPool(4);
    private final Map<String, String> cookies = new HashMap<>();
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // The bundle is served by the asset loader, so it may not reach the filesystem itself.
        settings.setAllowContentAccess(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                // The bundle's HTML refers to `/assets/…`, `/boxicons/…` and `/favicon.svg`, so the
                // whole asset root is mapped rather than a subdirectory.
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                // The bundle stamps its build id into the console; this is how a device says which
                // build it is running.
                Log.i(TAG, "console: " + message.message());
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                // The editor takes a batch, so the chooser must offer one.
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                startActivityForResult(Intent.createChooser(intent, "选择文件"), FILE_CHOOSER_REQUEST);
                return true;
            }
        });

        webView.addJavascriptInterface(new Bridge(), "triliumAndroid");
        webView.loadUrl(ORIGIN + "/index.html");
    }

    /**
     * One HTTP request, performed off the main thread.
     *
     * The method returns immediately and the answer arrives later as a call back into the page. A
     * `@JavascriptInterface` method cannot be asynchronous from JavaScript's side, so the promise is
     * assembled there, in the shim the bundle installs when it sees this object.
     */
    private class Bridge {

        @JavascriptInterface
        public void request(final String id, final String method, final String url,
                            final String headersJson, final String bodyBase64) {
            httpPool.execute(() -> {
                String payload;
                try {
                    payload = perform(id, method, url, headersJson, bodyBase64);
                } catch (Exception error) {
                    payload = errorJson(error.getMessage() == null ? String.valueOf(error) : error.getMessage());
                }

                final String result = payload;
                webView.post(() -> webView.evaluateJavascript(
                        "window.__triliumAndroidResolve && window.__triliumAndroidResolve("
                                + JSONObject.quote(id) + "," + JSONObject.quote(result) + ")",
                        null));
            });
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        /** Drop the session, so reconfiguring the server does not carry the old one over. */
        @JavascriptInterface
        public void reset() {
            cookies.clear();
        }
    }

    private String perform(String id, String method, String url, String headersJson, String bodyBase64)
            throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(30_000);
            connection.setReadTimeout(120_000);

            JSONObject headers = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
            for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
                String name = it.next();
                connection.setRequestProperty(name, headers.getString(name));
            }

            String cookie = cookieHeader(url);
            if (!cookie.isEmpty()) {
                connection.setRequestProperty("Cookie", cookie);
            }

            if (bodyBase64 != null && !bodyBase64.isEmpty()) {
                connection.setDoOutput(true);
                byte[] body = Base64.decode(bodyBase64, Base64.DEFAULT);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body);
                }
            }

            int status = connection.getResponseCode();
            storeCookies(connection);

            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] bytes = stream == null ? new byte[0] : readAll(stream);

            JSONObject response = new JSONObject();
            response.put("status", status);
            JSONObject responseHeaders = new JSONObject();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                JSONArray values = new JSONArray();
                for (String value : entry.getValue()) {
                    values.put(value);
                }
                responseHeaders.put(entry.getKey(), values);
            }
            response.put("headers", responseHeaders);
            // Base64, so a binary body or a non-UTF8 page survives the bridge intact.
            response.put("body", Base64.encodeToString(bytes, Base64.NO_WRAP));
            response.put("error", JSONObject.NULL);
            return response.toString();
        } finally {
            connection.disconnect();
        }
    }

    private static byte[] readAll(InputStream stream) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[16 * 1024];
        int read;
        while ((read = stream.read(chunk)) != -1) {
            buffer.write(chunk, 0, read);
        }
        return buffer.toByteArray();
    }

    private static String errorJson(String message) {
        try {
            JSONObject response = new JSONObject();
            response.put("error", message);
            return response.toString();
        } catch (Exception ignored) {
            return "{\"error\":\"request failed\"}";
        }
    }

    /** Cookies are kept per host, and never handed to the page. */
    private String cookieHeader(String url) {
        String host = hostOf(url);
        StringBuilder header = new StringBuilder();
        for (Map.Entry<String, String> entry : cookies.entrySet()) {
            if (entry.getKey().startsWith(host + "|")) {
                if (header.length() > 0) {
                    header.append("; ");
                }
                header.append(entry.getKey().substring(host.length() + 1)).append('=').append(entry.getValue());
            }
        }
        return header.toString();
    }

    private void storeCookies(HttpURLConnection connection) {
        String host = hostOf(connection.getURL().toString());
        Map<String, List<String>> headers = connection.getHeaderFields();
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if (entry.getKey() == null || !entry.getKey().equalsIgnoreCase("Set-Cookie")) {
                continue;
            }
            for (String raw : entry.getValue()) {
                String pair = raw.split(";", 2)[0];
                int equals = pair.indexOf('=');
                if (equals > 0) {
                    cookies.put(host + "|" + pair.substring(0, equals).trim(), pair.substring(equals + 1).trim());
                }
            }
        }
    }

    private static String hostOf(String url) {
        try {
            URL parsed = new URL(url);
            return parsed.getProtocol() + "://" + parsed.getHost() + ":" + parsed.getPort();
        } catch (Exception ignored) {
            return url;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        if (requestCode != FILE_CHOOSER_REQUEST) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }

        if (fileCallback == null) {
            return;
        }

        Uri[] result = null;
        if (resultCode == Activity.RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                result = new Uri[count];
                for (int i = 0; i < count; i++) {
                    result[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                result = new Uri[] { data.getData() };
            }
        }

        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    /**
     * The back gesture and the back button, answered by the page.
     *
     * The page knows whether a dialog, a note or a folder is open; the WebView only knows about
     * document navigations, and this app is one document. So the page is asked, and it reports
     * through `setBackEnabled` whether a press has anywhere to go.
     */
    @Override
    public void onBackPressed() {
        webView.evaluateJavascript(
                "(function(){ return (window.__triliumBack && window.__triliumBack()) ? '1' : '0'; })()",
                value -> {
                    if (!"\"1\"".equals(value)) {
                        MainActivity.super.onBackPressed();
                    }
                });
    }
}

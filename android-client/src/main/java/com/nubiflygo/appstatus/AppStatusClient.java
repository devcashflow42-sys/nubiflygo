package com.nubiflygo.appstatus;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

/**
 * Cliente de GET /api/v1/app/status.
 *
 * <pre>
 *   AppStatusClient client = new AppStatusClient(context, BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME);
 *   client.check(new AppStatusClient.Callback() {
 *       public void onDecision(AppDecision d) { ... d.action ... }
 *       public void onUnavailable(AppStatusClient.Failure f) { ... }
 *   });
 * </pre>
 *
 * - Solo HTTPS, sin seguir redirecciones, con tiempos límite y respuesta máxima de 64 KB.
 * - Envía la compilación instalada (query y cabeceras); el servidor calcula available/mandatory
 *   y la app vuelve a comprobarlo en {@link AppDecision}.
 * - Sin red o con respuesta inválida usa el último estado válido guardado para esta compilación;
 *   si no hay ninguno, llama a onUnavailable (la app decide si deja entrar sin conexión).
 * - Las respuestas se entregan en el hilo principal.
 */
public final class AppStatusClient {

    /** Única URL que usa la app. */
    public static final String STATUS_URL = "https://nubiflygo.com/api/v1/app/status";

    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 10_000;
    private static final int MAX_BODY_BYTES = 64 * 1024;
    private static final long RETRY_DELAY_MS = 1_500;

    public enum Failure {
        /** Sin conexión, DNS o TLS. */
        NETWORK,
        /** El servidor tardó demasiado. */
        TIMEOUT,
        /** Demasiadas consultas (HTTP 429): reintentar más tarde. */
        RATE_LIMITED,
        /** Código HTTP inesperado. */
        HTTP_ERROR,
        /** El cuerpo no es un estado válido. */
        INVALID_RESPONSE
    }

    public interface Callback {
        void onDecision(AppDecision decision);
        void onUnavailable(Failure failure);
    }

    /** Error de la consulta (para {@link #checkBlocking()}). */
    public static final class StatusException extends Exception {
        public final Failure failure;

        StatusException(Failure failure, String message) {
            super(message);
            this.failure = failure;
        }
    }

    private final int installedBuild;
    private final String installedVersion;
    private final String statusUrl;
    private final StatusCache cache;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    public AppStatusClient(Context context, int installedBuild, String installedVersion) {
        this(context, installedBuild, installedVersion, STATUS_URL);
    }

    /** Otra URL solo para pruebas (p. ej. un entorno de staging); debe ser https. */
    public AppStatusClient(Context context, int installedBuild, String installedVersion, String statusUrl) {
        if (installedBuild < 1) throw new IllegalArgumentException("installedBuild debe ser mayor que 0");
        if (statusUrl == null || !statusUrl.startsWith("https://")) {
            throw new IllegalArgumentException("statusUrl debe usar https://");
        }
        this.installedBuild = installedBuild;
        this.installedVersion = installedVersion;
        this.statusUrl = statusUrl;
        this.cache = new StatusCache(context);
    }

    /** Consulta en segundo plano y responde en el hilo principal. */
    public void check(final Callback callback) {
        executor.execute(() -> {
            AppDecision decision = null;
            Failure failure = null;
            try {
                decision = checkBlocking();
            } catch (StatusException e) {
                AppStatus cached = cache.load(installedBuild);
                if (cached != null) decision = AppDecision.decide(cached, installedBuild, true);
                else failure = e.failure;
            }
            final AppDecision d = decision;
            final Failure f = failure;
            main.post(() -> {
                if (d != null) callback.onDecision(d);
                else callback.onUnavailable(f);
            });
        });
    }

    /** Consulta en el hilo actual (nunca en el principal); un reintento si falla la red. */
    public AppDecision checkBlocking() throws StatusException {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            throw new IllegalStateException("checkBlocking() no se puede llamar en el hilo principal");
        }
        String body;
        try {
            body = fetch();
        } catch (StatusException e) {
            if (e.failure != Failure.NETWORK && e.failure != Failure.TIMEOUT) throw e;
            sleep(RETRY_DELAY_MS);
            body = fetch();
        }
        AppStatus status;
        try {
            status = AppStatus.fromJson(body);
        } catch (InvalidResponseException e) {
            throw new StatusException(Failure.INVALID_RESPONSE, e.getMessage());
        }
        cache.save(body, installedBuild);
        return AppDecision.decide(status, installedBuild, false);
    }

    public void shutdown() {
        executor.shutdownNow();
    }

    /**
     * Para el resto de llamadas a la API: el servidor bloquea a la app con
     * 503 (code "app_suspended" o "maintenance") y 426 ("update_required").
     * Devuelve la acción correspondiente o null si la respuesta no es un bloqueo.
     * Ante un bloqueo, lo correcto es volver a llamar a {@link #check(Callback)}.
     */
    public static AppDecision.Action blockedAction(int httpCode, String errorCode) {
        if (httpCode == 426) return AppDecision.Action.UPDATE_REQUIRED;
        if (httpCode == 503 && "app_suspended".equals(errorCode)) return AppDecision.Action.SUSPENDED;
        if (httpCode == 503 && "maintenance".equals(errorCode)) return AppDecision.Action.MAINTENANCE;
        return null;
    }

    private String fetch() throws StatusException {
        HttpsURLConnection conn = null;
        try {
            String url = statusUrl + "?build=" + installedBuild
                    + (installedVersion != null ? "&version=" + URLEncoder.encode(installedVersion, "UTF-8") : "");
            HttpURLConnection raw = (HttpURLConnection) new URL(url).openConnection();
            if (!(raw instanceof HttpsURLConnection)) {
                raw.disconnect();
                throw new StatusException(Failure.NETWORK, "conexión no segura");
            }
            conn = (HttpsURLConnection) raw;
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(false);
            conn.setUseCaches(false);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("X-NubiFly-Client", "android");
            conn.setRequestProperty("X-App-Build", String.valueOf(installedBuild));
            if (installedVersion != null) conn.setRequestProperty("X-App-Version", installedVersion);

            int code = conn.getResponseCode();
            if (code == 429) throw new StatusException(Failure.RATE_LIMITED, "HTTP 429");
            if (code != 200) throw new StatusException(Failure.HTTP_ERROR, "HTTP " + code);
            String type = conn.getContentType();
            if (type == null || !type.toLowerCase().startsWith("application/json")) {
                throw new StatusException(Failure.INVALID_RESPONSE, "tipo de contenido: " + type);
            }
            return readLimited(conn.getInputStream());
        } catch (SocketTimeoutException e) {
            throw new StatusException(Failure.TIMEOUT, e.getMessage());
        } catch (IOException e) {
            throw new StatusException(Failure.NETWORK, e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readLimited(InputStream in) throws IOException, StatusException {
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) {
                if (out.size() + n > MAX_BODY_BYTES) throw new StatusException(Failure.INVALID_RESPONSE, "respuesta demasiado grande");
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

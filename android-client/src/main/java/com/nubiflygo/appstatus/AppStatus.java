package com.nubiflygo.appstatus;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Respuesta de GET /api/v1/app/status (inmutable).
 *
 * El parseo es estricto: si falta un campo obligatorio o tiene otro tipo,
 * {@link #fromJson(String)} lanza {@link InvalidResponseException} y la app
 * conserva el último estado válido en lugar de decidir con datos rotos.
 */
public final class AppStatus {

    public final String status;          // ok | update_required | maintenance | suspended
    public final String serverTime;
    public final String platform;
    public final String environment;
    public final Suspension suspension;
    public final Maintenance maintenance;
    public final Update update;

    private AppStatus(JSONObject o) throws JSONException, InvalidResponseException {
        if (!o.getBoolean("success")) throw new InvalidResponseException("success=false");
        status = o.getString("status");
        serverTime = o.getString("server_time");
        JSONObject app = o.getJSONObject("app");
        platform = app.getString("platform");
        environment = app.getString("environment");
        suspension = new Suspension(o.getJSONObject("suspension"));
        maintenance = new Maintenance(o.getJSONObject("maintenance"));
        update = new Update(o.getJSONObject("update"));
        if (!"android".equals(platform)) throw new InvalidResponseException("platform inesperada: " + platform);
    }

    public static AppStatus fromJson(String body) throws InvalidResponseException {
        if (body == null || body.isEmpty()) throw new InvalidResponseException("respuesta vacía");
        try {
            return new AppStatus(new JSONObject(body));
        } catch (JSONException e) {
            throw new InvalidResponseException("JSON inválido: " + e.getMessage());
        }
    }

    public static final class Suspension {
        public final boolean active;
        public final String reason;
        public final String message;
        public final String suspendedAt;

        Suspension(JSONObject o) throws JSONException {
            active = o.getBoolean("active");
            reason = optText(o, "reason");
            message = optText(o, "message");
            suspendedAt = optText(o, "suspended_at");
        }
    }

    public static final class Maintenance {
        public final boolean active;
        public final String message;
        public final String startsAt;
        public final String endsAt;

        Maintenance(JSONObject o) throws JSONException {
            active = o.getBoolean("active");
            message = optText(o, "message");
            startsAt = optText(o, "starts_at");
            endsAt = optText(o, "ends_at");
        }
    }

    public static final class Update {
        public final boolean available;
        public final boolean mandatory;
        public final String minSupportedVersion;
        public final int minSupportedBuild;
        public final String latestVersion;
        public final int latestBuild;
        public final String releaseDate;
        /** URL https registrada por el administrador, o null si aún no hay. */
        public final String downloadUrl;

        Update(JSONObject o) throws JSONException, InvalidResponseException {
            available = o.getBoolean("available");
            mandatory = o.getBoolean("mandatory");
            minSupportedVersion = o.getString("min_supported_version");
            minSupportedBuild = o.getInt("min_supported_build");
            JSONObject latest = o.getJSONObject("latest");
            latestVersion = latest.getString("version");
            latestBuild = latest.getInt("build");
            releaseDate = optText(latest, "release_date");
            downloadUrl = optText(latest, "download_url");
            if (minSupportedBuild < 1 || latestBuild < minSupportedBuild) {
                throw new InvalidResponseException("compilaciones incoherentes");
            }
        }
    }

    // org.json devuelve "null" como texto con optString: se trata aparte.
    private static String optText(JSONObject o, String key) {
        if (!o.has(key) || o.isNull(key)) return null;
        String v = o.optString(key, null);
        return (v == null || v.isEmpty()) ? null : v;
    }
}

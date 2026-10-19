package com.nubiflygo.appstatus;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Guarda el último JSON válido de /app/status para usarlo sin conexión.
 * Solo se guarda una respuesta que ya pasó {@link AppStatus#fromJson(String)},
 * junto con la compilación con la que se pidió: "mandatory" depende de ella,
 * así que tras actualizar la app el estado guardado ya no se usa.
 */
public final class StatusCache {

    private static final String PREFS = "nubiflygo_app_status";
    private static final String KEY_BODY = "body";
    private static final String KEY_SAVED_AT = "saved_at";
    private static final String KEY_BUILD = "build";

    private final SharedPreferences prefs;

    public StatusCache(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    void save(String body, int build) {
        prefs.edit().putString(KEY_BODY, body).putInt(KEY_BUILD, build)
                .putLong(KEY_SAVED_AT, System.currentTimeMillis()).apply();
    }

    /** Último estado válido para esta compilación, o null. */
    AppStatus load(int build) {
        String body = prefs.getString(KEY_BODY, null);
        if (body == null || prefs.getInt(KEY_BUILD, -1) != build) return null;
        try {
            return AppStatus.fromJson(body);
        } catch (InvalidResponseException e) {
            prefs.edit().clear().apply();
            return null;
        }
    }

    long savedAt() {
        return prefs.getLong(KEY_SAVED_AT, 0L);
    }
}

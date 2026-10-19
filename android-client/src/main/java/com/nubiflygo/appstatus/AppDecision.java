package com.nubiflygo.appstatus;

/**
 * Qué debe hacer la app con un estado. El orden de prioridad es fijo:
 * suspensión → mantenimiento → actualización obligatoria → opcional → normal.
 *
 * La comparación de compilaciones se repite aquí con la compilación instalada
 * (no solo se confía en available/mandatory), así la decisión es correcta
 * aunque se use un estado guardado de antes de actualizar la app.
 */
public final class AppDecision {

    public enum Action { SUSPENDED, MAINTENANCE, UPDATE_REQUIRED, UPDATE_AVAILABLE, OK }

    public final Action action;
    public final AppStatus status;
    /** true si el estado viene de la caché porque no hubo red o la respuesta no era válida. */
    public final boolean fromCache;

    private AppDecision(Action action, AppStatus status, boolean fromCache) {
        this.action = action;
        this.status = status;
        this.fromCache = fromCache;
    }

    public static AppDecision decide(AppStatus s, int installedBuild, boolean fromCache) {
        if (s.suspension.active) return new AppDecision(Action.SUSPENDED, s, fromCache);
        // Un mantenimiento leído de la caché puede haber terminado: no bloquea sin red.
        if (s.maintenance.active && !fromCache) return new AppDecision(Action.MAINTENANCE, s, false);

        AppStatus.Update u = s.update;
        boolean available = installedBuild < u.latestBuild;
        boolean mandatory = available && (installedBuild < u.minSupportedBuild || u.mandatory);
        if (mandatory) return new AppDecision(Action.UPDATE_REQUIRED, s, fromCache);
        if (available) return new AppDecision(Action.UPDATE_AVAILABLE, s, fromCache);
        return new AppDecision(Action.OK, s, fromCache);
    }

    /** URL de descarga lista para abrir, o null si no es https (nunca se abre otra cosa). */
    public String safeDownloadUrl() {
        String url = status.update.downloadUrl;
        if (url == null) return null;
        try {
            java.net.URI uri = new java.net.URI(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) return null;
            return url;
        } catch (java.net.URISyntaxException e) {
            return null;
        }
    }
}

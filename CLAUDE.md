# CLAUDE.md — Guía para trabajar en NubiFlyGo

Instrucciones para Claude (y otros agentes) en este repositorio. Léelas antes de cambiar nada.

## El proyecto en 30 segundos
- **Frontend**: `public/` — HTML + CSS + JavaScript puro, sin build. Scripts clásicos en orden de
  dependencia (ver `public/home.html`); el orden de los `<script>` importa.
- **Dos backends con la MISMA API** (`/api/v1`): todo cambio de API va en los dos.
  - `functions/` → Cloudflare Pages Functions (producción).
  - `server/` → Node.js + Express (pruebas locales y otros hostings).
  - La lógica compartida vive en `functions/_shared/*.js`; si el servidor Node la necesita, se copia
    a `server/` con la nota "Copia de functions/_shared/… (misma lógica)".
- **Base de datos**: PostgreSQL (Neon). Toda tabla o columna nueva va también en
  `server/esquema-completo.sql` (idempotente: `IF NOT EXISTS`) y en `server/schema.sql`.
- **Idioma**: la interfaz y los mensajes al usuario están en **español (México)**.

## Reglas de trabajo
- Trabajar siempre en la **misma rama**; no crear ramas nuevas.
- **No publicar** (commit/push) sin que el usuario lo pida.
- No cambiar el funcionamiento cuando el usuario pide "solo diseño".
- Probar de verdad antes de entregar: levantar `server/`, usar la app con Playwright
  (Chromium en `/opt/pw-browsers`) y revisar que no haya errores en la consola.
- Entregar **capturas** de lo nuevo (escritorio 1366 px y Android 390 px).
- Ser honesto: decir qué se probó, qué no (p. ej. Cloudflare sin credenciales) y qué capturas
  no se revisaron una por una.
- Nunca poner nombres de modelos de IA en commits, código ni documentos.

## Revisión con "dos ojos" (obligatoria antes de entregar)
Después de terminar un cambio y **antes** de mostrarlo al usuario, pedir revisión a los dos
agentes revisores de `.claude/agents/`. Son de solo lectura: analizan y reportan, no editan.

| Agente | Revisa | Cuándo |
|---|---|---|
| `ojo-diseno` | Que el diseño se vea profesional: capturas en escritorio y Android, estados (vacío, cargando, error), animaciones en su momento exacto, modo claro y oscuro. | Todo cambio visual. |
| `ojo-seguridad` | Seguridad del servidor y de la página: permisos, datos de otros usuarios, validación, rutas públicas, secretos, XSS, archivos subidos. | Todo cambio de API, base de datos, autenticación, pagos o rutas públicas. |

Para ahorrar tokens: pasar a cada ojo **solo** la lista de archivos cambiados y qué se hizo
(no toda la conversación), y pedirle un reporte corto. El agente principal corrige lo que
reporten y vuelve a pedir revisión solo si el cambio fue grande.

## Lección aprendida (diseño)
- Una animación puede verse bien quieta y mal en movimiento: en el reproductor flotante se
  veían **varios círculos** (onda + pista + borde del botón) al terminar la canción. Revisar
  capturas tomadas **durante** la animación y quedarse con un solo elemento visual por idea.
- Diseños que al usuario le gustaron: login con 3 botones rectangulares solo con icono
  (no circulares), tarjeta dorada con corona para suscriptores, anillo de progreso único.

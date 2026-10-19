# Seguridad antes de publicar NubiFlyGo

## 1. El chequeo automático

```bash
npm run seguridad          # revisa el código (antes de publicar)
npm run seguridad:sitio    # revisa https://nubiflygo.com ya publicado
```

Sale en rojo (código 1) si encuentra un problema. También corre solo en GitHub con cada envío
(`.github/workflows/seguridad.yml`): si el commit queda en rojo, **no lo publiques**.

| Revisa | Qué busca |
|---|---|
| Secretos | Claves de Google, GitHub, AWS o Mercado Pago, llaves privadas, `JWT_SECRET` o una URL de base de datos con contraseña dentro del código |
| Archivos prohibidos | `.env`, `.dev.vars`, llaves (`.pem`, `.key`, `.jks`), respaldos o `.zip` en el repositorio |
| Código peligroso en la página | `eval`, `new Function`, `document.write`, enlaces `javascript:` |
| Que todo compile | Cada archivo JavaScript de `public/`, `functions/`, `server/` y `scripts/` |
| Dependencias | `npm audit`: vulnerabilidades altas o críticas |
| Sitio publicado (`--url`) | Cabeceras (HSTS, CSP, nosniff, anti-iframe, Referrer-Policy); que la API privada responda 401 sin sesión; que CORS no acepte otros sitios; que no se descarguen `.env`, `.git`, `wrangler.toml` ni el código del servidor; que el inicio de sesión se bloquee tras varios intentos |

## 2. Lista para cada publicación

1. `npm run seguridad` en verde.
2. En Cloudflare Pages → Settings → Variables, revisa que existan:
   - `JWT_SECRET`: largo y aleatorio (`openssl rand -hex 32`). Nunca lo cambies sin motivo: cierra
     todas las sesiones.
   - `MP_WEBHOOK_SECRET`: la clave secreta del webhook de Mercado Pago. Sin ella no se comprueba la
     firma de los avisos de pago (el pago igual se verifica con Mercado Pago, pero es la protección
     recomendada).
   - `ADMIN_EMAILS`: solo tu correo.
   - `APP_URL=https://nubiflygo.com`.
3. Si el cambio toca la base de datos, crea antes una *branch* de respaldo en Neon.
4. Publica y luego corre `npm run seguridad:sitio`.

## 3. Lo que se corrigió en la auditoría

| Riesgo | Arreglo |
|---|---|
| **Toma de cuenta por pre-registro**: alguien registraba con contraseña el correo de otra persona y conservaba el acceso cuando la dueña entraba con Google o GitHub | Al vincular Google o GitHub por primera vez se anulan la contraseña y las API keys anteriores y se cierran todas las sesiones. GitHub guarda su ID fijo (`github_sub`) |
| Sin límite de espacio: el plan Gratis podía subir sin tope | La subida respeta el plan: Gratis 2 GB, Pro 100 GB, Mega 1 TB, Super 5 TB (413 `storage_full`) |
| Reembolso o contracargo dejaba el plan activo | Se quitan los 30 días de ese pago y un pago reembolsado no se puede volver a activar |
| Un extraño podía bloquear tu cuenta con intentos fallidos | El tope por cuenta no bloquea a la dueña desde una conexión donde ya entró antes |
| Subidas enormes se leían completas antes de rechazarlas | Se rechazan por su tamaño declarado antes de leerlas |
| Visitas de enlaces compartidos se podían inflar | Cada persona cuenta una vez por hora y enlace (solo enlaces que existen) |
| Muchas conexiones en tiempo real cargaban la base | Límite de 30 por minuto por usuario |
| `?sort=constructor` daba error 500 | Solo se aceptan los órdenes conocidos |
| El nonce de Google se saltaba si el token no lo traía | Si se pide nonce, el token debe traer exactamente ese |
| La firma del webhook y el pago consultado podían usar ids distintos | Se usa el mismo id para los dos |
| Si la base fallaba, los límites de intentos se apagaban sin aviso | Ahora queda en el registro (`rate_limit_unavailable`) |
| La tabla de contadores (`rate_limits`) crecía sin límite | Se borran solos los contadores de más de un día |
| Servidor Node expuesto directo: `X-Forwarded-For` falso saltaba los límites por IP | `trust proxy` solo en producción o con `TRUST_PROXY` |

Lo que la auditoría confirmó que ya estaba bien:
- Sin XSS, inyección SQL ni acceso a datos de otros usuarios.
- Contraseñas con PBKDF2/bcrypt y cookies `HttpOnly; Secure; SameSite=Lax`.
- OAuth con `state` y solo correos verificados.
- Los pagos se verifican con Mercado Pago y no se aplican dos veces.

## 4. Mejoras recomendadas (aún no hechas)

Cada una cambia cómo se usa algo, así que conviene decidirlas antes:

- **API keys guardadas con hash**: hoy se guardan completas y se muestran en la lista. Lo más
  seguro es mostrarlas una sola vez al crearlas. Requiere migrar las claves existentes.
- **Cerrar sesión que invalide el token**: hoy el token copiado sigue sirviendo hasta 7 días.
  Con un botón «cerrar todas las sesiones» se resuelve sin sacar a los demás dispositivos en cada
  cierre normal.
- **Verificación de correo al registrarse**: evitaría el pre-registro desde el origen y que el
  registro revele qué correos existen.
- **CSP sin `'unsafe-inline'`**: hay que pasar los `onclick` del HTML a archivos `.js`.
- **URL de descarga de la app Android**: lista de dominios permitidos y huella `sha256` del APK.

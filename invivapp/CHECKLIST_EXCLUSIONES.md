# INVIVAPP — Checklist de exclusiones (para ZIP INDAUTOR)

## Objetivo

Permitir incluir gran parte del código sin exponer credenciales, llaves o información que comprometa la seguridad.

---

## 1) Archivos que **NUNCA** deben ir en el ZIP

- `.env`
- `**/.env*`
- `server/serviceAccount.json`
- `**/*serviceAccount*.json`
- `**/*service-account*.json`
- `**/*credentials*.json`
- `**/*.pem`
- `**/*.key`
- `**/*.p12`
- `**/*.pfx`
- `**/id_rsa*`
- `**/secrets*`
- `**/*secret*`
- `**/*token*`

---

## 2) Sanitización recomendada (si incluyes configs)

Si decides incluir archivos de configuración para que el sistema sea entendible, usa placeholders:

- Contraseñas: `"***REDACTED***"`
- Keys: `"***REDACTED***"`
- JSONs de cuentas de servicio: **no incluir**; documentar que se proveen fuera del paquete.

---

## 3) Qué SÍ es seguro incluir normalmente

- `firebase-init.js` (sin secretos)
- Archivos HTML/CSS/JS del frontend
- Código del servidor (`server/index.js`) siempre que:
  - no tenga credenciales hardcodeadas
  - use variables de entorno para usuario/contraseña

---

## 4) Revisión rápida antes de comprimir

- Buscar strings sensibles en el proyecto:
  - `SMTP_PASS`, `PASSWORD`, `PRIVATE KEY`, `BEGIN PRIVATE KEY`, `serviceAccount`, `token`
- Verificar que `server/serviceAccount.json` NO esté copiado dentro del paquete.

---

## 5) Nota

El registro ante INDAUTOR no requiere que el software sea desplegable con el ZIP. Requiere que se acredite la obra (código/estructura) sin comprometer seguridad.

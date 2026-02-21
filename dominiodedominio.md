# Migración de `unknownshopper.github.io/xpct` a `www.pc-t.com.mx`

Este documento describe un procedimiento **operativo** (sin código) para publicar la aplicación en el dominio oficial `www.pc-t.com.mx`, dejando atrás el uso directo de GitHub Pages.

---

## 0) Decisiones (antes de tocar DNS)

Define lo siguiente:

- **Dominio canónico** (recomendado): `www.pc-t.com.mx`
- **Dominio secundario**: `pc-t.com.mx` (sin `www`) solo para **redirigir** a `www`.

Esto evita duplicidad de URLs y problemas de sesión/cookies.

---

## 1) Opciones de hosting (elige 1)

### Opción A (recomendada): Firebase Hosting
Recomendado porque:

- TLS/HTTPS estable y automático
- Redirecciones de `pc-t.com.mx` → `www.pc-t.com.mx` más controlables
- Encaja con Firebase Auth/Firestore/Storage

### Opción B: GitHub Pages con Custom Domain
Es válido, pero normalmente menos flexible para redirects y puede ser más sensible a propagación DNS/TLS.

> Este documento se centra en **Opción A (Firebase Hosting)**. Al final incluyo una sección breve para GitHub Pages.

---

## 2) Preparación en Firebase Console

### 2.1 Identificar el proyecto
En Firebase Console, confirma el **proyecto** donde vive:

- Authentication
- Firestore
- Storage

### 2.2 Agregar dominios autorizados para login
En:

- Firebase Console → **Authentication** → **Settings** → **Authorized domains**

Agregar:

- `www.pc-t.com.mx`
- `pc-t.com.mx` (si se usará para redirect)

Esto es **crítico** para que el login no falle al cambiar de dominio.

---

## 3) Configurar Firebase Hosting (alta del dominio)

En:

- Firebase Console → **Hosting**

Acciones:

- **Add custom domain**
- Capturar: `www.pc-t.com.mx`
- Completar la verificación que pida Firebase

Firebase mostrará registros DNS necesarios (varían según el caso). Usualmente verás:

- Un **TXT** para verificación del dominio
- Un **A** o **CNAME** para apuntar el tráfico

> Importante: Copia exactamente los valores que Firebase te muestre.

---

## 4) DNS en el proveedor del dominio (IONOS/Cloudflare/otro)

En el panel DNS del proveedor donde administras `pc-t.com.mx`, crear/ajustar:

### 4.1 `www.pc-t.com.mx`
- Agrega el/los registros que Firebase indique.
  - Frecuente: `CNAME` de `www` hacia un host de Firebase.
  - A veces: `A` records.

### 4.2 `pc-t.com.mx` (apex) opcional
Si deseas que `pc-t.com.mx` también funcione, hay 2 enfoques:

- **En Firebase Hosting**: agregar también `pc-t.com.mx` como segundo dominio y configurarlo para redirect.
- **En DNS**: apuntar `pc-t.com.mx` a Firebase según las instrucciones que te dé Firebase al agregarlo.

### 4.3 TTL y propagación
- Usa TTL estándar (ej. 300–3600s).
- Propagación típica:
  - 5–30 min (rápido)
  - hasta 24–48 h (casos lentos)

---

## 5) HTTPS (certificado)

En Firebase Hosting:

- Espera a que el dominio quede **Verified** y luego **Connected**.
- Firebase automáticamente aprovisiona el certificado.

Señales de que ya está bien:

- `https://www.pc-t.com.mx` carga sin warning
- El candado aparece normal

---

## 6) Redirección `pc-t.com.mx` → `www.pc-t.com.mx`

Recomendación:

- Mantén un solo dominio canónico (`www`).
- Configura redirect permanente (301/308) desde `pc-t.com.mx`.

Cómo:

- Lo más limpio es hacerlo dentro del mismo Hosting (agregando `pc-t.com.mx` como custom domain adicional y marcándolo como redirect hacia `www`).

---

## 7) Verificación funcional (checklist)

### 7.1 Navegación general
- Abre `https://www.pc-t.com.mx/index.html`
- Abre `actividadlist.html`, `actividadmin.html`, `pruebas.html`, etc.

### 7.2 Login
- Inicia sesión
- Verifica que no haya errores en consola tipo:
  - `auth/unauthorized-domain`

### 7.3 Firestore/Storage
- Realiza una acción que lea/escriba (por ejemplo, guardar/editar algo)
- Verifica en consola que no haya errores de permisos

### 7.4 Caché
Si notas que carga assets viejos:

- Hard refresh
- Prueba en incógnito

---

## 8) Qué hacer con GitHub Pages

Una vez que `www.pc-t.com.mx` ya sirve desde Firebase Hosting:

- Puedes dejar GitHub Pages activo solo para respaldo, o deshabilitarlo.
- Si quedara activo, evita que sea el “canónico” para no duplicar SEO/URLs.

---

## 9) (Alternativa) Si decides quedarte en GitHub Pages

### 9.1 GitHub Pages → Custom domain
- Poner `www.pc-t.com.mx`
- Activar “Enforce HTTPS”

### 9.2 DNS típico para GitHub Pages
En DNS del dominio:

- `CNAME`:
  - Host: `www`
  - Target: `unknownshopper.github.io`
- `A` records para `pc-t.com.mx`:
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`

Y aún así:

- Firebase Auth → Authorized domains:
  - `www.pc-t.com.mx`
  - `pc-t.com.mx` (opcional)

---

## 10) Datos que necesito para afinar el paso-a-paso (si algo no cuadra)

- ¿Tu DNS está en IONOS, Cloudflare u otro?
- ¿Quieres `www` como canónico con redirect desde apex?
- ¿El proyecto Firebase está en plan Spark o Blaze?

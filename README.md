# xpct

Sistema interno para gestionar inventario de equipos, actividades de servicio, pruebas e inspecciones de PCT.

## Estado actual

- **Autenticación**:
  - Login con Firebase Auth.
  - Roles básicos: admin, inspector; los no autorizados son redirigidos.

- **Inventario (`invre.html`)**:
  - Carga `docs/invre.csv` y muestra todos los equipos.
  - Columna `EDO` editable (ON / OFF / WIP); los cambios se guardan en Firestore (`inventarioEstados`) por equipo y se cachean en `localStorage` como overrides para usarse en otras vistas.

- **Inspecciones (`inspeccion.html`, `inspectlist.html`)**:
  - Selección de equipos solo si el estado efectivo está en `ON`.
  - Las inspecciones se guardan en `localStorage` y en Firestore (`inspecciones`).
  - Se ligan opcionalmente a actividades (campo `actividadId`).

- **Pruebas (`pruebas.html`, `pruebaslist.html`)**:
  - Autocompletado de datos desde `invre2.csv` / `invre.csv`.
  - Generación automática de número de reporte por equipo.
  - Guardado local y en Firestore (`pruebas`).
  - Listado prioriza próximas a vencer, soporta filtros por rango (chips 60–30, 30–15, 15–0) y detalle expandible bajo la fila.

- **Actividad (`actividad.html`, `actividadlist.html`, `actividadmin.html`)**:
  - `actividad.html`: registro de nuevas actividades por equipo/cliente.
  - `actividadlist.html`: vista de operación (solo lectura con edición puntual).
  - `actividadmin.html`: vista de administración (rentas, importes, períodos de facturación).
  - Actividades se guardan exclusivamente en Firestore (`actividades`).
  - El dashboard y otras pantallas leen siempre desde Firestore para conteos y listados.

### Reglas de OC / OS (Actividad)

- **OC (orden de compra / suministro)**
  - Formato estándar: `4301YYNNNN`.
    - `4301`: prefijo fijo.
    - `YY`: últimos 2 dígitos del año (tomado de `inicioServicio`, formato `dd/mm/aa`).
    - `NNNN`: consecutivo de 4 dígitos dentro de ese año.
  - Alcance del consecutivo: se calcula por combinación **cliente + equipo + año**.
  - En `actividad.html` (alta de actividad):
    - Si el usuario captura una OC en el formulario, ese valor se respeta y se asigna tal cual a todos los equipos seleccionados en esa alta.
    - Si deja el campo OC vacío, el sistema puede generar automáticamente una nueva OC siguiendo el esquema anterior.

- **OS (orden de servicio)**
  - Formato estándar actual: `PCT-YY-XXX`.
    - `PCT`: prefijo fijo.
    - `YY`: últimos 2 dígitos del año (tomado de `inicioServicio`).
    - `XXX`: consecutivo de 3 dígitos dentro de ese año.
  - Alcance del consecutivo: se calcula por combinación **cliente + año**.
  - En `actividad.html` (alta de actividad):
    - Si el usuario deja el campo OS vacío, el sistema genera la OS automáticamente con el siguiente consecutivo disponible.
    - La OS se almacena por equipo/actividad y puede ser ajustada posteriormente solo desde vistas de administración.

- **Dashboard (`index.html`)**:
  - Resumen de: número de pruebas, inspecciones, equipos en inventario, actividades (totales / concluidas / pendientes).
  - Cuenta equipos "fuera de servicio" cruzando inventario con inspecciones con hallazgos MALO.

## Situación actual

- El repositorio está en un **estado estable** conocido (commit reciente después de revertir cambios de `script.js`).
- `script.js` contiene la lógica central del frontend (inventario, actividad, pruebas, dashboard) y ya pasa una validación básica de sintaxis (`node --check script.js`).
- La regla de negocio principal vigente es:
  - Un equipo con actividad abierta (sin fecha de terminación) se considera **en servicio**.
  - La intención es que dicho equipo no se pueda reutilizar en un nuevo registro de actividad hasta que tenga terminación, aunque el detalle visual en la UI todavía se debe pulir.

## Cambios recientes (diciembre 2025)

- UI/Estilos
  - Se aplicó la fuente `Myriad Pro` globalmente (con fallbacks) y se homogenizaron estilos de inputs/selects en listados para igualarlos a los de formularios (`.campo`).
  - Se añadió realce sutil por hover y marca de fila activa en listados de pruebas.
- Pruebas (negocio y UX)
  - Periodos de prueba y reglas:
    - ANUAL: requiere “Fecha de realización”, calcula y guarda `proxima = fechaRealizacion + 12 meses` y muestra “Contador” (días restantes). Habilita edición de `Próxima` y `Contador` en el formulario.
    - POST-TRABAJO / REPARACION: requieren “Fecha de realización”, pero NO calculan ni guardan `proxima`. “Próxima” y “Contador” se deshabilitan visualmente en el formulario. Estos registros no reinician el ciclo anual; funcionan como evidencia/histórico.
    - Compatibilidad: registros sin `periodo` se consideran ANUAL.
  - Validaciones en `pruebas.html`:
    - “Fecha de realización” (formato dd/mm/aa) y “No. de reporte / certificado” son obligatorios para todos los periodos y roles.
    - Para VT / PT / MT, si hay opciones de detalle, el detalle es obligatorio.
    - Se bloquea guardar pruebas para equipos con estado efectivo OFF/INACTIVO.
  - Listado de pruebas (`pruebaslist.html`):
    - Ordena priorizando ANUALES próximas a vencer, luego vencidas, luego sin próxima. Dentro de cada grupo, por fecha de realización desc.
    - Para registros POST-TRABAJO/REPARACION: muestran su propia “Fecha de realización”, pero “Próxima”, “Días para próxima” y “Estado” se toman de la ANUAL de referencia del mismo equipo. Si no existe ANUAL para el equipo, se muestran sin próxima/“Sin fecha”.
    - Los chips de rango (>60, 60–31, 30–16, 15–1, 0) aplican únicamente a ANUALES. Se añadió una leyenda explicativa bajo los chips.
    - Los chips de período (Anual / Post-trabajo / Reparación) permiten filtrar el listado por tipo de período.
    - El detalle de una prueba se expande inline debajo de la fila; controles dentro de la fila no disparan el toggle.

## Guía de uso (pruebas)

- En `pruebas.html`:
  - Selecciona el periodo (ANUAL / POST-TRABAJO / REPARACION).
    - ANUAL: captura “Fecha de realización” para calcular “Próxima prueba” (+12 meses). “Contador” se llena automáticamente y se refresca cada hora mientras la página esté abierta.
    - POST-TRABAJO / REPARACION: captura “Fecha de realización”; “Próxima” y “Contador” se deshabilitan y no se guardan.
  - Al guardar, `periodo` se persiste y `proxima` solo se guarda para ANUAL.

- En `pruebaslist.html`:
  - Usa el buscador para filtrar por equipo/producto/técnico/reporte.
  - Chips de rango (>60, 60–31, 30–16, 15–1, 0) limitan la vista a ANUALES próximas dentro de ese rango. Leyenda bajo los chips lo aclara.
  - Chips de período (Anual / Post-trabajo / Reparación) permiten filtrar el listado por tipo de período.
  - Clic en una fila para ver el detalle inline y clic de nuevo para colapsar.
  - El resumen por equipo muestra la última ANUAL y su vigencia.

## Importación masiva de Pruebas (CSV) — solo admin

- Ubicación: en `pruebaslist.html`, barra de acciones (derecha), botón: `Ingresar formato.csv`.
- Permisos: visible y usable únicamente para usuarios con rol `admin`.
- Flujo de uso:
  - Selecciona el archivo CSV (plantilla en `docs/formato_pruebas.csv`).
  - El sistema realiza un “dry-run” (vista previa) y muestra:
    - Resumen de registros válidos.
    - Advertencias (equipo no encontrado en inventario, fila duplicada, próxima inválida, etc.).
    - Errores por línea (campos requeridos, cabeceras incorrectas, formato de fecha, valores fuera de catálogo).
  - Al confirmar, se insertan solo los registros válidos en Firestore (`pruebas`) y se recarga el listado.
- Encabezados y orden obligatorios (exactos):
  - `cliente,equipo,numeroSerie,periodo,prueba,fechaRealizacion,noReporte,resultado,ejecucion,emisor,pruebaDetalle,observaciones,ubicacion,areaPrueba,tecnico,proxima`
- Reglas de validación:
  - Requeridos: `cliente`, `equipo`, `numeroSerie`, `periodo` (ANUAL|POST-TRABAJO|REPARACION), `prueba`, `fechaRealizacion` (dd/mm/aaaa), `noReporte`, `resultado` (APROBADA|RECHAZADA|N/A).
  - `ejecucion`: INTERNO|EXTERNO. Si INTERNO ⇒ `emisor='PCT'`. Si EXTERNO ⇒ `emisor` requerido.
  - `pruebaDetalle`: requerido para `VT`/`PT`/`MT` cuando aplique catálogo.
  - Inventario: si `equipo` no aparece en `docs/invre.csv`, se marca advertencia (no bloquea la importación).
  - Duplicados: se omiten si coincide la clave compuesta `equipo+numeroSerie+periodo+fechaRealizacion+noReporte`.
  - `proxima` solo aplica a `ANUAL`. Si viene vacía, se calcula como `fechaRealizacion + 365 días`. Para POST-TRABAJO/REPARACION se ignora; en el listado heredan Próxima/Estado de la ANUAL más reciente del mismo equipo (si no existe ANUAL, mostrarán N/A).
- Persistencia:
  - Cada inserción guarda `creadoEn` con `serverTimestamp()`.
  - Solo se guarda `proxima` cuando `periodo=ANUAL`.
- Recursos para capturistas:
  - Plantilla: `docs/formato_pruebas.csv`.
  - Guía: `docs/instrucciones_capturistas.md` (llenado y exportación desde Excel en UTF-8).

Pendiente/Nota: Se reforzará la validación para que la confirmación de importación exija “cero errores” en la vista previa. Mientras tanto, la importación confirma únicamente los registros válidos y omite filas con errores.

#### Notas de importación CSV (enero 2026)

- Duplicado detectado en `docs/inyeccion.csv` (causa de 848 llaves únicas):
  - Llave: `PCT-PLG-013__PCT-24-4206-P-003__POST-TRABAJO__28/08/2025__PCT-NDT-1-0115`
  - Aparece duplicada en líneas CSV: L436 y L437 (mismas columnas/valores).
  - Acción sugerida para la próxima sesión: editar o eliminar una de las dos filas duplicadas antes del siguiente import, para que el conteo de llaves únicas alcance 849 y la “Suma nominal (CSV + base 117)” arroje 966 como referencia.

#### Depuración de duplicados ANUAL en Firestore (enero 2026)

- Contexto: Se identificaron 3 llaves duplicadas del periodo ANUAL que inflaban “> 60 días” y “N en histórico”. Se decidió conservar el registro más reciente por `creadoEn` y eliminar los demás.
- Registros eliminados (colección `pruebas`):
  - id: `8svaiLahHsef7Kczkw0S`, equipo: `PCT-90-183`, periodo: `ANUAL`, fechaRealizacion: `17/04/25`, noReporte: `PCT-NDT-1-004`
  - id: `SZ2dsFNmpYhRQaarR1WB`, equipo: `PCT-90-183`, periodo: `ANUAL`, fechaRealizacion: `17/04/25`, noReporte: `PCT-NDT-1-004`
  - id: `fYZL5s8t7x6mDWekci3m`, equipo: `PCT-90-183`, periodo: `ANUAL`, fechaRealizacion: `17/04/25`, noReporte: `PCT-NDT-1-004`
  - id: `KTtP9JmRoV7uqSRmsroB`, equipo: `PCT-PUP-0019`, periodo: `ANUAL`, fechaRealizacion: `18/04/25`, noReporte: `PCT-NDT-1-007`
  - id: `elyrDhfkwXIfk4LeZ9nx`, equipo: `PCT-90-181`, periodo: `ANUAL`, fechaRealizacion: `17/04/25`, noReporte: `PCT-NDT-1-003`

- Registros conservados (referencia de supervivientes):
  - `PCT-90-183__EBS-4206-LRE-SS-90-21__ANUAL__17/04/25__PCT-NDT-1-004` → id conservado: `RGNKZguSWD6px3lanuIt`
  - `PCT-PUP-0019__PCT-23-4206-10-019__ANUAL__18/04/25__PCT-NDT-1-007` → id conservado: `GLlZDoSRyOP27jW3Jy5K`
  - `PCT-90-181__EBS-4206-LRE-SS-90-19__ANUAL__17/04/25__PCT-NDT-1-003` → id conservado: `wX6Rf8WDPRlWusEzdl4w`

- Impacto esperado tras depuración:
  - “> 60 días” disminuye en 5.
  - “Anual” disminuye en 5.
  - “N en histórico” pasa de 965 a 960.
  - Registros de `POST-TRABAJO`/`REPARACION` permanecen intactos; su estado/próxima se hereda de la ANUAL conservada.

#### Snippets útiles (detectar y limpiar duplicados en `pruebas`)

- Detectar llaves duplicadas y su impacto en chips (rango):

```js
// Ejecutar en consola del navegador (p. ej., pruebaslist.html)
const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
const db = getFirestore(getApp());
const snap = await getDocs(collection(db, 'pruebas'));
const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));

function composeKey(r){
  const equipo=(r.equipo||'').trim().toUpperCase();
  const numeroSerie=(r.serial||r.numeroSerie||'').trim().toUpperCase();
  const periodo=(r.periodo||'').trim().toUpperCase();
  const fecha=(r.fechaRealizacion||'').trim();
  const noRep=(r.noReporte||'').trim().toUpperCase();
  return `${equipo}__${numeroSerie}__${periodo}__${fecha}__${noRep}`;
}
function parseFechaDDMMAA(s){
  const t=String(s||'').trim();
  const m=t.match(/^([0-3]?\d)\/([0-1]?\d)\/(\d{2}|\d{4})$/);
  if(!m) return null; const dd=+m[1], mm=+m[2]; let yyyy=+m[3];
  if(m[3].length===2) yyyy=2000+yyyy; const d=new Date(yyyy,mm-1,dd); d.setHours(0,0,0,0);
  return isNaN(d)?null:d;
}
function clasificarAnual(r){
  const per=(r.periodo||'').toUpperCase(); if(per && per!=='ANUAL') return null;
  const fr=parseFechaDDMMAA(r.fechaRealizacion); if(!fr) return {estado:'SIN_FECHA',dias:null};
  const prox=new Date(fr.getFullYear()+1,fr.getMonth(),fr.getDate());
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const dias=Math.round((prox-hoy)/(1000*60*60*24));
  return {estado: (dias<0?'VENCIDA':'VIGENTE'), dias};
}
function rango(estado,d){
  if(estado==='VENCIDA') return '0'; if(estado!=='VIGENTE' || d===null) return 'N/A';
  if(d>60) return '>60'; if(d>=31) return '60-31'; if(d>=16) return '30-16'; if(d>=1) return '15-1'; return '0';
}

const groups=new Map();
arr.forEach(r=>{ const k=composeKey(r); if(!k) return; (groups.get(k)||groups.set(k,[]).get(k)).push(r); });
const dups=[...groups.entries()].filter(([,rows])=>rows.length>1);

const resumen=dups.map(([k,rows])=>{
  const rangos=rows.map(r=>{ const c=clasificarAnual(r); return rango(c?.estado,c?.dias); })
                   .reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{});
  return { key:k, total: rows.length, ...rangos };
});
console.table(resumen);
```

- Eliminar duplicados dejando 1 por clave (con confirmación):

```js
// Ajusta el criterio de superviviente (más reciente por creadoEn)
const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
const { getFirestore, collection, getDocs, doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
const db = getFirestore(getApp());
const snap = await getDocs(collection(db, 'pruebas'));
const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));

function composeKey(r){
  const equipo=(r.equipo||'').trim().toUpperCase();
  const numeroSerie=(r.serial||r.numeroSerie||'').trim().toUpperCase();
  const periodo=(r.periodo||'').trim().toUpperCase();
  const fecha=(r.fechaRealizacion||'').trim();
  const noRep=(r.noReporte||'').trim().toUpperCase();
  return `${equipo}__${numeroSerie}__${periodo}__${fecha}__${noRep}`;
}

const groups=new Map();
arr.forEach(r=>{ const k=composeKey(r); if(!k) return; (groups.get(k)||groups.set(k,[]).get(k)).push(r); });
const dups=[...groups.entries()].filter(([,rows])=>rows.length>1);

const toDelete = [];
dups.forEach(([k,rows])=>{
  const orden = rows.slice().sort((a,b)=>{
    const ad=a.creadoEn?.toDate?.()||new Date(0);
    const bd=b.creadoEn?.toDate?.()||new Date(0);
    return bd - ad; // mantener más reciente, borrar el resto
  });
  orden.slice(1).forEach(r=>toDelete.push({ key:k, id:r.id }));
});

console.table(toDelete.slice(0,50));
if(!confirm(`Se eliminaran ${toDelete.length} documentos duplicados, dejando 1 por clave. Continuar?`)) throw new Error('Cancelado');

for(let i=0;i<toDelete.length;i++){
  const d=toDelete[i];
  try{ await deleteDoc(doc(db,'pruebas',d.id)); console.log(`[${i+1}/${toDelete.length}] eliminado`, d); await new Promise(r=>setTimeout(r,800)); }
  catch(e){ console.warn('Fallo al eliminar', d, e); }
}
console.log('Depuracion completa.');
```

### Corrección de históricos sin fecha de realización
- Algunos registros antiguos pueden carecer de “Fecha de realización”. A partir de ahora el formulario no permite guardar sin ese dato.
- Para corregir históricos:
  - Localiza los registros en `pruebaslist.html` y edítalos (roles con permisos: admin/director/supervisor).
  - Si el equipo no tiene ANUAL de referencia, la “Próxima” de Post/Reparación quedará vacía hasta que exista una ANUAL válida.

## Verificación recomendada tras cambios

- Crear una prueba ANUAL con fecha reciente y comprobar:
  - Cálculo de `Próxima` = +12 meses y `Contador` correcto.
  - Aparición en “próximas a vencer” y chips según días restantes.
- Crear checkpoints (POST-TRABAJO/REPARACION) en el mismo equipo dentro del año:
  - Deben aparecer en el listado histórico sin alterar estado/contador/chips del equipo.
- Confirmar que en `inspectlist.html` y `actividadlist.html` los inputs/selects se vean homogéneos a `pruebas.html`.

## Notas de implementación

- El cálculo de vigencia en el listado se basa en un mapa de “última ANUAL por equipo”. Si no existe ANUAL, el equipo queda “SIN PRUEBA”.
- Los chips muestran conteo por equipo (no por filas) dentro del rango.
- Se eliminó el panel inferior de detalle en `pruebaslist.html` para evitar desplazamientos; ahora el detalle es inline.

## Alertas por correo (IONOS SMTP) – Backend Node

Se añadió un pequeño servidor Node (Express) en `server/` para enviar un correo diario con el resumen de pruebas ANUAL por vencer. Usa IONOS SMTP como transporte y Firestore como fuente de datos.

### Variables de entorno (crear `server/.env` – no se sube a Git)

Ejemplo de contenido mínimo:

```
TZ=America/Mexico_City
PORT=8080

MAIL_FROM="XPCT Alertas <logistica@pc-t.com.mx>"
MAIL_TO=the@unknownshoppers.com

SMTP_HOST=smtp.ionos.com
# 465 = SSL (recomendado) | 587 = STARTTLS
SMTP_PORT=465
SMTP_USER=logistica@pc-t.com.mx
SMTP_PASS=********

# Opción A (recomendada): JSON de Service Account en una sola línea
# FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"..."}'

# Opción B (alternativa local): ruta absoluta al JSON
# GOOGLE_APPLICATION_CREDENTIALS=/Users/<usuario>/ruta/al/archivo.json
```

Notas:
- Usa UNA de las dos opciones para credenciales de Firebase Admin (A o B).

## Roles y Permisos

Definición de roles y su alcance en la aplicación. Inspector y Capturista comparten exactamente las mismas restricciones; únicamente `sgi@pc-t.com.mx` pasa a ser Supervisor.

- **Cuentas, roles y nombres (referencia)**
  - sgi@pc-t.com.mx → Rol: supervisor → Nombre: Rubén
  - auxger@pc-t.com.mx → Rol: capturista → Nombre: Valeria
  - capturista@pc-t.com.mx → Rol: capturista → Nombre: Capturista
  - inspector01@pc-t.com.mx → Rol: inspector → Nombre: Inspector
  - the@unknownshoppers.com → Rol: admin → Nombre: admin
  - jalcz@pc-t.com.mx → Rol: admin → Nombre: JALCZ
  - lgmt@pc-t.com.mx → Rol: director → Nombre: LGMT

- **admin**
  - Acceso total a todas las páginas y acciones.
  - Puede crear, editar, eliminar y exportar en listados de Pruebas e Inspecciones.
  - Acceso a secciones de administración (actividadmin, trazabilidades, etc.).

- **director**
  - Acceso casi total (misma edición que admin) incluyendo eliminar y exportar.
  - Acceso a listados y alta de Pruebas e Inspecciones. Administración según se defina (por defecto, solo admin).

- **supervisor** (asignado a `sgi@pc-t.com.mx`)
  - Puede crear nuevas Pruebas e Inspecciones.
  - En listados (pruebaslist, inspectlist): puede editar campos permitidos (p. ej. Prueba/Calib., No. reporte/cert. —requerido—, Resultado, Periodo), ver detalle y exportar CSV.
  - No puede eliminar registros (no ve botón “Eliminar seleccionadas” ni checkboxes de selección).

- **capturista**
  - Puede crear nuevas Pruebas e Inspecciones.
  - En listados: solo lectura y ver detalle. Sin edición, sin eliminar, sin checkboxes.
  - En pruebas.html: el campo `Técnico` se auto-llena según correo y queda bloqueado (p. ej. `auxger@pc-t.com.mx` → “Valeria”).

- **inspector**
  - Mismas reglas que Capturista (solo lectura en listados, crear nuevas, sin eliminar). No tiene privilegios adicionales.

### Reglas funcionales clave
- Fecha de registro (pruebaslist): se muestra “dd/mm/aaaa hh:mm” usando `creadoEn` (Timestamp de Firestore) con fallback a `fechaPrueba` para registros antiguos.
- No. reporte / cert. (pruebaslist): requerido al editar (admin/director/supervisor). Si se intenta dejar vacío, no se guarda y se revierte al valor previo.
- Eliminación: solo admin y director. Supervisor/inspector/capturista no eliminan (botón y checkboxes ocultos).

### Asignación de roles (Firebase Custom Claims)
Usar el script `server/setRole.js` con Firebase Admin SDK.

```bash
# Asignar rol supervisor al usuario sgi@pc-t.com.mx
node server/setRole.js set-role sgi@pc-t.com.mx supervisor
```

Notas:
- El usuario debe haber iniciado sesión al menos una vez en el proyecto.
- Después del cambio de rol, debe cerrar sesión e iniciar nuevamente para refrescar el token.
- `server/.env` está ignorado por Git (`.gitignore`). No lo subas.
- Para múltiples destinatarios en `MAIL_TO`, separa por comas: `uno@dom.com,dos@dom.com` o usa el formato `Nombre <mail>`.

### Obtener y pegar el Service Account JSON

1. Firebase Console → Configuración del proyecto → Cuentas de servicio → Firebase Admin SDK → “Generar nueva clave privada”.
2. Con Homebrew jq instalado, minifica a una sola línea y copia:
   - `jq -c . /ruta/al/archivo.json | pbcopy`
3. Pega en `.env` como valor de `FIREBASE_SERVICE_ACCOUNT_JSON` entre comillas simples.

### Arranque local y CORS

- Instalar dependencias y arrancar:
  - `cd server && npm install && npm start`
- El frontend de desarrollo corre típicamente en `http://localhost:2200` y el backend en `http://localhost:8080`.
- CORS está habilitado en el backend para `localhost:2200`.
- En `index.html`, el botón de prueba usa `http://localhost:8080` automáticamente en desarrollo y same-origin en producción.

### Endpoints

- `POST /api/test-smtp`
  - Envío de prueba SMTP sin tocar Firestore. Útil para validar credenciales del buzón.

- `POST /api/send-alerts?test=true`
  - Calcula desde Firestore las últimas ANUAL por equipo, clasifica por días restantes y envía un correo con 3 secciones:
    - 60–30 días (una sola vez por equipo)
    - 30–15 días (una sola vez por equipo)
    - 15–0 días (envío diario)
  - En modo `test=true`, si no hay elementos, envía un "Correo de prueba OK".

### Despliegue y DNS (resumen)

- SMTP: usar IONOS con remitente `logistica@pc-t.com.mx`.
- Recomendado configurar SPF, DKIM y DMARC en `pc-t.com.mx` para mejor entregabilidad.

### Problemas comunes

- "Unable to detect a Project Id": falta credencial de Firebase Admin. Usa Opción A o B en `.env` y reinicia.
- 404 al llamar `/api/send-alerts` desde el navegador en 2200: asegúrate que el backend corra en 8080; el botón ya reenvía a 8080 en desarrollo.
- Errores CORS: reinicia backend tras `npm install` (se añadió `cors`).

---

## Próximos cambios sugeridos

- **Pendientes próximos (enero 2026)**
  - Índices y consultas selectivas (Firestore):
    - Crear índice compuesto en `actividades`: `anioInicio ASC`, `inicioTs DESC` (principal), y evaluar: `equipoNorm ASC + inicioTs DESC`, `clienteNorm ASC + ubicNorm ASC + inicioTs DESC`.
    - Actualizar vistas para usar `where/limit/orderBy` con paginación y evitar escaneos completos (actividadmin ya hace intento con fallback).
  - Backfill de normalización (en curso):
    - Campos en `actividades`: `equipoNorm`, `clienteNorm`, `areaNorm`, `ubicNorm`, `inicioTs`, `finTs`, `anioInicio`, `anioFin`.
    - Pendiente ejecutar backfill equivalente en `pruebas` para mejorar matching y filtros (normalizar equipo/cliente/ubic/área y timestamps).
  - Dashboard (reducción de lecturas):
    - Mientras la cuota esté limitada, evitar agregaciones; cuando se restablezca, evaluar `getCountFromServer` solo 1 vez por sesión.
    - Plan medio plazo: documento `stats/dashboard` precomputado (Cloud Function programada) para 1 sola lectura.
  - Cache/Offline:
    - Persistencia IndexedDB habilitada y lecturas cache-first en `actividadmin` y `dashboard` (ya aplicado).
  - Períodos y consolidación:
    - Usar `window.generarPeriodosMensuales(actividadId)` y el script de consolidación por grupo (maestra + archivado) para casos 2017 (ej.: PCT-CE-04, PCT-CA-10 en TERRA 8).
  - Tipografías institucionales:
    - Rutas de fuentes ajustadas a `xpct/fonts/*.OTF`. Convertir a `woff2/woff` y servir múltiples formatos para mejor desempeño.
  - GitHub Pages:
    - Validar que `config.local.js` de producción esté accesible (ya sirve 200). Si se requiere, fallback a config embebida para `*.github.io`.
  - Prácticas seguras de cuota:
    - Evitar escaneos/aggregations en primer paint; usar cache o placeholders y diferir operaciones costosas.

- **Actividad**
  - Mostrar en la lista inferior de `actividad.html` los equipos que están en servicio con una leyenda clara en la columna de estado (por ejemplo: `EN SERVICIO (no disponible)`), en lugar de solo mostrar alertas.
  - Asegurar que la selección múltiple (pegar varios equipos) respete la lógica anterior y sea consistente entre equipos nuevos vs. ocupados.

- **Consistencia de estados**
  - Revisar que todas las vistas que usan inventario (`inspeccion`, `pruebas`, `actividad`) lean de forma consistente el override de `EDO` persistido en Firestore (`inventarioEstados`) y cacheado en `localStorage`.
  - Documentar mejor la diferencia entre estado de inventario (ON/OFF/WIP) y estado operativo (actividad abierta/cerrada).

- **UI/UX**
  - Reemplazar `alert(...)` por mensajes visibles en la propia página (banners o mensajes cerca de la tabla) para errores y avisos.
  - Mejorar textos y ayudas visuales para operaciones frecuentes: registrar actividad, cerrar servicio, generar períodos de facturación.

- **Código**
  - Separar `script.js` en módulos por vista (inspección, actividad, pruebas, dashboard) para facilitar mantenimiento.
  - Añadir comentarios breves en las funciones clave de negocio (sin duplicar documentación) y tests básicos donde sea posible.

 
  

## Notas para próximos colaboradores

- Antes de tocar `script.js`, es recomendable:
  - Hacer un `node --check script.js` para validar sintaxis.
  - Probar pantallas clave en el navegador: `index.html`, `invre.html`, `actividad.html`, `pruebas.html`, `inspeccion.html`.
- Los cambios que afecten reglas de negocio (por ejemplo, cuándo un equipo está disponible) deben probarse al menos en:
  - Registro de actividad.
  - Listado y administración de actividad.
  - Inspecciones vinculadas a esa actividad.
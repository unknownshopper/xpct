# TODO — Pendientes del sistema PCT

Unificado de TODO.md + TODOEXT.md + TODOOP.md (nov-2026). Lo entregado queda en la sección "Completado" al final como referencia histórica.

## Comercial / solicitudes externas (B2C)

- [ ] **Renovaciones**: `proximaInspeccion` por equipo/solicitud + Cloud Function mensual de vencimientos → alerta al vendedor para contacto recurrente (venta anual)
- [ ] **`clienteId` en `solicitudes_ext`** — anticipar portal del cliente (reglas por cliente sin migración)
- [ ] **App Check** — `chatPublico` es callable pública sin login (riesgo de abuso/costo Gemini); también aplica si el form se abre al público algún día
- [ ] **Colección `clientes` formal** — el directorio se deriva de solicitudes; si crece, catalogar clientes con historial/RFC
- [ ] **Catálogo de vendedores** — `VENDEDORES` es const en `solicitud.html`; mover a config/Firestore cuando sean >2
- [ ] **Definir con PCT**: servicio on-site vs. equipo viaja a taller (¿orden de salida/manifiesto aplica a externos?), si checklists `inspectcat` reusan o son configurables
- [ ] **Email de asignación** — `onSolicitudExtCreada` notifica a COPS; falta avisar al vendedor cuando le asignan una

## Flujo post-trabajo (operativo)

- [ ] **Reset de `procesoEquipo`** al cerrar ciclo / abrir uno nuevo — estados ✅ viejos persisten entre ciclos
- [ ] **Mostrar `por`/`en`** en cada bloque del checklist (ya se guarda, no se muestra)
- [ ] **Permisos por bloque** — hoy admin/sgi/cops marcan todo; refinar: COPS sus bloques operativos, SGI pruebas formales
- [ ] **Candado de salida** — verificar reporte anual vigente antes de permitir despacho/renta
- [ ] **Pizarrón #7** — `PCT-CA-09`, `PCT-BP-03 ~ BP-06`: falta contexto de qué reportaron
- [ ] **"F/O" del pizarrón** — punto ② no identificado (¿folio/orden? ¿formato oficial?)
- [ ] **Decidir**: MT/PT y PH ¿también derivan a cuarentena o solo VT/UTT decide? ¿orden estricto de bloques B/C/D o paralelo?
- [ ] **Validar flujo MIE/MII en producción** con orden real (despacho → recepción → cierre automático)
- [ ] **Inventario vs realidad** — equipos WIP que siguieron operando (ej. PCT-XO-290)

## Deuda técnica

- [ ] **Migrar CSVs de runtime a Firestore** — `INVENTARIOTOTAL04-202602.csv`, `invre*.csv`, `certif.csv`, `noutt.csv`, etc. leídos en vivo por 11+ páginas; requiere loader compartido en `utils.js` con caché
- [ ] **Saneamiento del repo público** — CSVs de negocio en repo + historial Git; purga real = reescritura de historial o repo privado (decisión pendiente)
- [ ] **Dejar de traer colecciones completas para filtrar en JS** — `ordenes_salida`, `inspecciones` completos por page-load; cuota y lentitud al crecer
- [ ] **Consolidar consultas por equipo** — `resumenes_equipos` más completo o índice para dossier/contadores
- [ ] **Romper monolitos HTML** — `inspectlist.html` (~4,500 líneas) y `pruebaslist.html` a módulos
- [ ] **Tests** — reglas Firestore en emulator + lógica de contadores
- [ ] **Emails hardcodeados → claims** — quedan literales `cops@`, `sgi@`, `auxndt@` en UI y reglas; quitar al asignar claims reales
- [ ] **Duplicación de contadores** en `pruebaslist` (render/bootstrap/modal repiten "última prueba rechazada")
- [ ] **`_control` doc** en `ordenes_salida` → colección `config/contadores`
- [ ] **`audit.html`**: exportar dossier global por periodo (opcional)

## Portofino (otro repo — recordatorio)

- [ ] **Enforce HTTPS** en GitHub Pages cuando el cert termine de provisionarse
- [ ] **Limpiar subdominios cPanel huérfanos** del DNS y cancelar hosting viejo si murió (superficie PHP2Shell)

---

## Completado (nov-2026) — referencia

**Comercial B2C**
- `solicitudes_ext` aislada del inventario interno; folios `SOL-AAAA-XXXXX`; PDF institucional (línea gráfica de órdenes); correo automático a COPS/SGI/admin vía `onSolicitudExtCreada`
- Rol `vendedor` con claim Firebase; panel exclusivo `ventas.html` (KPIs, pipeline editable, directorio de clientes auto-generado, WhatsApp, detalle expandible por solicitud)
- Vista **Comisiones** para admin/director: entregadas por `asignadoA`/`creadoPor` con detalle por folio
- Asignación: checkbox "Asignar a vendedor" (solo staff) → `asignadoA`/`asignadoANombre`; `creadoPor` = auditoría, `asignadoA` = comisión
- Normalización: MAYÚSCULAS sin acentos en vivo, correo minúsculas, teléfono dígitos; dedup por correo + anti doble-envío; directorio agrupa por clave normalizada
- Descripción estructurada de equipos (notación PCT, extremos dinámicos, plantillas, accesorios)

**Flujo post-trabajo**
- `procesoEquipo`: checklist ⭕→✅→❌ por bloque con `por`/`en`; VT derivado de resultados; cuarentena → decisión MIE/MII; reinspección con evidencia fotográfica; liberación
- Órdenes de salida: folio transaccional `PCT-MIE/MII-AAAA-####`, PDF, tabla admin, auto-cierre RECIBIDO, observaciones por equipo
- `audit.html` dossier por equipo + manifiesto del sistema
- Purga automática de docs `autoEliminarEn` (Cloud Function)

**Sitio público**
- `website2` promovido a portada: renta primero, 6 líneas de negocio (LT separado de PND), chat IA con Gemini (`chatPublico`), metas OG/Twitter + `img/og-cover.png`

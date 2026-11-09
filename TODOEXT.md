# TODOEXT — Servicio de inspecciones a particulares (B2C)

PCT venderá inspecciones (paquete completo: inspección + pruebas) a clientes externos.
Diseño **sin chocar con el inventario interno** y **sin depender de admin**.

## Regla de oro de roles

El flujo completo debe operar **sin admin**: solicitud → revisión → alta → programación → inspección → entrega.
Quien opere será un rol operativo existente (cops / sgi / supervisor) — **admin solo como intervención excepcional** (correcciones, borrado), nunca como paso obligatorio del proceso.

## Modelo de datos (colecciones separadas — NO reutilizar las internas)

- [ ] `clientes` — nombre, compañía, contacto, correo, teléfono, RFC/identificación si aplica
- [ ] `equipos_externos` — por cliente: descripción, tipo, serial, `clienteId`, `proximaInspeccion` (vigencia anual)
- [ ] `solicitudes_inspeccion` — creadas por formulario público; **create-only con validación estricta**, nada más
- [ ] `inspecciones_externas` + `pruebas_externas` — mismo shape que las internas, colección aparte (cero contaminación de contadores UTT, sin-inspección, resúmenes, PND, dashboards)
- [ ] `servicios` (o alcance en la solicitud) — define el "paquete completo": qué inspección + qué batería de pruebas contrató cada equipo

## Formulario público

- [ ] Form para que el cliente solicite: nombre, compañía, correo, teléfono, equipos (tipo, descripción, cantidad, notas)
- [ ] Anti-spam: **Firebase App Check** (reCAPTCHA) si es link abierto; o token por solicitud si se envía por correo
- [ ] El form **nunca escribe inventario**: solo crea `solicitudes_inspeccion`

## Flujo operativo (sin admin)

- [ ] Panel de solicitudes visible para rol operativo (cops/sgi/supervisor) — estilo admin.html de Portofino
- [ ] Aprobar solicitud → genera `clientes` + `equipos_externos` + inspección programada (un click, no captura manual)
- [ ] Asignación a inspector (mismo `inspectorAsignado` de siempre)
- [ ] Folios en serie separada — `PCT-EXT-AAAA-####` o por cliente; no mezclar con REI/REC/MIE/MII
- [ ] Documentos imprimibles del servicio (resultado + evidencias) con la identidad PCT

## Vigencia anual y contacto de renovación

- [ ] `proximaInspeccion` por equipo externo
- [ ] Cloud Function programada (patrón ya existe) → escaneo mensual de vencimientos → alerta a operación para contactar al cliente
- [ ] Campos de gestión: `estadoServicio` (vigente / por vencer / vencido / renovado), `contactadoEn`, `contactadoPor`

## Permisos

- [ ] Reglas: lectura de colecciones externas solo para roles PCT operativos; **create público solo en `solicitudes_inspeccion`**; write operativo en las demás; delete → admin (excepcional)
- [ ] Anticipar `clienteId` en todos los docs para un futuro portal del cliente (reglas por cliente, sin migración)

## Por definir con PCT (pendiente de la imagen/indicaciones)

- [ ] Qué campos exactos captura el formulario
- [ ] Qué incluye el "paquete completo" (qué pruebas por tipo de equipo)
- [ ] Si el servicio es on-site o el equipo viaja a taller (¿orden de salida/manifiesto también aplica?)
- [ ] Si las checklists de parámetros son las mismas (`inspectcat`) o configurables por equipo externo
- [ ] Facturación/contratos: fuera de alcance, confirmar

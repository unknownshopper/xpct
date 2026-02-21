# INVIVAPP (Inventario Vivo)

## Síntesis ejecutiva para registro de obra (INDAUTOR) — Programa de cómputo

- **Nombre de la obra**: INVIVAPP (Inventario Vivo)
- **Autor / Titular**: AUTOR GARCÍA ZZZZZZ
- **Inicio de desarrollo**: Diciembre 2025
- **Naturaleza**: Sistema de software para gestión operativa y trazabilidad en renta/servicio de equipo industrial (oil & gas).
- **Cliente de referencia (implementación inicial)**: PCT (Proveedora y Comercializadora de Tabasco)

> Nota: La mención de PCT se incluye únicamente como referencia de la primera implementación; el software está diseñado para licenciarse e implantarse en múltiples organizaciones del mismo rubro, con parametrizaciones y personalizaciones por cliente.

---

## 1. Descripción del sistema

INVIVAPP es una plataforma digital orientada a la **gestión de inventario vivo** (activos/equipos) y el control integral de su operación, a través de:

- **Trazabilidad por activo** (equipo/activo/serie/serial).
- **Registro de inspecciones y actividades** asociadas al activo.
- **Gestión de pruebas, certificados y vigencias** (próximos vencimientos, estado de cumplimiento).
- **Resguardo de evidencia** (archivos e imágenes) vinculada a cada registro.
- **Reportes y exportaciones** para control administrativo y auditoría.
- **Control de acceso por roles** (ej. administrador, director, supervisor, inspector, capturista).

El objetivo es reducir riesgo operativo y documental, elevando el control de cumplimiento y el historial verificable de cada activo.

---

## 2. Alcance funcional (módulos)

- **Inventario / Activos**
  - Identificación del activo, estatus, atributos principales.
  - Consulta y control operativo.

- **Inspecciones**
  - Captura de inspecciones por activo.
  - Evidencia y observaciones.
  - Historial y consulta.

- **Pruebas / Certificados / Calibraciones**
  - Registro de resultados.
  - Próxima vigencia / caducidad.
  - Alertas y seguimiento.

- **Actividad (bitácora)**
  - Registro de eventos operativos asociados al activo.
  - Exportación y análisis.

- **Tableros y alertas**
  - Indicadores de próximos vencimientos.
  - Notificaciones por correo (configurable).

- **Seguridad y roles**
  - Acceso autenticado.
  - Autorización por perfiles.

---

## 3. Descripción tecnológica (lenguaje ejecutivo)

INVIVAPP se implementa como un **sistema cliente–servidor**:

- **Aplicación de usuario (cliente)**: aplicación web ejecutada en navegador (interfaz de usuario y lógica de presentación).
- **Servicios de soporte (servidor)**: componentes de backend para automatizaciones (por ejemplo, notificaciones por correo y tareas administrativas).
- **Persistencia y evidencias**: almacenamiento de información operativa y evidencia documental.

La implementación actual utiliza servicios administrados en la nube (Firebase/Firestore/Storage) para autenticación, base de datos y almacenamiento de evidencias; sin embargo, la solución está concebida para **implantación en infraestructura privada** cuando el cliente lo requiera, mediante adaptación de la capa de persistencia (por ejemplo, uso de PostgreSQL u otro motor equivalente) y servicios de almacenamiento/identidad alternos.

---

## 4. Personalización por cliente (modelo de comercialización)

El sistema contempla que cada cliente pueda requerir:

- Identidad visual (logos, textos, plantillas).
- Catálogos/criterios operativos.
- Reglas de notificación y reporteo.
- Integración con infraestructura propia (correo, almacenamiento, base de datos).

Estas adaptaciones no cambian la esencia del programa, sino que constituyen **configuración y personalización** sobre un núcleo funcional reutilizable.

---

## 5. Evidencia de originalidad y aportación

La aportación principal del sistema consiste en integrar en una misma plataforma:

- Identificación y control del activo.
- Registro estructurado de inspecciones, pruebas y evidencias.
- Cálculo y seguimiento de vigencias.
- Consulta histórica orientada a auditoría.
- Operación con control de acceso por perfiles.

---

## 6. Instalación y operación (visión general)

- Se opera desde un navegador web.
- El acceso se controla por usuario y rol.
- Los datos se almacenan centralmente (nube o infraestructura del cliente).
- La evidencia se vincula a los registros para trazabilidad.

---

## 7. Nota de seguridad para el expediente

El paquete de registro **no incluye** credenciales, llaves, contraseñas, archivos `.env`, cuentas de servicio ni secretos. La configuración de conectividad y credenciales se realiza por medios seguros (variables de entorno/archivos de configuración fuera del repositorio).

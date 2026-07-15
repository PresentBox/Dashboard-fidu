# PROJECT_CONTEXT.md — Estado de continuidad de Fidu Gestión CRM

> Documento generado desde los archivos actuales del repositorio. No describe funcionalidades deseadas que no estén implementadas en código.

## 1. Objetivo general

Fidu Gestión CRM es una aplicación web de Google Apps Script para apoyar la gestión de contratos fiduciarios, preliquidaciones, cambios de estado, alertas mensuales y registro de facturación sobre una base operativa en Google Sheets.

El sistema centraliza datos provenientes de varias pestañas del spreadsheet, calcula métricas por perfil, permite a usuarios BTM generar preliquidaciones por tipo de comisión, notifica al perfil Facturación y permite marcar preliquidaciones como facturadas en FIDUSAP.

## 2. Arquitectura actual

La aplicación es una web app de Google Apps Script con frontend HTML/CSS/JS y backend Apps Script:

- `Code.gs`: backend, configuración, lectura/escritura de Google Sheets, reglas de negocio, cálculos, correos y triggers.
- `Index.html`: estructura principal de la interfaz.
- `CSS.html`: estilos embebidos incluidos en `Index.html`.
- `JS.html`: lógica cliente y llamadas `google.script.run` al backend.
- `README.md`: documentación operativa previa.
- `PROJECT_CONTEXT.md`, `CODE_INVENTORY.md`, `BUSINESS_RULES.md`, `CALCULATIONS.md`, `AGENTS.md`: documentación de continuidad.

El frontend se sirve con `doGet()` y se comunica con Apps Script usando `google.script.run`.

## 3. Tecnologías utilizadas

- Google Apps Script.
- HtmlService.
- Google Sheets como base de datos operativa.
- MailApp para correos.
- ScriptApp para triggers instalables.
- Session para identificar usuario activo.
- Utilities para UUID, fechas y formateos.
- JavaScript cliente en navegador.
- HTML y CSS servidos como templates Apps Script.
- Font Awesome por CDN para iconos.

## 4. Funcionamiento general

1. `doGet()` renderiza `Index.html` e incluye `CSS.html` y `JS.html`.
2. Al cargar la página, `JS.html` llama `obtenerEcosistemaLiquidaciones()`.
3. `Code.gs` lee hojas requeridas y opcionales, construye mapas de asignaciones, estados, preliquidaciones, facturación y liquidaciones.
4. El backend retorna usuario, roles, métricas, contratos visibles, tipos de comisión y periodo operativo.
5. El frontend pinta métricas, bandeja, tarjetas, formularios y acciones según perfil.
6. Las acciones críticas se envían de vuelta al backend con `google.script.run`.

## 5. Estructura de archivos y función de cada uno

| Archivo | Función |
| --- | --- |
| `Code.gs` | Backend Apps Script completo: configuración, endpoints, reglas, cálculos, emails, triggers y helpers. |
| `Index.html` | Layout principal: landing, sidebar, topbar, métricas, auditoría, bandeja, formulario nuevo negocio y barras flotantes. |
| `CSS.html` | Estilos de marca, componentes, cards, métricas, formularios, preliquidación, responsive y spinner. |
| `JS.html` | Lógica frontend: carga de datos, renderizado, filtros, eventos, preliquidaciones, facturación y navegación. |
| `README.md` | Guía funcional y operativa existente. |

## 6. Hojas de cálculo utilizadas

| Hoja | Propósito | Creación automática |
| --- | --- | --- |
| `control` | Fuente de verdad principal de contratos, estado, nombre, comisión, tipo y fechas. | No. Es requerida. |
| `CONT/BTM` | Asignaciones de profesional contable, gerente BTM y profesional BTM. | No. Es requerida. |
| `INV SFC` | Respaldo/manual para comparación de estado con SFC. | No. Es requerida. |
| `usuarios` | Perfiles adicionales como Facturación o Súper Admin. | No. Si falta, no bloquea, pero reduce perfiles adicionales. |
| `facturacion` | Registros de negocios facturados por periodo. | Sí, por `getOrCreateBillingSheet_()`. |
| `liquidaciones` | Cierres mensuales de liquidación variable. | Sí, por `getOrCreateLiquidationSheet_()`. |
| `Tabla de comisiones` | Catálogo de tipos de comisión, campos habilitados y ejemplos de cálculo. | No. Si falta, no hay tipos para preliquidar. |
| `preliquidaciones` | Líneas generadas de preliquidación por periodo, radicación y tipo de comisión. | Sí, por `getOrCreatePreliquidationSheet_()`. |

## 7. Mapeos de columnas vigentes

### `control`

- A: No. Radicación (`RADICACION`, índice 0).
- B: Código FIDUSAP (`CODIGO_FIDUSAP`, índice 1).
- E: Fecha constitución (`FECHA_CONSTITUCION`, índice 4).
- F: Fecha vigencia (`FECHA_VIGENCIA`, índice 5).
- G: Nombre del negocio (`NOMBRE_NEGOCIO`, índice 6).
- H: Estado (`ESTADO`, índice 7).
- J: Descripción/comisión (`COMISION`, índice 9).
- L: Tipo general (`TIPO`, índice 11).

### `CONT/BTM`

- A: Radicación.
- B: Nombre.
- G: Profesional especializado contable.
- W: Gerente BTM.
- X: Profesional BTM.

### `INV SFC`

- A: Radicación.
- O: Estado SFC.

## 8. Propiedades, caché, activadores y servicios

### Servicios Apps Script utilizados

- `SpreadsheetApp`: lectura y escritura de Google Sheets.
- `HtmlService`: renderizado de web app.
- `Session`: usuario activo y zona horaria del script.
- `Utilities`: UUID y formateo de fechas.
- `MailApp`: envío de correos.
- `ScriptApp`: creación/eliminación de triggers.

### Activadores

- `crearTriggerAlertasLiquidacion()` crea un trigger diario para `enviarAlertasLiquidacionBTM()` a las 8:00 a. m.
- Antes de crearlo, elimina triggers existentes con el mismo handler.

### CacheService

No hay uso de `CacheService` en el código actual.

### PropertiesService

No hay uso de `PropertiesService` en el código actual.

### LockService / concurrencia

No hay uso de `LockService` en el código actual. Las operaciones de escritura usan `appendRow`, `setValue`, `setValues` y actualizaciones por rango, pero no están protegidas con locks. Esto es deuda técnica para operaciones concurrentes.

## 9. Funciones principales del backend

| Función | Propósito |
| --- | --- |
| `doGet()` | Sirve la web app. |
| `include(filename)` | Incluye HTML parcial. |
| `obtenerEcosistemaLiquidaciones()` | Carga datos base, roles, métricas, contratos, tipos de comisión y periodo. |
| `registrarNuevoNegocio(payload)` | Crea negocio en `control` y `CONT/BTM`. |
| `guardarAjustesEnLote(paqueteCambios)` | Guarda cambios de estado en `control` y notifica a Facturación. |
| `registrarPreliquidacionContrato(payload)` | Registra una preliquidación individual y notifica a Facturación. |
| `registrarPreliquidacionesContrato(paquetes)` | Registra varias preliquidaciones para una radicación y retorna consolidado. |
| `confirmarPreliquidacionFacturada(preliquidacionId, facturaFidusap)` | Facturación marca una preliquidación como `FACTURADA`. |
| `registrarCierreLiquidacionMensual(radicaciones)` | Cierra liquidación mensual de contratos variables. |
| `registrarFacturacionPeriodo(radicaciones)` | Registra negocios facturados para periodo operativo. |
| `enviarAlertasLiquidacionBTM()` | Envía alertas programadas de liquidación. |
| `crearTriggerAlertasLiquidacion()` | Crea trigger diario de alertas. |
| `simularAlertasLiquidacionBTM(fechaISO)` | Simula alertas sin enviar correos. |
| `probar*` | Wrappers manuales para Apps Script. |

## 10. Funciones llamadas por `google.script.run`

Desde `JS.html` se llaman:

- `obtenerEcosistemaLiquidaciones()`.
- `registrarPreliquidacionesContrato(payloads)`.
- `confirmarPreliquidacionFacturada(preliquidacionId, factura)`.
- `registrarFacturacionPeriodo(radicaciones)`.
- `guardarAjustesEnLote(loteCambiosPendientes)`.
- `registrarCierreLiquidacionMensual([radicacion])`.
- `ejecutarAccionServidor(radicacion, 'LIQUIDAR', monto, 'BTM')`.
- `registrarNuevoNegocio(payload)`.

No renombrar estas funciones sin actualizar `JS.html`.

## 11. Flujos críticos

### Carga inicial

- `window.onload` llama `cargarEcosistemaCRM()`.
- Se consume `obtenerEcosistemaLiquidaciones()`.
- El frontend inicializa métricas, roles, filtros, tipos de comisión y bandeja.

### Preliquidación BTM

- BTM/gerente/profesional ve contratos variables activos asignados.
- Selecciona uno o varios tipos de comisión desde `Tabla de comisiones`.
- El frontend calcula preview con subtotal, IVA y total.
- Envía paquetes a `registrarPreliquidacionesContrato()`.
- Backend registra en `preliquidaciones` y notifica a Facturación.
- El contrato deja de aparecer en bandeja BTM del periodo si ya está preliquidado.

### Facturación

- Facturación ve preliquidaciones del periodo actual pendientes de `FACTURADA`.
- Ve subtotal, IVA y valor a facturar.
- Usa `Dejar en firme FIDUSAP` para guardar referencia.
- Backend actualiza estado, factura y usuario facturador.

### Nuevo negocio

- BTM usa formulario de nuevo negocio.
- Puede seleccionar tipo de comisión sugerido desde `Tabla de comisiones`.
- Backend agrega fila en `control` y `CONT/BTM`.

### Cambios de estado

- Usuario autorizado cambia estados en UI.
- `guardarAjustesEnLote()` valida permisos y reglas SFC.
- Se actualiza `control`.
- Se notifica a Facturación.

### Alertas mensuales

- `enviarAlertasLiquidacionBTM()` evalúa calendario.
- Agrupa contratos variables activos pendientes por BTM/profesional.
- Envía correos con tabla/listado y enlace del Dashboard.

## 12. Reglas de negocio vigentes resumidas

- `control` es fuente de verdad de estado del negocio.
- `INV SFC` se usa como respaldo para alertar discrepancias.
- Facturación se configura por hoja `usuarios`.
- Súper Admin puede venir de `usuarios` o de bootstrap de emergencia.
- BTM/profesional/gerente solo actúan sobre contratos asignados.
- Facturación puede ver todos los negocios/preliquidaciones que correspondan a su flujo.
- Contratos variables preliquidados para el periodo se ocultan de la bandeja BTM.
- Periodo operativo: días 1 y 2 del mes trabajan el mes anterior; día 3 inicia nuevo periodo.
- IVA de preliquidación por defecto: 19%.
- Si el tipo de comisión trae IVA desde tabla, backend usa ese valor.
- Porcentajes: `1` significa `1%`; valores mayores o iguales a 1 se dividen entre 100 en campos porcentuales.
- Salarios mínimos: valores como `0,65` multiplican directamente por SMMLV.

## 13. Estados actuales de procesos

### Negocio / control

- `Activo`.
- `Inactivo`.
- `En Liquidación`.

### Preliquidación

- `PRELIQUIDADA` al crear.
- `FACTURADA` al confirmar en FIDUSAP.

### Facturación

- `FACTURADO` en hoja `facturacion`.

### Liquidación

- `CERRADA` en hoja `liquidaciones`.

### Validación SFC

- `OK`.
- `Discrepancia SFC: <estado>`.

## 14. Cálculos y redondeos generales

Los cálculos críticos están detallados en `CALCULATIONS.md`. Resumen:

- Subtotal depende de campos habilitados por tipo de comisión.
- IVA = subtotal × tasa IVA.
- Total = subtotal + IVA.
- Backend redondea subtotal, IVA y total con `Math.round()`.
- Frontend replica la vista previa para UX; backend es autoridad final al guardar.

## 15. Manejo de registros

- Lecturas principales: `getDataRange().getValues()` o rangos completos según columnas requeridas.
- Escrituras nuevas: `appendRow()` para facturación, liquidaciones, preliquidaciones y nuevo negocio.
- Actualizaciones puntuales: `setValue()` para estados y confirmación de factura.
- No hay control transaccional ni locks.

## 16. Dependencias entre funciones

- `obtenerEcosistemaLiquidaciones()` depende de builders de mapas, perfiles, periodo y tipos de comisión.
- `registrarPreliquidacionContrato()` depende de permisos, tipos de comisión, cálculo, hoja `preliquidaciones` y notificación.
- `registrarPreliquidacionesContrato()` depende de `registrarPreliquidacionContrato()`.
- `guardarAjustesEnLote()` depende de validaciones de permisos/SFC y notificación.
- `enviarAlertasLiquidacionBTM()` depende de calendario, grupos de liquidación, correos y plantilla.

## 17. Decisiones técnicas importantes

- Google Sheets es la base de datos operativa.
- `control` conserva fuente de verdad del estado.
- Las hojas auxiliares se crean automáticamente si faltan para evitar fallos operativos.
- Las reglas de periodo se calculan en backend, no en frontend.
- El frontend recalcula métricas según vista/filtro visible.
- Se conserva una lista bootstrap de Súper Admin por seguridad operativa.

## 18. Funcionalidades terminadas

- Web app renderizable por Apps Script.
- Carga de contratos y métricas.
- Roles básicos y perfiles adicionales.
- Auditoría por usuario para Súper Admin.
- Vista BTM y vista Facturación.
- Preliquidación por uno o varios tipos de comisión.
- Registro de preliquidaciones.
- Confirmación de facturación FIDUSAP.
- Registro de facturación de periodo.
- Cierre mensual de liquidación.
- Alertas mensuales con simuladores y wrappers de prueba.
- Nuevo negocio con tipo de comisión sugerido.
- Perfil compacto desplegable.
- Spinner de proceso para guardados/creación.

## 19. Funcionalidades parcialmente terminadas o preparadas

- `ejecutarAccionServidor()` solo retorna confirmación de base variable; no escribe auditoría ni hoja específica.
- Registro de nuevo negocio no valida contra todos los campos potenciales del negocio; crea estructura mínima en `control` y `CONT/BTM`.
- No existe pantalla separada de historial completo; solo se muestra última preliquidación y preliquidaciones actuales.
- No hay pruebas automatizadas de integración con Sheets reales.

## 20. Errores conocidos y riesgos pendientes

- Sin `LockService`: riesgo de carreras si dos usuarios escriben al mismo tiempo.
- Sin `CacheService`: lecturas completas pueden ser costosas con hojas grandes.
- Sin `PropertiesService`: configuración sensible a cambios directos en código.
- Dependencia de nombres exactos de hojas.
- La inferencia de campos habilitados depende del color gris de celdas en `Tabla de comisiones`.
- La inferencia de tipo `Variable`/`Fija` depende del texto de comisión.
- `MailApp` puede requerir autorización y está sujeto a cuotas.
- `Session.getActiveUser().getEmail()` puede depender del dominio/configuración de despliegue.

## 21. Deuda técnica

- Agregar locks a registros críticos.
- Añadir pruebas unitarias locales de funciones puras.
- Separar configuración operativa a hoja o propiedades.
- Normalizar catálogos de estados y tipos en hojas de configuración.
- Reducir escrituras/lecturas completas si crece la base.
- Mejorar trazabilidad/auditoría de cambios.
- Validar duplicados de preliquidación por tipo/radicación/periodo si negocio lo requiere.

## 22. Próximos pasos recomendados

1. Validar con usuarios BTM y Facturación el ciclo mensual completo.
2. Revisar concurrencia antes de ampliar uso masivo.
3. Definir si se permite más de una preliquidación del mismo tipo por radicación/periodo.
4. Crear pruebas controladas para cada tipo de comisión.
5. Confirmar si `ejecutarAccionServidor()` debe persistir una liquidación formal.
6. Evaluar mover parámetros como URL, admins bootstrap y corte de periodo a configuración externa.

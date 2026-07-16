# BUSINESS_RULES.md — Reglas de negocio implementadas

> Solo se incluyen reglas comprobables en el código actual. Donde la regla depende de interpretación operativa, se marca como “requiere confirmación”.

## BR-01 — Fuente de verdad de estado

- **Descripción:** La hoja `control` contiene el estado actual del negocio.
- **Archivo y función:** `Code.gs`, `buildCrmResponse_()`, `updateControlStatuses_()`, `registrarNuevoNegocio()`.
- **Datos:** `control` columna H.
- **Resultado esperado:** Las métricas, tarjetas y cambios se basan en el estado de `control`.
- **Casos especiales:** `INV SFC` no sobrescribe estado; solo alerta discrepancias.
- **Validaciones relacionadas:** `getValidationStatus_()`, `validateSfcDiscrepancyRule_()`.
- **Riesgo si se modifica:** Alto; puede cambiar toda la operación.

## BR-02 — Respaldo SFC y discrepancias

- **Descripción:** `INV SFC` se usa para comparar estado contra `control` y mostrar discrepancias.
- **Archivo y función:** `Code.gs`, `buildSfcStatusMap_()`, `getValidationStatus_()`, `validateSfcDiscrepancyRule_()`.
- **Datos:** `INV SFC` columnas A y O; `control` columna H.
- **Resultado esperado:** Si el estado difiere, se muestra `Discrepancia SFC: <estado>`.
- **Casos especiales:** Si SFC no existe para la radicación, estado real queda `No Encontrado`.
- **Validaciones relacionadas:** Cambios pueden bloquearse si no cumplen regla SFC.
- **Riesgo si se modifica:** Alto; afecta controles previos a facturar.

## BR-03 — Perfiles y roles

- **Descripción:** Los roles vienen de asignaciones BTM y perfiles adicionales en `usuarios`; Súper Admin se determina únicamente desde la tabla de perfiles `usuarios`.
- **Archivo y función:** `Code.gs`, `getUserRolesForAssignment_()`, `getAdditionalProfiles_()`, `isSuperAdmin_()`, `buildRolesList_()`.
- **Datos:** `CONT/BTM`, `usuarios`.
- **Resultado esperado:** Usuario recibe roles y permisos según correo.
- **Casos especiales:** Si la hoja `usuarios` falta o no contiene el perfil, no se otorga Súper Admin por código.
- **Validaciones relacionadas:** Permisos de edición/preliquidación/facturación.
- **Riesgo si se modifica:** Alto; puede abrir o bloquear accesos.

## BR-04 — Visibilidad BTM por asignación

- **Descripción:** Usuarios no admin ven contratos donde sean gerente BTM o profesional BTM.
- **Archivo y función:** `JS.html`, `debeMostrarContrato()`; `Code.gs`, `buildCrmResponse_()`.
- **Datos:** `CONT/BTM` columnas W y X.
- **Resultado esperado:** Bandeja BTM muestra contratos asignados.
- **Casos especiales:** Súper Admin puede ver todo; auditoría puede filtrar por correo.
- **Validaciones relacionadas:** `getUserRolesForAssignment_()`.
- **Riesgo si se modifica:** Alto; afecta confidencialidad y operación.

## BR-05 — Visibilidad Facturación

- **Descripción:** Facturación visualiza contratos con preliquidaciones del periodo actual pendientes de `FACTURADA`, aunque la columna periodo haya quedado como texto `yyyy-MM` o como fecha interpretada por Sheets.
- **Archivo y función:** `JS.html`, `debeMostrarContrato()`, `tienePreliquidacionesPorFacturar()`; `Code.gs`, `buildCrmResponse_()`.
- **Datos:** Hoja `preliquidaciones` periodo actual, estado `estado_preliquidacion`.
- **Resultado esperado:** Facturación ve valores a facturar y botón para dejar firme FIDUSAP.
- **Casos especiales:** Preliquidaciones ya `FACTURADA` no aparecen como pendientes.
- **Validaciones relacionadas:** `confirmarPreliquidacionFacturada()` valida perfil.
- **Riesgo si se modifica:** Alto; puede facturar registros incorrectos.

## BR-06 — Periodo operativo con corte día 2

- **Descripción:** Días 1 y 2 del mes se conserva como periodo operativo el mes anterior; desde el día 3 se usa el mes actual.
- **Archivo y función:** `Code.gs`, `getCurrentBillingPeriod_()`.
- **Datos:** Fecha actual del script y `CONFIG.PERIOD_CUTOFF_DAY`.
- **Resultado esperado:** Del 1 al 2 de agosto el periodo es julio; el 3 de agosto inicia agosto.
- **Casos especiales:** Se usa zona horaria del proyecto Apps Script.
- **Validaciones relacionadas:** Mapas de `facturacion`, `liquidaciones`, `preliquidaciones` por periodo.
- **Riesgo si se modifica:** Alto; afecta contador mensual y facturación.

## BR-07 — Preliquidación solo para roles autorizados

- **Descripción:** Solo Súper Admin, gerente BTM o profesional BTM asignado puede preliquidar.
- **Archivo y función:** `Code.gs`, `registrarPreliquidacionContrato()`.
- **Datos:** Usuario activo, `CONT/BTM`.
- **Resultado esperado:** Usuarios no autorizados reciben error.
- **Casos especiales:** Facturación no genera preliquidación en la UI actual.
- **Validaciones relacionadas:** `isSuperAdmin_()`, asignaciones.
- **Riesgo si se modifica:** Alto; puede permitir preliquidaciones no autorizadas.

## BR-08 — Preliquidación gestionada visible para BTM

- **Descripción:** Si una radicación ya tiene preliquidación o cierre de liquidación del periodo, permanece visible para el BTM asignado con estado `Preliquidado`/gestión cerrada y se bloquea volver a preliquidar.
- **Archivo y función:** `JS.html`, `debeMostrarContrato()`; `Code.gs`, `buildCrmResponse_()`.
- **Datos:** `preliquidaciones`, `liquidaciones`, esquema de comisión.
- **Resultado esperado:** La bandeja mantiene trazabilidad visual de contratos gestionados y la métrica de pendientes solo cuenta los contratos aún no preliquidados/cerrados.
- **Casos especiales:** Facturación sí puede ver preliquidaciones pendientes.
- **Validaciones relacionadas:** `preliquidadoPeriodoActual`, `liquidacionCerradaPeriodoActual`.
- **Riesgo si se modifica:** Medio/alto; puede duplicar trabajo BTM.

## BR-09 — Registro de múltiples tipos de comisión

- **Descripción:** El frontend permite agregar uno o varios tipos de comisión antes de guardar.
- **Archivo y función:** `JS.html`, `crearFormularioPreliquidacion()`, `generarPreliquidaciones()`; `Code.gs`, `registrarPreliquidacionesContrato()`.
- **Datos:** `Tabla de comisiones`, valores ingresados por usuario.
- **Resultado esperado:** Cada tipo se guarda como línea independiente y se devuelve total consolidado.
- **Casos especiales:** No valida duplicidad de mismo tipo en mismo periodo.
- **Validaciones relacionadas:** Selección obligatoria de al menos un tipo.
- **Riesgo si se modifica:** Alto; afecta preliquidación y notificación.

## BR-10 — Facturación deja firme una preliquidación

- **Descripción:** Solo Facturación o Súper Admin puede cambiar preliquidación a `FACTURADA`.
- **Archivo y función:** `Code.gs`, `confirmarPreliquidacionFacturada()`.
- **Datos:** ID preliquidación, factura FIDUSAP, usuario activo.
- **Resultado esperado:** Se actualizan columnas M, N y O de `preliquidaciones`.
- **Casos especiales:** Si no encuentra ID lanza error.
- **Validaciones relacionadas:** Perfil Facturación.
- **Riesgo si se modifica:** Alto; afecta cierre contable/facturación.

## BR-11 — Facturación de periodo

- **Descripción:** Perfil Facturación registra radicaciones como facturadas en hoja `facturacion`.
- **Archivo y función:** `Code.gs`, `registrarFacturacionPeriodo()`.
- **Datos:** Lista de radicaciones, periodo operativo, usuario activo.
- **Resultado esperado:** Se agregan filas con estado `FACTURADO`.
- **Casos especiales:** No hay deduplicación explícita comprobada en la función.
- **Validaciones relacionadas:** Perfil Facturación.
- **Riesgo si se modifica:** Alto; afecta histórico de facturación.

## BR-12 — Cierre mensual de liquidación variable

- **Descripción:** Solo contratos variables se registran como cierre mensual en `liquidaciones`.
- **Archivo y función:** `Code.gs`, `registrarCierreLiquidacionMensual()`.
- **Datos:** Radicaciones, estado/esquema de `control`, periodo operativo.
- **Resultado esperado:** Se agregan filas con estado `CERRADA`.
- **Casos especiales:** Contratos fijos se ignoran en cierre variable.
- **Validaciones relacionadas:** Esquema `Variable`.
- **Riesgo si se modifica:** Medio/alto; afecta alertas y pendientes.

## BR-13 — Alertas solo para contratos variables pendientes

- **Descripción:** Alertas BTM incluyen contratos activos, variables, sin cierre de liquidación y sin preliquidación del periodo.
- **Archivo y función:** `Code.gs`, `buildLiquidationReminderGroups_()`, `enviarAlertasLiquidacionBTM()`.
- **Datos:** `control`, asignaciones, `liquidaciones`, `preliquidaciones`.
- **Resultado esperado:** Correos agrupados por destinatario BTM/profesional.
- **Casos especiales:** Si no hay alerta para la fecha, no envía.
- **Validaciones relacionadas:** Calendario de alertas.
- **Riesgo si se modifica:** Alto; puede generar alertas incorrectas.

## BR-14 — Calendario de alertas

- **Descripción:** Alertas se calculan 3, 2 y 1 días hábiles antes del día 1 y el día 1 calendario.
- **Archivo y función:** `Code.gs`, `getLiquidationAlertForDate_()`, `getLiquidationAlertsForFirstDay_()`, `addBusinessDays_()`.
- **Datos:** Fecha actual/simulada, calendario simple de lunes a viernes.
- **Resultado esperado:** Tipo de alerta y fecha de cierre.
- **Casos especiales:** No se contemplan festivos nacionales en el código.
- **Validaciones relacionadas:** Wrappers `probarCalendarioAlertasLiquidacion()`.
- **Riesgo si se modifica:** Medio/alto; puede afectar oportunidad de correos.

## BR-15 — Nuevo negocio

- **Descripción:** Nuevo negocio crea filas en `control` y `CONT/BTM`.
- **Archivo y función:** `Code.gs`, `registrarNuevoNegocio()`.
- **Datos:** Payload de formulario, usuario activo.
- **Resultado esperado:** Radicación nueva en ambas hojas; en `CONT/BTM` se guarda Código Negocio FIDUSAP en columna B y Nombre del Negocio en columna D.
- **Casos especiales:** Si ya existe radicación, lanza error.
- **Validaciones relacionadas:** Radicación y nombre obligatorios.
- **Riesgo si se modifica:** Alto; puede duplicar o perder asignaciones.

## BR-16 — Cambio de estado por lote

- **Descripción:** Cambios se normalizan, validan y se escriben en `control`.
- **Archivo y función:** `Code.gs`, `guardarAjustesEnLote()`, `validateUserCanEditChanges_()`, `updateControlStatuses_()`.
- **Datos:** Paquete `{radicacion: estado}`.
- **Resultado esperado:** Estados actualizados y correo a Facturación.
- **Casos especiales:** Paquete vacío retorna mensaje sin escribir.
- **Validaciones relacionadas:** Permiso por asignación/admin y regla SFC.
- **Riesgo si se modifica:** Muy alto; altera fuente de verdad.

## BR-17 — Tipos de comisión desde catálogo

- **Descripción:** Tipos se leen desde `Tabla de comisiones` fila 4 en adelante; campos grises se consideran no aplicables.
- **Archivo y función:** `Code.gs`, `getCommissionTypes_()`, `buildCommissionField_()`, `isDisabledCommissionCell_()`.
- **Datos:** B1, filas desde 4, columnas A:G, colores de fondo.
- **Resultado esperado:** Selects y cálculos habilitan solo campos aplicables.
- **Casos especiales:** Si falta hoja, frontend muestra mensaje.
- **Validaciones relacionadas:** Inferencia de modo de campo.
- **Riesgo si se modifica:** Alto; afecta todos los cálculos.

## BR-18 — Regla de porcentaje

- **Descripción:** En campos porcentuales, todo valor no cero se divide entre 100; `1` significa 1%, `3` significa 3%, `0,3` significa 0,3% y `0,05` significa 0,05%.
- **Archivo y función:** `Code.gs`, `normalizeRate_()`; `JS.html`, `normalizarPorcentaje()`.
- **Datos:** Campo cantidad en modo `porcentaje`.
- **Resultado esperado:** `1` = 1%, `3` = 3%, `0,3` = 0,3%, `0,05` = 0,05%.
- **Casos especiales:** Depende de que el campo haya sido inferido como porcentaje.
- **Validaciones relacionadas:** `inferCommissionFieldMode_()`.
- **Riesgo si se modifica:** Alto; altera valores a facturar.

## BR-19 — Regla de salarios mínimos

- **Descripción:** En campos de salarios, la cantidad se multiplica directamente por SMMLV.
- **Archivo y función:** `Code.gs`, `calcularPreliquidacion_()`; `JS.html`, `calcularPreviewPreliqDesglosado()`.
- **Datos:** SMMLV de `Tabla de comisiones` B1, cantidad ingresada.
- **Resultado esperado:** `0,65` produce 0,65 × SMMLV.
- **Casos especiales:** Requiere que el campo no esté en modo porcentaje.
- **Validaciones relacionadas:** `inferCommissionFieldMode_()`.
- **Riesgo si se modifica:** Alto; impacta contratos con salarios mínimos.

## BR-20 — Requiere confirmación: feriados y calendario hábil Colombia

- **Descripción:** El código usa días hábiles lunes-viernes, no festivos.
- **Archivo y función:** `Code.gs`, `addBusinessDays_()`.
- **Datos:** Fecha.
- **Resultado esperado:** Resta/suma días excluyendo sábados y domingos.
- **Casos especiales:** Festivos no están modelados.
- **Validaciones relacionadas:** Simulación de calendario.
- **Riesgo si se modifica:** Medio; podría cambiar fechas de alertas.


## BR-21 — Nuevo negocio con asignación notificada

- **Descripción:** Al crear un negocio, `Tipo general` debe ser `Fija` o `Variable`, pueden registrarse varios tipos de comisión sugeridos, se muestran campos/preview de cálculo en una sección final dedicada, se guardan preliquidaciones iniciales cuando el usuario captura valores y se notifica a gerente/profesional BTM asignados.
- **Archivo y función:** `Code.gs`, `registrarNuevoNegocio()`, `notifyAssignedBtmNewBusiness_()`; `Index.html`, formulario `newBusinessForm`; `JS.html`, `crearNuevoNegocio()`.
- **Datos:** `control`, `CONT/BTM`, `Tabla de comisiones`.
- **Resultado esperado:** El negocio queda creado con asignación BTM/contable, Código Negocio FIDUSAP en `CONT/BTM` columna B, Nombre del Negocio en columna D, las preliquidaciones iniciales con valores quedan en `preliquidaciones` y los BTM asignados reciben correo de aviso con plantilla visual estándar.
- **Riesgo si se modifica:** Alto; afecta entrada de negocios y notificación operativa.

## BR-22 — Reasignación temporal por BTM actual

- **Descripción:** Solo el gerente BTM o profesional BTM actualmente asignado puede reasignar temporalmente gerente/profesional BTM en `CONT/BTM`.
- **Archivo y función:** `Code.gs`, `reasignarBtmNegocio()`; `JS.html`, `crearBloqueReasignacionBtm()`.
- **Datos:** `CONT/BTM` columnas W y X.
- **Resultado esperado:** Usuarios no asignados no pueden reasignar el negocio.
- **Riesgo si se modifica:** Alto; afecta control de asignaciones y confidencialidad.

## BR-23 — Visualización sin preliquidación para negocios no activos

- **Descripción:** Negocios en estado `Inactivo` o `En Liquidación` se pueden visualizar, pero no permiten generar preliquidaciones.
- **Archivo y función:** `JS.html`, `crearFormularioPreliquidacion()`; `Code.gs`, `registrarPreliquidacionContrato()`.
- **Datos:** `control` columna H.
- **Resultado esperado:** La UI muestra bloqueo y el backend rechaza cualquier intento de preliquidar negocios no activos.
- **Riesgo si se modifica:** Alto; puede permitir facturación sobre negocios no activos.

## BR-24 — Filtros operativos de bandeja

- **Descripción:** La bandeja permite filtrar por tipo de comisión, estado operativo (`Activo`, `Preliquidado`, `Pendiente`, `Inactivo`, `En Liquidación`) y buscar por radicación, código FIDUSAP o nombre/descripción del negocio.
- **Archivo y función:** `JS.html`, `asegurarFiltroComision()`, `cambiarPerfilDeVista()`, `debeMostrarContrato()`.
- **Datos:** `listaContratos` retornada por `Code.gs`.
- **Resultado esperado:** El usuario puede ubicar contratos específicos sin alterar la lógica de permisos ni los cálculos de preliquidación.
- **Riesgo si se modifica:** Medio; puede ocultar registros en UI si los filtros se aplican incorrectamente.

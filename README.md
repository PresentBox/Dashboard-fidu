# Fidu Gestión CRM - configuración funcional

## Hojas requeridas

El proyecto espera las hojas operativas existentes:

- `control`: fuente de verdad del estado del negocio.
- `CONT/BTM`: asignaciones de contador, gerente BTM y profesional especializado.
- `INV SFC`: respaldo cargado manualmente para alertar discrepancias contra Superfinanciera.

## Hoja `usuarios`

Crea una hoja llamada `usuarios` para perfiles adicionales que deben ver todos los negocios sin depender del tipo de negocio o asignación BTM.

| Columna | Campo | Ejemplo |
| --- | --- | --- |
| A | email | facturacion@bbva.com |
| B | perfil | Facturación |
| C | activo | SI |

Notas:

- El perfil `Facturación` puede escribirse con o sin tilde; el sistema lo normaliza.
- El perfil `Súper Admin` se administra desde esta hoja; el código no conserva correos bootstrap de Súper Admin.
- Usa `NO`, `INACTIVO` o `FALSE` en la columna C para desactivar un usuario.

## Hoja `facturacion`

El sistema crea automáticamente la hoja `facturacion` si no existe cuando el perfil Facturación registra negocios facturados.

Columnas creadas:

| Columna | Campo |
| --- | --- |
| A | fecha_registro |
| B | periodo |
| C | radicacion |
| D | usuario |
| E | estado_facturacion |

El periodo operativo se calcula con el reloj actual del script en formato `yyyy-MM`, pero conserva el mes anterior hasta el día 2 calendario a las 11:59 p. m. del mes siguiente. El día 3 inicia el nuevo periodo. Cuando una radicación queda registrada para el periodo operativo, desaparece de la vista de pendientes de Facturación.

## Mapeo inicial para pre liquidación

La vista de expedientes usa estos campos para armar la estructura inicial de pre liquidación:

| Dato | Hoja | Columna |
| --- | --- | --- |
| Código FIDUSAP | `control` | B |
| No. de Radicación | `control` | A |
| Nombre del negocio | `control` | G |
| Estado | `control` | H |
| Fecha de constitución | `control` | E |
| Fecha de vigencia | `control` | F |
| Gerente BTM | `CONT/BTM` | W |
| Profesional BTM | `CONT/BTM` | X |
| Profesional especializado contable | `CONT/BTM` | G |

## Alertas mensuales de liquidación BTM

El backend incluye `enviarAlertasLiquidacionBTM()` para enviar recordatorios al Gerente BTM y Profesional BTM de contratos activos. El correo incluye el enlace del Dashboard configurado en `CONFIG.DASHBOARD_URL`.

Calendario de alertas:

| Momento | Mensaje |
| --- | --- |
| 3 días hábiles antes del día 1 | Ya pueden ir liquidando |
| 2 días hábiles antes del día 1 | Quedan dos días para cerrar la liquidación |
| 1 día hábil antes del día 1 | Queda un día para registrar novedades |
| Día 1 calendario | Cierre de novedades / periodo finalizado |

Para activarlo en Apps Script, ejecuta una vez `crearTriggerAlertasLiquidacion()` desde el editor. Esto crea un trigger instalable diario a las 8:00 a.m. según la zona horaria del proyecto y solicitará permisos de Spreadsheet, MailApp y Triggers.

## Cierre mensual de liquidación variable

La vista de contratos permite cerrar la liquidación mensual de contratos con esquema `Variable`. El cierre se registra en la hoja `liquidaciones`, separada de `facturacion`, para que el mismo contrato vuelva a quedar pendiente al iniciar un nuevo periodo `yyyy-MM`.

Columnas creadas automáticamente en `liquidaciones`:

| Columna | Campo |
| --- | --- |
| A | fecha_registro |
| B | periodo |
| C | radicacion |
| D | usuario |
| E | estado_liquidacion |
| F | esquema |

Las alertas mensuales BTM solo incluyen contratos activos, variables y que no tengan cierre de liquidación en el periodo actual. Todos los correos incluyen la tabla/listado de negocios pendientes, la fecha límite del día 1 calendario y el enlace al Dashboard.

Para revisar el calendario antes de activar el trigger, ejecuta desde Apps Script:

```js
probarCalendarioAlertasLiquidacion()
```

El resultado queda impreso en el **Registro de ejecución** mediante `Logger.log`. Si solo ves `Ejecución iniciada` y `Ejecución finalizada`, despliega/actualiza el panel de registros o abre la ejecución desde el historial de ejecuciones para ver el JSON con `mesEvaluado`, `fechaCierre` y `alertas`.

Para probar cada correo por separado sin activar el envío masivo, cambia `CONFIG.TEST_EMAIL` y ejecuta uno de estos wrappers:

```js
probarCorreoLiquidacion3Dias()
probarCorreoLiquidacion2Dias()
probarCorreoLiquidacion1Dia()
probarCorreoLiquidacionCierre()
```

## Simulación y prueba de correos

Para validar alertas sin enviar correos reales, ejecuta desde Apps Script:

```js
simularAlertasLiquidacionBTM('2026-07-29')
```

La función devuelve si esa fecha dispararía correo, destinatarios calculados y contratos de muestra, pero no envía nada.

Para probar el diseño del correo y el envío real a un buzón controlado, ejecuta:

```js
enviarCorreoPruebaLiquidacionBTM('tu.correo@bbva.com')
```

Esta prueba no depende de que la fecha actual sea una fecha del calendario de alertas. Si no encuentra contratos variables pendientes, envía un contrato visual de prueba.

### Cómo ejecutar pruebas desde el botón **Ejecutar** de Apps Script

Apps Script no permite escribir argumentos directamente en la firma de la función. No cambies esto:

```js
function enviarCorreoPruebaLiquidacionBTM(emailDestino) {
```

Si quieres probar desde el selector de funciones, usa los wrappers sin parámetros:

```js
probarSimulacionAlertasLiquidacion()
probarCorreoLiquidacionBTM()
```

Para cambiar el buzón de prueba, edita `CONFIG.TEST_EMAIL` en `Code.gs` y luego ejecuta `probarCorreoLiquidacionBTM()`.

## Preliquidación por tipo de comisión

La funcionalidad de preliquidación usa la pestaña `Tabla de comisiones` como catálogo operativo. El sistema lee:

| Celda / columnas | Uso |
| --- | --- |
| `B1` | Base SMMLV para cálculos por salarios mínimos |
| Fila 3 | Encabezados de campos de cálculo |
| Columna A desde fila 4 | Tipo de comisión desplegable |
| Columnas C, D, E y F | Campos habilitados según color de celda; las celdas grises se consideran no aplicables |
| Columna G | Total de ejemplo / referencia |

El rol BTM / Profesional BTM genera una o varias preliquidaciones por negocio para el periodo actual. Cada registro se guarda en la hoja `preliquidaciones`, creada automáticamente si no existe, y notifica al perfil `Facturación` configurado en la hoja `usuarios`.

Columnas creadas automáticamente en `preliquidaciones`:

| Columna | Campo |
| --- | --- |
| A | fecha_registro |
| B | periodo |
| C | id |
| D | radicacion |
| E | codigo_fidusap |
| F | nombre_negocio |
| G | tipo_comision |
| H | valores_json |
| I | subtotal |
| J | iva |
| K | total |
| L | usuario_preliquida |
| M | estado_preliquidacion |
| N | factura_fidusap |
| O | usuario_factura |
| P | descripcion_comision |

Cuando existe al menos una preliquidación del periodo para una radicación, esa radicación deja de aparecer en los alertamientos mensuales de pendiente por preliquidar y queda visible como gestionada/preliquidada en la bandeja BTM del periodo. Facturación puede dejarla en firme con el botón `Dejar en firme FIDUSAP`, que cambia el estado a `FACTURADA` y registra la referencia de factura.

### Ajustes de cálculo de preliquidación

Los campos porcentuales de la `Tabla de comisiones` se muestran al usuario como porcentaje entero cuando la hoja los almacena como decimal. Por ejemplo, un `3%` almacenado como `0,03` se presenta como `3` y se calcula como `3%`; si el usuario ingresa `1`, el cálculo interpreta `1%` (`0,01`) y no `100%`. Para cantidades de salarios mínimos, valores como `0,65` se conservan como `0,65` y se multiplican directamente por el SMMLV configurado.

En el frontend el usuario puede agregar uno o varios tipos de comisión a un resumen temporal y luego guardar/cerrar la preliquidación. El sistema registra cada tipo como una línea independiente y devuelve el total consolidado del periodo seleccionado. La vista de Facturación muestra las preliquidaciones pendientes con subtotal, IVA y valor a facturar para dejarlas en firme en FIDUSAP.

## Creación de nuevo negocio

El menú lateral mantiene tres acciones principales: Home, Preliquidación y Crear nuevo negocio. La opción de nuevo negocio muestra un formulario en blanco para que un BTM registre una radicación nueva con datos abiertos de control, asignaciones BTM, tipo de comisión sugerido desde `Tabla de comisiones` y descripción de comisiones. Al guardar, el sistema agrega la fila en `control` y la asignación en `CONT/BTM`; en `CONT/BTM` guarda Código Negocio FIDUSAP en columna B y Nombre del Negocio en columna D.

Las métricas de gestión se calculan sobre la vista/filtro actual e incluyen contratos activos, variables, discrepancias, inactivos y en liquidación. En la vista BTM, el indicador de pendientes del periodo actual baja cuando un contrato variable queda preliquidado; en la vista Facturación se mantiene como preliquidaciones pendientes de dejar en firme/facturar. El periodo cambia automáticamente con el reloj del script (`yyyy-MM`) bajo corte día 2: por ejemplo, del 1 al 2 de agosto aún se trabaja julio; el 3 de agosto inicia agosto y se vuelve a evaluar la hoja `preliquidaciones` contra ese nuevo periodo.

## Perfil, métricas compactas y feedback visual

La barra superior muestra únicamente un círculo de perfil para ahorrar espacio. Al hacer clic en el círculo, se despliega la tarjeta con nombre, correo y roles detectados. El color de la imagen/insignia cambia según el perfil principal encontrado: Súper Admin, Facturación, Gerente o Profesional.

Las métricas se presentan en una sola línea compacta e incluyen: activos, variables, fijos, total fijos + variables, discrepancias, inactivos, en liquidación y pendientes del periodo para Facturación.

En la preliquidación, el frontend muestra el desglose `Subtotal`, `IVA 19%` y `Total` por cada tipo de comisión agregado, y el backend responde el consolidado separado de subtotal, IVA y total. Los procesos de creación o guardado muestran una capa de carga con spinner para evitar que el usuario perciba que la herramienta quedó sin respuesta.

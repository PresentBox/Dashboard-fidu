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
- El perfil `Súper Admin` también puede administrarse en esta hoja; el código conserva una lista bootstrap mínima en `Code.gs` solo como respaldo de emergencia si la hoja aún no existe o queda mal configurada.
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

El periodo se calcula con el reloj actual del script en formato `yyyy-MM`. Cuando una radicación queda registrada para el periodo actual, desaparece de la vista de pendientes de Facturación.

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
| Día 02 calendario | Cierre de novedades |

Para activarlo en Apps Script, ejecuta una vez `crearTriggerAlertasLiquidacion()` desde el editor. Esto crea un trigger instalable diario a las 8:00 a.m. según la zona horaria del proyecto y solicitará permisos de Spreadsheet, MailApp y Triggers.

# VERSION.md — Historial de versiones Fidu Gestión

## Versión actual

- **Versión:** 0.2.12
- **Fecha:** 2026-07-16
- **Entrega:** Corrige falsos positivos de negocios facturados causados por filas históricas o incompletas de `facturacion`.

## 0.2.12

- Solo reconoce una radicación como facturada si la fila tiene estado `FACTURADO`, fecha, valor mayor que cero, factura FIDUSAP y CUFE.
- Las filas creadas por el flujo legado de cinco columnas permanecen como histórico, pero ya no bloquean la facturación consolidada.

## 0.2.11

- Cambia la unidad de facturación: se factura el negocio completo del periodo y no cada línea de preliquidación.
- Exige factura FIDUSAP, CUFE y fecha de facturación; valida el valor contra la suma de todas las preliquidaciones.
- Agrega importación masiva CSV y descarga de plantilla desde el frontend.
- Amplía `facturacion` con código FIDUSAP, fecha, valor, factura y CUFE, y protege el registro con `LockService`.

## 0.2.10

- Los tipos con `cantidad` en modo `salarios` calculan exclusivamente `cantidad × smmlv`, ignorando saldos o valores UVR que puedan estar habilitados en la fila.
- El frontend muestra el SMMLV parametrizado como campo bloqueado visible en preliquidación y preview de nuevo negocio.

## 0.2.9

- Cambia `normalizeRate_()` y `normalizarPorcentaje()` para dividir entre 100 todo valor porcentual no cero.
- Documenta ejemplos: `1` = 1%, `3` = 3%, `0,3` = 0,3% y `0,05` = 0,05%.

## 0.2.8

- Unifica correos de nuevo negocio asignado, preliquidación para facturación y cambios de estado con la plantilla HTML tipo alerta diaria antes del vencimiento.
- Mantiene cuerpos de texto plano como respaldo para clientes de correo sin HTML.

## 0.2.7

- Reorganiza el formulario `Crear negocio` para mover `Tipos de comisión sugeridos`, `Descripción de comisiones` y el preview de preliquidación inicial a una sección final dedicada.
- Ajusta estilos de la sección de comisiones para evitar que el selector múltiple desajuste las cajas principales del formulario.

## Política de versionado operativa

- Incrementar la versión en `CONFIG.APP_VERSION` dentro de `Code.gs` en cada entrega funcional.
- Actualizar este archivo con un resumen claro de cambios para que GitHub, Apps Script y el equipo operativo puedan identificar qué versión está desplegada.
- Mantener el badge de versión visible en la UI para facilitar soporte y validación.

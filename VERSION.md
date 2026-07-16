# VERSION.md — Historial de versiones Fidu Gestión

## Versión actual

- **Versión:** 0.2.8
- **Fecha:** 2026-07-16
- **Entrega:** Unifica el look and feel de correos operativos con la plantilla visual de alertas diarias antes del vencimiento.

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

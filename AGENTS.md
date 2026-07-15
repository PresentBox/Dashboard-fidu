# AGENTS.md — Instrucciones permanentes para agentes

Estas instrucciones aplican a todo el repositorio.

1. Antes de realizar cambios, leer:
   - `PROJECT_CONTEXT.md`
   - `BUSINESS_RULES.md`
   - `CALCULATIONS.md`
   - `CODE_INVENTORY.md`
2. Revisar los archivos actuales del repositorio y no depender únicamente del historial del chat.
3. No alterar reglas de negocio sin autorización explícita del usuario.
4. No cambiar cálculos, fórmulas, interpretación de porcentajes, IVA, periodos ni redondeos sin autorización explícita.
5. No borrar funcionalidades existentes.
6. No modificar nombres públicos de funciones llamadas por el frontend mediante `google.script.run` sin actualizar y validar todas sus referencias.
7. Mantener compatibilidad con Google Apps Script y evitar sintaxis o APIs no compatibles con Apps Script.
8. Evitar lecturas y escrituras individuales innecesarias en Google Sheets; preferir lecturas por rango y escrituras agrupadas cuando sea viable.
9. Proteger operaciones críticas con mecanismos de concurrencia cuando corresponda; actualmente no existe `LockService`, por lo que cualquier escritura crítica nueva debe evaluar locks.
10. No exponer secretos, tokens, credenciales ni datos privados.
11. Realizar cambios pequeños, documentados y fáciles de revertir.
12. Documentar todos los archivos modificados cuando se cambie comportamiento, reglas, cálculos o arquitectura.
13. Ejecutar las validaciones disponibles antes de dar una tarea por terminada:
    - `git diff --check`
    - `cp Code.gs /tmp/Code.gs.js && node --check /tmp/Code.gs.js`
    - `sed '1d;$d' JS.html > /tmp/dashboard-js.js && node --check /tmp/dashboard-js.js`
14. Informar claramente cualquier limitación que no se pueda comprobar localmente, especialmente estados reales de PR remoto, ejecución Apps Script, permisos, cuotas y datos reales de Google Sheets.
15. No desplegar, publicar ni hacer merge automáticamente sin autorización explícita del usuario.

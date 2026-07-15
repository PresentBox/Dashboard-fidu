# CALCULATIONS.md — Cálculos críticos

> Documento basado en el código actual. El backend es la autoridad final para guardar datos; el frontend replica cálculos para vista previa.

## 1. Periodo operativo

- **Archivo y función:** `Code.gs`, `getCurrentBillingPeriod_()`.
- **Fórmula:**
  - Obtener día del mes según `Session.getScriptTimeZone()`.
  - Si `día <= CONFIG.PERIOD_CUTOFF_DAY` (2), usar mes anterior.
  - Si `día >= 3`, usar mes actual.
  - Formato: `yyyy-MM`.
- **Entradas:** Fecha actual del script.
- **Salida:** Periodo operativo string.
- **Redondeo:** No aplica.
- **Vacíos:** No aplica.
- **Ejemplos comprobables por comportamiento:**
  - 2026-08-01 → `2026-07`.
  - 2026-08-02 → `2026-07`.
  - 2026-08-03 → `2026-08`.
- **Casos límite:** Cambio de enero a diciembre previo; `Date.setMonth()` maneja el año.
- **Relación frontend/backend:** Frontend solo muestra `periodoActual` retornado por backend.

## 2. Interpretación de esquema de comisión

- **Archivo y función:** `Code.gs`, `interpretarTextoComision(texto)`.
- **Fórmula:**
  - Si texto contiene `variable`, `porcentaje` o `%` → `Variable`.
  - Si contiene `fija`, `fijo` o `mensual` → `Fija`.
  - Si no, `Variable (Por Interpretar)`.
- **Entradas:** Texto de `control` columna J.
- **Salida:** Esquema de comisión.
- **Redondeo:** No aplica.
- **Vacíos:** Retorna `No Especificada`.
- **Casos límite:** Un texto con palabras mixtas puede clasificarse por primera condición encontrada.
- **Relación frontend/backend:** Frontend consume `esquemaComision` ya calculado.

## 3. Lectura de SMMLV

- **Archivo y función:** `Code.gs`, `getCommissionTypes_()`.
- **Fórmula:** `Number(B1) || Number(A2) || 0` desde `Tabla de comisiones`.
- **Entradas:** Celda B1 preferida; A2 como fallback.
- **Salida:** `smmlv` numérico en cada tipo de comisión.
- **Redondeo:** No aplica.
- **Vacíos:** Si ambos vacíos o no numéricos, `0`.
- **Casos límite:** Valores con formato moneda dependen de Apps Script/Sheets y conversión `Number`.
- **Relación frontend/backend:** Frontend usa `tipo.smmlv` retornado por backend.

## 4. Habilitación de campos de comisión

- **Archivo y función:** `Code.gs`, `isDisabledCommissionCell_(background)`.
- **Fórmula:** Una celda se considera deshabilitada si su color RGB es gris aproximado: diferencias RGB menores a 8 y rojo entre 120 y 210.
- **Entradas:** Color de fondo de columnas C:F en `Tabla de comisiones`.
- **Salida:** `enabled: false` para celdas grises.
- **Redondeo:** No aplica.
- **Vacíos:** Si color no es hex válido, campo queda habilitado.
- **Casos límite:** Grises fuera del rango no se detectan.
- **Relación frontend/backend:** Frontend oculta campos con `enabled=false`.

## 5. Modo de campo `cantidad`

- **Archivo y función:** `Code.gs`, `inferCommissionFieldMode_()`.
- **Fórmula:**
  - Si texto combinado contiene `%`, `porcentaje`, `ventas`, `rendimientos` o `recursos administrados` → `porcentaje`.
  - Si contiene `salario`, `smmlv` o `smlmv` → `salarios`.
  - Si no, `cantidad`.
- **Entradas:** Tipo, descripción y display del campo.
- **Salida:** Modo del campo.
- **Redondeo:** No aplica.
- **Vacíos:** Si no hay texto relevante, `cantidad`.
- **Casos límite:** La inferencia depende del texto exacto.
- **Relación frontend/backend:** Backend envía `modo`; frontend lo usa para preview.

## 6. Normalización de porcentaje

- **Archivos y funciones:** `Code.gs`, `normalizeRate_()`; `JS.html`, `normalizarPorcentaje()`.
- **Fórmula:**
  - Si valor vacío o 0 → 0.
  - Si valor `>= 1` → valor / 100.
  - Si valor `< 1` → valor tal cual.
- **Entradas:** Valor de campo en modo porcentaje.
- **Salida:** Tasa decimal.
- **Redondeo:** No aplica.
- **Vacíos:** Retorna 0.
- **Ejemplos comprobables:**
  - `1` → `0.01`.
  - `3` → `0.03`.
  - `0.03` → `0.03`.
- **Casos límite:** `0.65` en campo porcentual se interpreta como 65%, no 0.65%, porque es menor a 1 y queda tal cual.
- **Relación frontend/backend:** Ambos implementan la misma regla.

## 7. Cálculo de preliquidación — backend

- **Archivo y función:** `Code.gs`, `calcularPreliquidacion_(tipo, valores)`.
- **Entradas:** Tipo de comisión, campos habilitados, `saldoUvr`, `valorUvr`, `cantidad`, `iva`, `smmlv`.
- **Fórmula de subtotal según campos habilitados:**
  1. Si `saldoUvr` y `valorUvr` habilitados: `subtotal = saldoUvr × valorUvr`.
  2. Si `saldoUvr` y `cantidad` habilitados: `subtotal = saldoUvr × normalizeRate_(cantidad)`.
  3. Si `valorUvr` y `cantidad` habilitados: `subtotal = valorUvr × (cantidad normalizada si modo porcentaje, o cantidad/1 si no)`.
  4. Si solo `valorUvr` habilitado: `subtotal = valorUvr`.
  5. Si solo `cantidad` habilitada: `subtotal = cantidad × smmlv`.
  6. Si solo `saldoUvr` habilitado: `subtotal = saldoUvr`.
- **IVA:**
  - `ivaRate = parseNumber_(valores.iva)`.
  - Si no hay IVA, usa `0.19`.
  - Si IVA > 1, divide entre 100.
  - `ivaValor = subtotal × ivaRate`.
- **Resultado:** `{ subtotal, ivaValor, total, ivaRate }`.
- **Redondeo:** `Math.round()` para subtotal, IVA y total.
- **Vacíos:** `parseNumber_()` retorna 0; si IVA vacío, usa 19%.
- **Ejemplos comprobables:**
  - Valor base 52.500.000 y cantidad 3 en modo porcentaje: subtotal 1.575.000; IVA 299.250; total 1.874.250.
  - SMMLV 1.750.905 y cantidad 0,65 en modo salarios: subtotal 1.138.088; IVA 216.237; total 1.354.325, con redondeo Math.round.
- **Casos límite:** Si ningún campo relevante está habilitado, subtotal queda 0.
- **Relación frontend/backend:** Frontend muestra preview, backend recalcula al guardar.

## 8. Cálculo de preliquidación — frontend

- **Archivo y función:** `JS.html`, `calcularPreviewPreliqDesglosado(tipo, valores)`.
- **Fórmula:** Replica el orden del backend para subtotal y usa IVA fijo visual 19%.
- **Entradas:** Tipo y valores del formulario.
- **Resultado:** `{ subtotal, iva, total }`.
- **Redondeo:** `Math.round()` para subtotal, IVA y total.
- **Vacíos:** `leerValoresPreliq()` convierte vacíos a 0 y fija `iva=19`.
- **Ejemplos comprobables:** Mismos ejemplos del backend si el IVA final es 19%.
- **Casos límite:** Si en la tabla backend se configura IVA distinto al 19%, el preview puede diferir, porque el frontend fija 19%.
- **Relación frontend/backend:** Backend manda resultado definitivo al guardar.

## 9. Consolidación de múltiples preliquidaciones

- **Archivo y función:** `Code.gs`, `registrarPreliquidacionesContrato(paquetes)`.
- **Fórmula:**
  - Registrar cada paquete con `registrarPreliquidacionContrato()`.
  - `subtotal = suma(resultados.subtotal)`.
  - `iva = suma(resultados.iva)`.
  - `total = suma(resultados.total)`.
- **Entradas:** Array de paquetes `{radicacion, tipoComision, valores}`.
- **Resultado:** Objeto con cantidad, subtotal, IVA, total, resultados y mensaje.
- **Redondeo:** Cada línea ya viene redondeada desde backend.
- **Vacíos:** Si array vacío, lanza error.
- **Casos límite:** No deduplica tipos repetidos.
- **Relación frontend/backend:** Frontend también suma para vista previa temporal.

## 10. Métricas de gestión

- **Archivo y función backend:** `Code.gs`, `buildCrmResponse_()`.
- **Archivo y función frontend:** `JS.html`, `actualizarMetricasVista()`.
- **Fórmula general:** Conteos por contratos incluidos/visibles:
  - Activos: estado normalizado `activo`.
  - Inactivos: estado normalizado `inactivo`.
  - En liquidación: estado normalizado `en liquidacion`.
  - Variables: `esquemaComision === 'Variable'`.
  - Fijos: `esquemaComision === 'Fija'`.
  - Total Fijos + Variables: suma de registros con esquema `Variable` o `Fija`.
  - Discrepancias: `validacionSFC !== 'OK'`.
  - Pendientes periodo actual:
    - BTM: variables activos sin preliquidación ni cierre del periodo.
    - Facturación: preliquidaciones del periodo pendientes de `FACTURADA`.
- **Redondeo:** No aplica.
- **Vacíos:** Conteo inicial 0.
- **Casos límite:** Frontend recalcula según filtro visible.
- **Relación frontend/backend:** Backend entrega métricas iniciales; frontend recalcula por vista/filtro.

## 11. Validación SFC de cambios de estado

- **Archivo y función:** `Code.gs`, `validateSfcDiscrepancyRule_()`.
- **Regla:** Si SFC no existe, no bloquea. Si nuevo estado es `Activo`, exige que SFC también sea `activo`; si no, bloquea.
- **Entradas:** Radicación, nuevo estado, estado control, estado SFC.
- **Resultado:** Permite o lanza error.
- **Redondeo:** No aplica.
- **Vacíos:** SFC vacío/no encontrado no bloquea.
- **Casos límite:** Cambios a Inactivo/En Liquidación se permiten incluso si SFC activo.

## 12. Fechas de alertas

- **Archivo y funciones:** `Code.gs`, `getLiquidationAlertsForFirstDay_()`, `addBusinessDays_()`.
- **Fórmula:**
  - Día 1 calendario: cierre.
  - 1, 2 y 3 días hábiles antes del día 1 usando `addBusinessDays_()`.
  - `addBusinessDays_()` excluye sábados y domingos.
- **Entradas:** Fecha objetivo del día 1.
- **Resultado:** Objetos de alerta con tipo, asunto, título y mensajes.
- **Redondeo:** No aplica.
- **Vacíos:** No aplica.
- **Casos límite:** Festivos no se consideran.

## 13. Parseo numérico

- **Archivo y función:** `Code.gs`, `parseNumber_(value)`.
- **Fórmula:**
  - Si ya es number, retorna el valor.
  - Convierte string quitando `$`, puntos, cambiando coma por punto y quitando `%`.
  - `Number(text) || 0`.
- **Entradas:** Número o string.
- **Resultado:** Número.
- **Redondeo:** No aplica.
- **Vacíos:** 0.
- **Casos límite:** Formatos mixtos pueden interpretarse de forma inesperada si no siguen patrón esperado.

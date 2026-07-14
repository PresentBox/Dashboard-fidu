// ============================================================================
// CONFIGURACIÓN CENTRALIZADA
// ============================================================================
const CONFIG = {
  APP_TITLE: 'Fidu Gestión - CRM Lotes',
  SHEETS: {
    CONTROL: 'control',
    BTM: 'CONT/BTM',
    SFC: 'INV SFC',
    USUARIOS: 'usuarios',
    FACTURACION: 'facturacion',
    LIQUIDACIONES: 'liquidaciones'
  },
  // Fallback de emergencia para no perder acceso si la hoja `usuarios` aún no existe.
  BOOTSTRAP_SUPER_ADMINS: [
    'davidorlando.diaz@bbva.com',
    'edith.herrera@bbva.com',
    'sebastian.cuervo.rojas@bbva.com'
  ],
  CONTROL_COLS: {
    RADICACION: 0,
    CODIGO_FIDUSAP: 1,
    FECHA_CONSTITUCION: 4,
    FECHA_VIGENCIA: 5,
    NOMBRE_NEGOCIO: 6,
    ESTADO: 7,
    COMISION: 9,
    TIPO: 11
  },
  BTM_COLS: {
    RADICACION: 0,
    NOMBRE: 1,
    PROFESIONAL_CONTABLE: 6,
    GERENTE: 22,
    PROFESIONAL_BTM: 23
  },
  SFC_COLS: {
    RADICACION: 0,
    ESTADO: 14
  },
  ESTADOS_PERMITIDOS: ['Activo', 'Inactivo', 'En Liquidación'],
  SIN_ASIGNAR_EMAIL: 'sin_asignar@bbva.com',
  CURRENT_PERIOD_FORMAT: 'yyyy-MM',
  DASHBOARD_URL: 'https://script.google.com/a/macros/bbva.com/s/AKfycbyFsbZtNVXLaKN6Rba2uTPj9k4-1iBiqzlkleUwLQs1ytgS2nETaz_teUz9yQllh6Ey_A/exec'
};

const ROLES = {
  SUPER_ADMIN: 'Súper Admin',
  CONTADOR: 'Contador',
  GERENTE_BTM: 'Gerente BTM',
  PROFESIONAL_BTM: 'Profesional Especializado BTM',
  FACTURACION: 'Facturación'
};

/**
 * Carga el archivo Index como plantilla para inyecciones modulares puras.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Renderiza sub-archivos HTML separados, como CSS y JS.
 * @param {string} filename Nombre del archivo a incluir.
 * @return {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Motor CRM: compila contratos visibles, roles y métricas desde las hojas fuente.
 * @return {Object}
 */
function obtenerEcosistemaLiquidaciones() {
  var correoUsuario = getCurrentUserEmail_();
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getRequiredSheets_(libro);
  var perfilesAdicionales = getAdditionalProfiles_(libro, correoUsuario);
  var esSuperAdmin = isSuperAdmin_(correoUsuario, perfilesAdicionales);
  var esFacturacion = perfilesAdicionales.indexOf(ROLES.FACTURACION) !== -1;

  var lastRows = {
    btm: sheets.btm.getLastRow(),
    sfc: sheets.sfc.getLastRow(),
    control: sheets.control.getLastRow()
  };

  if (lastRows.btm <= 1 || lastRows.control <= 1) {
    return buildEmptyResponse_(correoUsuario, esSuperAdmin, esFacturacion, perfilesAdicionales);
  }

  var datosBTM = sheets.btm.getRange(1, 1, lastRows.btm, 24).getValues();
  var datosSFC = lastRows.sfc > 1 ? sheets.sfc.getRange(1, 1, lastRows.sfc, 15).getValues() : [];
  var datosControl = sheets.control.getRange(1, 1, lastRows.control, 12).getValues();

  var mapaEstadosSFC = buildSfcStatusMap_(datosSFC);
  var mapaAsignacionesBTM = buildBtmAssignmentsMap_(datosBTM);

  var facturadosPeriodoActual = buildCurrentPeriodBillingMap_(libro);
  var liquidacionesPeriodoActual = buildCurrentPeriodLiquidationMap_(libro);

  return buildCrmResponse_(correoUsuario, esSuperAdmin, esFacturacion, perfilesAdicionales, datosControl, mapaAsignacionesBTM, mapaEstadosSFC, facturadosPeriodoActual, liquidacionesPeriodoActual);
}

/**
 * Guarda cambios de estado por lote y envía correos consolidados a contadores.
 * @param {Object} paqueteCambios Objeto { radicacion: nuevoEstado }.
 * @return {string}
 */
function guardarAjustesEnLote(paqueteCambios) {
  var cambiosNormalizados = normalizeChangePackage_(paqueteCambios);
  var radicaciones = Object.keys(cambiosNormalizados);

  if (radicaciones.length === 0) {
    return 'No hay cambios válidos para guardar.';
  }

  var correoUsuario = getCurrentUserEmail_();
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getRequiredSheets_(libro);
  var datosControl = sheets.control.getDataRange().getValues();
  var datosBTM = sheets.btm.getDataRange().getValues();
  var datosSFC = sheets.sfc.getDataRange().getValues();
  var asignaciones = buildBtmAssignmentsMap_(datosBTM);
  var perfilesAdicionales = getAdditionalProfiles_(libro, correoUsuario);
  var usuarioEsAdmin = isSuperAdmin_(correoUsuario, perfilesAdicionales);

  var estadosSFC = buildSfcStatusMap_(datosSFC);
  validateUserCanEditChanges_(correoUsuario, usuarioEsAdmin, cambiosNormalizados, asignaciones, datosControl, estadosSFC);

  var rowsActualizadas = updateControlStatuses_(sheets.control, datosControl, cambiosNormalizados);
  var destinatariosFacturacion = getEmailsByProfile_(libro, ROLES.FACTURACION);
  var conteoCorreosSent = sendBillingTeamStatusNotifications_(correoUsuario, cambiosNormalizados, asignaciones, destinatariosFacturacion);

  return '💾 ¡Éxito! Se actualizaron ' + rowsActualizadas + ' estados en control. Se enviaron ' + conteoCorreosSent + ' correos consolidados al equipo de Facturación.';
}

/**
 * Registra una liquidación variable. Punto preparado para conectar con una hoja/auditoría.
 * @param {string} radicacion
 * @param {string} accion
 * @param {number|string} valorVariable
 * @param {string} rolEjecutor
 * @return {string}
 */
function ejecutarAccionServidor(radicacion, accion, valorVariable, rolEjecutor) {
  var monto = Number(valorVariable);
  if (!radicacion || accion !== 'LIQUIDAR' || !monto || monto <= 0) {
    throw new Error('Solicitud de liquidación inválida. Verifica radicación, acción y monto.');
  }

  return '🚀 Base variable de $' + monto.toLocaleString('es-CO') + ' registrada para la radicación ' + radicacion + '.';
}

function getCurrentUserEmail_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase().trim();
}

function isSuperAdmin_(email, perfilesAdicionales) {
  var perfiles = perfilesAdicionales || [];
  return perfiles.indexOf(ROLES.SUPER_ADMIN) !== -1 || CONFIG.BOOTSTRAP_SUPER_ADMINS.indexOf(email) !== -1;
}

function getRequiredSheets_(book) {
  var sheets = {
    btm: book.getSheetByName(CONFIG.SHEETS.BTM),
    sfc: book.getSheetByName(CONFIG.SHEETS.SFC),
    control: book.getSheetByName(CONFIG.SHEETS.CONTROL)
  };

  if (!sheets.btm || !sheets.sfc || !sheets.control) {
    throw new Error("Error: Verifica que existan las pestañas 'CONT/BTM', 'INV SFC' y 'control'.");
  }

  return sheets;
}

function buildEmptyResponse_(correoUsuario, esSuperAdmin, esFacturacion, perfilesAdicionales) {
  return {
    usuario: correoUsuario,
    esAdmin: esSuperAdmin,
    esFacturacion: esFacturacion,
    rolesDisponibles: buildRolesList_(esSuperAdmin, perfilesAdicionales, []),
    listaContratos: [],
    metricas: { totalActivos: 0, totalVariables: 0, discrepancias: 0, pendientesFacturacionPeriodo: 0 },
    periodoActual: getCurrentBillingPeriod_()
  };
}

function buildSfcStatusMap_(datosSFC) {
  var mapaEstadosSFC = {};

  for (var row = 1; row < datosSFC.length; row++) {
    var radicacion = normalizeKey_(datosSFC[row][CONFIG.SFC_COLS.RADICACION]);
    if (!radicacion || isHeaderLike_(radicacion)) continue;

    mapaEstadosSFC[radicacion] = toCleanString_(datosSFC[row][CONFIG.SFC_COLS.ESTADO]) || 'No Registrado';
  }

  return mapaEstadosSFC;
}

function buildBtmAssignmentsMap_(datosBTM) {
  var mapaAsignacionesBTM = {};

  for (var row = 1; row < datosBTM.length; row++) {
    var radicacion = normalizeKey_(datosBTM[row][CONFIG.BTM_COLS.RADICACION]);
    if (!radicacion || isHeaderLike_(radicacion)) continue;

    mapaAsignacionesBTM[radicacion] = {
      nombreBTM: toCleanString_(datosBTM[row][CONFIG.BTM_COLS.NOMBRE]) || 'Sin Nombre Especificado',
      profesionalContable: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.PROFESIONAL_CONTABLE]),
      gerente: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.GERENTE]),
      profesionalBtm: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.PROFESIONAL_BTM])
    };
  }

  return mapaAsignacionesBTM;
}

function buildCrmResponse_(correoUsuario, esSuperAdmin, esFacturacion, perfilesAdicionales, datosControl, mapaAsignacionesBTM, mapaEstadosSFC, facturadosPeriodoActual, liquidacionesPeriodoActual) {
  var contratosProcesados = [];
  var rolesDetectados = new Set();
  var metricas = { totalActivos: 0, totalVariables: 0, discrepancias: 0, pendientesFacturacionPeriodo: 0 };

  if (esSuperAdmin) rolesDetectados.add(ROLES.SUPER_ADMIN);

  for (var row = 1; row < datosControl.length; row++) {
    var radicacionOriginal = datosControl[row][CONFIG.CONTROL_COLS.RADICACION];
    var radicacionKey = normalizeKey_(radicacionOriginal);
    if (!radicacionKey || isHeaderLike_(radicacionKey)) continue;

    var asignados = mapaAsignacionesBTM[radicacionKey] || buildEmptyAssignment_();
    var rolesEnFila = getUserRolesForAssignment_(correoUsuario, asignados);
    rolesEnFila.forEach(function(role) { rolesDetectados.add(role); });

    var estadoControl = toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.ESTADO]) || 'Activo';
    var estadoRealSFC = mapaEstadosSFC[radicacionKey] || 'No Encontrado';
    var estadoValidacion = getValidationStatus_(estadoControl, estadoRealSFC, metricas);
    var esquema = interpretarTextoComision(datosControl[row][CONFIG.CONTROL_COLS.COMISION]);

    var estaActivo = estadoControl.toLowerCase() === 'activo';
    var facturadoPeriodoActual = Boolean(facturadosPeriodoActual[radicacionKey]);
    var liquidacionCerradaPeriodoActual = Boolean(liquidacionesPeriodoActual[radicacionKey]);
    if (esFacturacion && estaActivo && !facturadoPeriodoActual) metricas.pendientesFacturacionPeriodo++;

    if (rolesEnFila.length > 0 || esSuperAdmin || esFacturacion) {
      var incluirEnMetricas = esSuperAdmin || rolesEnFila.length > 0 || (esFacturacion && estaActivo && !facturadoPeriodoActual);
      if (incluirEnMetricas) {
        if (estaActivo) metricas.totalActivos++;
        if (esquema === 'Variable') metricas.totalVariables++;
        if (estadoValidacion !== 'OK') metricas.discrepancias++;
      }

      contratosProcesados.push({
        radicacion: toCleanString_(radicacionOriginal),
        codigoFidusap: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.CODIGO_FIDUSAP]) || 'Sin código FIDUSAP',
        nombreNegocio: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.NOMBRE_NEGOCIO]) || asignados.nombreBTM,
        nombreNegocioControl: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.NOMBRE_NEGOCIO]) || 'Sin Nombre en Control',
        nitNombreControl: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.NOMBRE_NEGOCIO]) || 'Sin Nombre en Control',
        fechaConstitucion: formatSheetDate_(datosControl[row][CONFIG.CONTROL_COLS.FECHA_CONSTITUCION]),
        fechaVigencia: formatSheetDate_(datosControl[row][CONFIG.CONTROL_COLS.FECHA_VIGENCIA]),
        tipoGeneral: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.TIPO]) || 'No Definido',
        textoComisionOriginal: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.COMISION]) || 'No Especificado',
        esquemaComision: esquema,
        validacionSFC: estadoValidacion,
        estadoActual: estadoControl,
        facturadoPeriodoActual: facturadoPeriodoActual,
        liquidacionCerradaPeriodoActual: liquidacionCerradaPeriodoActual,
        asignados: {
          ProfesionalContable: asignados.profesionalContable,
          Contador: asignados.profesionalContable,
          GerenteBTM: asignados.gerente,
          ProfesionalBTM: asignados.profesionalBtm,
          ProfesionalSujeto: asignados.profesionalBtm
        }
      });
    }
  }

  return {
    usuario: correoUsuario,
    esAdmin: esSuperAdmin,
    esFacturacion: esFacturacion,
    rolesDisponibles: buildRolesList_(esSuperAdmin, perfilesAdicionales, Array.from(rolesDetectados)),
    listaContratos: contratosProcesados,
    metricas: metricas,
    periodoActual: getCurrentBillingPeriod_()
  };
}

function getUserRolesForAssignment_(correoUsuario, asignados) {
  var roles = [];
  if (correoUsuario === asignados.profesionalContable) roles.push(ROLES.CONTADOR);
  if (correoUsuario === asignados.gerente) roles.push(ROLES.GERENTE_BTM);
  if (correoUsuario === asignados.profesionalBtm) roles.push(ROLES.PROFESIONAL_BTM);
  return roles;
}

function buildEmptyAssignment_() {
  return { nombreBTM: 'No Encontrado', profesionalContable: '', gerente: '', profesionalBtm: '' };
}

function getValidationStatus_(estadoControl, estadoRealSFC) {
  if (estadoControl.toLowerCase() === estadoRealSFC.toLowerCase()) return 'OK';
  return 'Discrepancia SFC: ' + estadoRealSFC;
}

function normalizeChangePackage_(paqueteCambios) {
  var normalized = {};
  if (!paqueteCambios || typeof paqueteCambios !== 'object') return normalized;

  Object.keys(paqueteCambios).forEach(function(radicacion) {
    var cleanRadicacion = toCleanString_(radicacion);
    var estado = toCleanString_(paqueteCambios[radicacion]);
    if (!cleanRadicacion || CONFIG.ESTADOS_PERMITIDOS.indexOf(estado) === -1) return;
    normalized[cleanRadicacion] = estado;
  });

  return normalized;
}

function validateUserCanEditChanges_(correoUsuario, esSuperAdmin, cambios, asignaciones, datosControl, estadosSFC) {
  var estadosControl = buildControlStatusMap_(datosControl);

  Object.keys(cambios).forEach(function(radicacion) {
    var radKey = normalizeKey_(radicacion);
    var asignacion = asignaciones[radKey] || buildEmptyAssignment_();
    var puedeEditar = esSuperAdmin || correoUsuario === asignacion.gerente || correoUsuario === asignacion.profesionalBtm;
    if (!puedeEditar) {
      throw new Error('No tienes permiso para modificar la radicación ' + radicacion + '.');
    }

    validateSfcDiscrepancyRule_(radicacion, cambios[radicacion], estadosControl[radKey], estadosSFC[radKey]);
  });
}

function updateControlStatuses_(hojaControl, datosControl, cambios) {
  var updates = [];
  var cambiosPorKey = {};

  Object.keys(cambios).forEach(function(radicacion) {
    cambiosPorKey[normalizeKey_(radicacion)] = cambios[radicacion];
  });

  for (var row = 1; row < datosControl.length; row++) {
    var radicacionKey = normalizeKey_(datosControl[row][CONFIG.CONTROL_COLS.RADICACION]);
    if (cambiosPorKey[radicacionKey]) {
      updates.push({ row: row + 1, estado: cambiosPorKey[radicacionKey] });
    }
  }

  updates.forEach(function(update) {
    hojaControl.getRange(update.row, CONFIG.CONTROL_COLS.ESTADO + 1).setValue(update.estado);
  });

  return updates.length;
}

function groupChangesByAccountant_(cambios, asignaciones) {
  var gruposPorContador = {};

  Object.keys(cambios).forEach(function(radicacion) {
    var asignacion = asignaciones[normalizeKey_(radicacion)] || buildEmptyAssignment_();
    var emailContador = asignacion.contador || CONFIG.SIN_ASIGNAR_EMAIL;

    if (!gruposPorContador[emailContador]) gruposPorContador[emailContador] = [];
    gruposPorContador[emailContador].push({
      radicacion: radicacion,
      nombre: asignacion.nombreBTM || 'Expediente',
      estado: cambios[radicacion]
    });
  });

  return gruposPorContador;
}

function sendGroupedNotifications_(ejecutor, gruposPorContador) {
  var conteoCorreosSent = 0;

  Object.keys(gruposPorContador).forEach(function(contadorDestino) {
    if (contadorDestino.indexOf('@') === -1 || contadorDestino === CONFIG.SIN_ASIGNAR_EMAIL) return;

    var asunto = '⚠️ Resumen de Cambios Operativos Lote BTM - Solicitud de Facturación';
    var cuerpo = buildNotificationBody_(ejecutor, gruposPorContador[contadorDestino]);
    MailApp.sendEmail(contadorDestino, asunto, cuerpo);
    conteoCorreosSent++;
  });

  return conteoCorreosSent;
}

function buildNotificationBody_(ejecutor, items) {
  var cuerpo = 'Estimado(a) Facturador(a),\n\n' +
    'Le informamos que el usuario BTM (' + ejecutor + ') procesó y guardó un lote con modificaciones de estado desde el CRM Corporativo.\n\n' +
    'Consolidado completo de cambios para su gestión:\n' +
    '=========================================================================\n';

  items.forEach(function(item) {
    cuerpo += '• No. Radicación: ' + item.radicacion + '\n' +
      '  Negocio: ' + item.nombre + '\n' +
      '  Nuevo Estado Transaccionado: [' + item.estado + ']\n' +
      '-------------------------------------------------------------------------\n';
  });

  cuerpo += '\nPor favor, ingrese al portal para visar estas aprobaciones consolidadas.\n\n' +
    'Atentamente,\nFidu Gestión - Sistema de Alertas por Lotes BBVA.';

  return cuerpo;
}


function getAdditionalProfiles_(book, email) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.USUARIOS);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var values = sheet.getDataRange().getValues();
  var profiles = [];
  for (var row = 1; row < values.length; row++) {
    var rowEmail = normalizeEmail_(values[row][0]);
    var profile = toCleanString_(values[row][1]);
    var active = toCleanString_(values[row][2]).toLowerCase();
    if (rowEmail === email && profile && active !== 'no' && active !== 'inactivo' && active !== 'false') {
      profiles.push(normalizeProfileName_(profile));
    }
  }
  return profiles;
}

function getEmailsByProfile_(book, profileName) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.USUARIOS);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var values = sheet.getDataRange().getValues();
  var emails = [];
  for (var row = 1; row < values.length; row++) {
    var email = normalizeEmail_(values[row][0]);
    var profile = toCleanString_(values[row][1]);
    var active = toCleanString_(values[row][2]).toLowerCase();
    if (email && normalizeProfileName_(profile) === normalizeProfileName_(profileName) && active !== 'no' && active !== 'inactivo' && active !== 'false') {
      emails.push(email);
    }
  }
  return emails;
}

function buildRolesList_(esSuperAdmin, perfilesAdicionales, rolesDetectados) {
  var roleMap = {};
  rolesDetectados.forEach(function(role) { roleMap[role] = true; });
  perfilesAdicionales.forEach(function(role) { roleMap[role] = true; });
  if (esSuperAdmin) roleMap[ROLES.SUPER_ADMIN] = true;
  return Object.keys(roleMap);
}

function getCurrentBillingPeriod_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), CONFIG.CURRENT_PERIOD_FORMAT);
}

function buildCurrentPeriodBillingMap_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.FACTURACION);
  var map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;

  var currentPeriod = getCurrentBillingPeriod_();
  var values = sheet.getDataRange().getValues();
  for (var row = 1; row < values.length; row++) {
    var period = toCleanString_(values[row][1]);
    var radicacion = normalizeKey_(values[row][2]);
    if (period === currentPeriod && radicacion) map[radicacion] = true;
  }
  return map;
}


function buildCurrentPeriodLiquidationMap_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.LIQUIDACIONES);
  var map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;

  var currentPeriod = getCurrentBillingPeriod_();
  var values = sheet.getDataRange().getValues();
  for (var row = 1; row < values.length; row++) {
    var period = toCleanString_(values[row][1]);
    var radicacion = normalizeKey_(values[row][2]);
    if (period === currentPeriod && radicacion) map[radicacion] = true;
  }
  return map;
}

function registrarCierreLiquidacionMensual(radicaciones) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var email = getCurrentUserEmail_();
  if (!Array.isArray(radicaciones)) radicaciones = [radicaciones];
  if (radicaciones.length === 0) throw new Error('Selecciona al menos un contrato para cerrar liquidación.');

  var sheets = getRequiredSheets_(book);
  var datosControl = sheets.control.getDataRange().getValues();
  var datosBTM = sheets.btm.getDataRange().getValues();
  var asignaciones = buildBtmAssignmentsMap_(datosBTM);
  var perfiles = getAdditionalProfiles_(book, email);
  var esAdmin = isSuperAdmin_(email, perfiles);
  var liquidacionesPeriodo = buildCurrentPeriodLiquidationMap_(book);
  var sheetLiquidaciones = getOrCreateLiquidationSheet_(book);
  var period = getCurrentBillingPeriod_();
  var now = new Date();
  var rows = [];
  var controlPorRadicacion = buildControlRowsMap_(datosControl);

  radicaciones.forEach(function(radicacion) {
    var clean = toCleanString_(radicacion);
    var key = normalizeKey_(clean);
    if (!clean || liquidacionesPeriodo[key]) return;

    var row = controlPorRadicacion[key];
    if (!row) throw new Error('No se encontró la radicación ' + clean + ' en control.');

    var esquema = interpretarTextoComision(row[CONFIG.CONTROL_COLS.COMISION]);
    if (esquema !== 'Variable') throw new Error('La radicación ' + clean + ' no es de esquema variable.');

    var asignacion = asignaciones[key] || buildEmptyAssignment_();
    var puedeCerrar = esAdmin || email === asignacion.gerente || email === asignacion.profesionalBtm;
    if (!puedeCerrar) throw new Error('No tienes permiso para cerrar liquidación de la radicación ' + clean + '.');

    rows.push([now, period, clean, email, 'Liquidación cerrada', esquema]);
  });

  if (rows.length > 0) {
    sheetLiquidaciones.getRange(sheetLiquidaciones.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  return '✅ Se cerró la liquidación mensual de ' + rows.length + ' contrato(s) para el periodo ' + period + '.';
}

function getOrCreateLiquidationSheet_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.LIQUIDACIONES);
  if (!sheet) {
    sheet = book.insertSheet(CONFIG.SHEETS.LIQUIDACIONES);
    sheet.getRange(1, 1, 1, 6).setValues([['fecha_registro', 'periodo', 'radicacion', 'usuario', 'estado_liquidacion', 'esquema']]);
  }
  return sheet;
}

function buildControlRowsMap_(datosControl) {
  var map = {};
  for (var row = 1; row < datosControl.length; row++) {
    var radicacion = normalizeKey_(datosControl[row][CONFIG.CONTROL_COLS.RADICACION]);
    if (!radicacion || isHeaderLike_(radicacion)) continue;
    map[radicacion] = datosControl[row];
  }
  return map;
}

function registrarFacturacionPeriodo(radicaciones) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var email = getCurrentUserEmail_();
  var perfiles = getAdditionalProfiles_(book, email);
  if (!isSuperAdmin_(email, perfiles) && perfiles.indexOf(ROLES.FACTURACION) === -1) {
    throw new Error('Solo el perfil Facturación puede registrar periodos facturados.');
  }

  if (!Array.isArray(radicaciones) || radicaciones.length === 0) {
    throw new Error('Selecciona al menos un negocio para marcar como facturado.');
  }

  var sheets = getRequiredSheets_(book);
  var datosControl = sheets.control.getDataRange().getValues();
  var estadosControl = buildControlStatusMap_(datosControl);
  var facturadosPeriodo = buildCurrentPeriodBillingMap_(book);
  var sheetFacturacion = getOrCreateBillingSheet_(book);
  var period = getCurrentBillingPeriod_();
  var now = new Date();
  var rows = [];

  radicaciones.forEach(function(radicacion) {
    var clean = toCleanString_(radicacion);
    var key = normalizeKey_(clean);
    if (!clean || facturadosPeriodo[key]) return;
    if ((estadosControl[key] || '').toLowerCase() !== 'activo') {
      throw new Error('La radicación ' + clean + ' no está activa y no puede marcarse como facturada.');
    }
    rows.push([now, period, clean, email, 'Facturado']);
  });

  if (rows.length > 0) {
    sheetFacturacion.getRange(sheetFacturacion.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  return '✅ Se registraron ' + rows.length + ' negocios como facturados para el periodo ' + period + '.';
}

function getOrCreateBillingSheet_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.FACTURACION);
  if (!sheet) {
    sheet = book.insertSheet(CONFIG.SHEETS.FACTURACION);
    sheet.getRange(1, 1, 1, 5).setValues([['fecha_registro', 'periodo', 'radicacion', 'usuario', 'estado_facturacion']]);
  }
  return sheet;
}

function buildControlStatusMap_(datosControl) {
  var map = {};
  for (var row = 1; row < datosControl.length; row++) {
    var radicacion = normalizeKey_(datosControl[row][CONFIG.CONTROL_COLS.RADICACION]);
    if (!radicacion || isHeaderLike_(radicacion)) continue;
    map[radicacion] = toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.ESTADO]) || 'Activo';
  }
  return map;
}

function validateSfcDiscrepancyRule_(radicacion, nuevoEstado, estadoControlActual, estadoSFC) {
  if (!estadoSFC || estadoSFC === 'No Encontrado') return;
  if (normalizaEstadoNegocio_(estadoControlActual) === normalizaEstadoNegocio_(estadoSFC)) return;

  var sfcNormalizado = normalizaEstadoNegocio_(estadoSFC);
  var nuevoNormalizado = normalizaEstadoNegocio_(nuevoEstado);
  var corrigeContraSFC = nuevoNormalizado === sfcNormalizado;
  var bajaOperativaPermitida = sfcNormalizado === 'activo' && (nuevoNormalizado === 'inactivo' || nuevoNormalizado === 'en liquidacion');

  if (!corrigeContraSFC && !bajaOperativaPermitida) {
    throw new Error('La radicación ' + radicacion + ' tiene discrepancia con INV SFC (' + estadoSFC + '). Ajusta el estado antes de facturar o guardar cambios no permitidos.');
  }
}

function sendBillingTeamStatusNotifications_(ejecutor, cambios, asignaciones, destinatariosFacturacion) {
  if (!destinatariosFacturacion || destinatariosFacturacion.length === 0) return 0;

  var items = Object.keys(cambios).map(function(radicacion) {
    var asignacion = asignaciones[normalizeKey_(radicacion)] || buildEmptyAssignment_();
    return {
      radicacion: radicacion,
      nombre: asignacion.nombreBTM || 'Expediente',
      estado: cambios[radicacion]
    };
  });

  var asunto = '⚠️ Cambios de estado listos para validación de Facturación';
  var cuerpo = buildNotificationBody_(ejecutor, items);
  var html = buildNotificationHtml_(ejecutor, items);
  destinatariosFacturacion.forEach(function(email) {
    MailApp.sendEmail({
      to: email,
      subject: asunto,
      body: cuerpo,
      htmlBody: html
    });
  });
  return destinatariosFacturacion.length;
}


function buildNotificationHtml_(ejecutor, items) {
  var rows = items.map(function(item) {
    return '<tr>' +
      '<td style="padding:14px 16px;border-bottom:1px solid #edf0f4;font-weight:700;color:#001391;">' + escapeHtml_(item.radicacion) + '</td>' +
      '<td style="padding:14px 16px;border-bottom:1px solid #edf0f4;color:#020b5f;">' + escapeHtml_(item.nombre) + '</td>' +
      '<td style="padding:14px 16px;border-bottom:1px solid #edf0f4;"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e7f4ff;color:#001391;font-weight:700;">' + escapeHtml_(item.estado) + '</span></td>' +
    '</tr>';
  }).join('');

  return '<div style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#020b5f;">' +
    '<div style="max-width:760px;margin:0 auto;padding:28px;">' +
      '<div style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 45px rgba(4,17,90,0.08);">' +
        '<div style="background:#001391;color:#ffffff;padding:28px 32px;">' +
          '<div style="font-size:42px;line-height:1;font-weight:800;margin-bottom:18px;">Λ</div>' +
          '<h1 style="margin:0;font-size:24px;line-height:1.25;">Cambios de estado listos para validación de Facturación</h1>' +
          '<p style="margin:12px 0 0;color:#d8ecff;font-size:14px;">Fidu Gestión · Sistema de alertas por lotes BBVA</p>' +
        '</div>' +
        '<div style="padding:28px 32px;">' +
          '<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hola equipo de <strong>Facturación</strong>,</p>' +
          '<p style="margin:0 0 22px;font-size:15px;line-height:1.55;">El usuario BTM <strong>' + escapeHtml_(ejecutor) + '</strong> guardó un lote con modificaciones de estado desde el CRM Corporativo. Por favor valida las comisiones antes de continuar con la facturación.</p>' +
          '<div style="background:#d8ecff;border-radius:16px;padding:16px 18px;margin-bottom:22px;color:#020b5f;">' +
            '<strong>Resumen:</strong> ' + items.length + ' negocio(s) requieren revisión de Facturación.' +
          '</div>' +
          '<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #edf0f4;border-radius:14px;overflow:hidden;">' +
            '<thead><tr style="background:#f7f8fa;text-align:left;">' +
              '<th style="padding:12px 16px;color:#5d668a;font-size:12px;text-transform:uppercase;">Radicación</th>' +
              '<th style="padding:12px 16px;color:#5d668a;font-size:12px;text-transform:uppercase;">Negocio</th>' +
              '<th style="padding:12px 16px;color:#5d668a;font-size:12px;text-transform:uppercase;">Nuevo estado</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
          '<p style="margin:24px 0 0;font-size:14px;line-height:1.55;color:#5d668a;">Ingresa al portal para revisar los negocios activos, validar comisiones y marcar el periodo como facturado cuando corresponda.</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function escapeHtml_(value) {
  return toCleanString_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/**
 * Envía alertas mensuales de liquidación BTM según calendario:
 * - 3, 2 y 1 días hábiles antes del día 1.
 * - Día 2 calendario como cierre de novedades.
 * Ejecutar diariamente mediante trigger instalable.
 * @return {string}
 */
function enviarAlertasLiquidacionBTM() {
  var alerta = getLiquidationAlertForDate_(new Date());
  if (!alerta) return 'Hoy no aplica alerta de liquidación BTM.';

  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getRequiredSheets_(libro);
  var datosControl = sheets.control.getDataRange().getValues();
  var datosBTM = sheets.btm.getDataRange().getValues();
  var asignaciones = buildBtmAssignmentsMap_(datosBTM);
  var liquidacionesPeriodoActual = buildCurrentPeriodLiquidationMap_(libro);
  var grupos = buildLiquidationReminderGroups_(datosControl, asignaciones, liquidacionesPeriodoActual);
  var emails = Object.keys(grupos);

  emails.forEach(function(email) {
    var body = buildLiquidationReminderBody_(alerta, grupos[email]);
    var html = buildLiquidationReminderHtml_(alerta, grupos[email]);
    MailApp.sendEmail({
      to: email,
      subject: alerta.subject,
      body: body,
      htmlBody: html
    });
  });

  return 'Se enviaron ' + emails.length + ' alertas de liquidación BTM.';
}

/**
 * Crea un trigger diario para enviar alertas de liquidación.
 * Ejecutar una sola vez desde Apps Script para instalarlo y autorizar permisos.
 * @return {string}
 */
function crearTriggerAlertasLiquidacion() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'enviarAlertasLiquidacionBTM') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('enviarAlertasLiquidacionBTM')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  return 'Trigger diario de alertas de liquidación creado para las 8:00 a.m. según zona horaria del script.';
}

function buildLiquidationReminderGroups_(datosControl, asignaciones, liquidacionesPeriodoActual) {
  var grupos = {};

  for (var row = 1; row < datosControl.length; row++) {
    var radicacion = toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.RADICACION]);
    var radKey = normalizeKey_(radicacion);
    if (!radKey || isHeaderLike_(radKey)) continue;

    var estado = toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.ESTADO]) || 'Activo';
    if (estado.toLowerCase() !== 'activo') continue;
    if (liquidacionesPeriodoActual[radKey]) continue;

    var esquema = interpretarTextoComision(datosControl[row][CONFIG.CONTROL_COLS.COMISION]);
    if (esquema !== 'Variable') continue;

    var asignacion = asignaciones[radKey] || buildEmptyAssignment_();
    var destinatarios = [asignacion.gerente, asignacion.profesionalBtm].filter(function(email, index, array) {
      return email && email.indexOf('@') !== -1 && array.indexOf(email) === index;
    });

    destinatarios.forEach(function(email) {
      if (!grupos[email]) grupos[email] = [];
      grupos[email].push({
        radicacion: radicacion,
        codigoFidusap: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.CODIGO_FIDUSAP]) || 'Sin código',
        nombre: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.NOMBRE_NEGOCIO]) || asignacion.nombreBTM,
        esquema: esquema
      });
    });
  }

  return grupos;
}

function getLiquidationAlertForDate_(date) {
  var todayKey = formatDateKey_(date);
  var targetFirst = new Date(date.getFullYear(), date.getMonth(), 1);
  if (date.getDate() > 2) targetFirst = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  var alerts = [
    {
      date: addBusinessDays_(targetFirst, -3),
      subject: '⏰ Puedes iniciar la liquidación de contratos BTM',
      title: 'Ya puedes ir liquidando',
      message: 'Faltan 3 días hábiles para dejar la liquidación lista a más tardar el día 1.'
    },
    {
      date: addBusinessDays_(targetFirst, -2),
      subject: '⚠️ Quedan 2 días para cerrar la liquidación BTM',
      title: 'Quedan 2 días para el cierre',
      message: 'Quedan 2 días hábiles para cerrar la liquidación del periodo de facturación.'
    },
    {
      date: addBusinessDays_(targetFirst, -1),
      subject: '🚨 Queda 1 día para registrar novedades de liquidación',
      title: 'Queda 1 día para registrar novedades',
      message: 'Mañana vence el plazo para dejar la liquidación lista y registrar novedades.'
    },
    {
      date: new Date(targetFirst.getFullYear(), targetFirst.getMonth(), 2),
      subject: '🔒 Cierre de novedades de liquidación BTM',
      title: 'Cierre de novedades',
      message: 'Hoy 02 de mes calendario se realiza el cierre de novedades de liquidación.'
    }
  ];

  for (var i = 0; i < alerts.length; i++) {
    if (formatDateKey_(alerts[i].date) === todayKey) return alerts[i];
  }
  return null;
}

function buildLiquidationReminderBody_(alerta, contratos) {
  var lines = [
    alerta.title,
    '',
    alerta.message,
    '',
    'Contratos activos asociados: ' + contratos.length,
    '',
    'Ingresa al Dashboard: ' + CONFIG.DASHBOARD_URL,
    ''
  ];

  contratos.slice(0, 30).forEach(function(item) {
    lines.push('• Radicación: ' + item.radicacion + ' | Código FIDUSAP: ' + item.codigoFidusap + ' | Negocio: ' + item.nombre + ' | Esquema: ' + item.esquema);
  });

  return lines.join('\n');
}

function buildLiquidationReminderHtml_(alerta, contratos) {
  var rows = contratos.slice(0, 30).map(function(item) {
    return '<tr>' +
      '<td style="padding:12px;border-bottom:1px solid #edf0f4;color:#001391;font-weight:700;">' + escapeHtml_(item.radicacion) + '</td>' +
      '<td style="padding:12px;border-bottom:1px solid #edf0f4;color:#020b5f;">' + escapeHtml_(item.codigoFidusap) + '</td>' +
      '<td style="padding:12px;border-bottom:1px solid #edf0f4;color:#020b5f;">' + escapeHtml_(item.nombre) + '</td>' +
      '<td style="padding:12px;border-bottom:1px solid #edf0f4;color:#020b5f;">' + escapeHtml_(item.esquema) + '</td>' +
    '</tr>';
  }).join('');

  return '<div style="background:#f3f4f6;padding:28px;font-family:Segoe UI,Arial,sans-serif;color:#020b5f;">' +
    '<div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 45px rgba(4,17,90,0.08);">' +
      '<div style="background:#001391;color:#fff;padding:28px 32px;">' +
        '<div style="font-size:36px;font-weight:900;margin-bottom:12px;">BBVA</div>' +
        '<h1 style="margin:0;font-size:24px;">' + escapeHtml_(alerta.title) + '</h1>' +
        '<p style="margin:10px 0 0;color:#d8ecff;">CRM Fiduciaria BBVA · Recordatorio de liquidación</p>' +
      '</div>' +
      '<div style="padding:28px 32px;">' +
        '<p style="font-size:16px;line-height:1.55;margin:0 0 18px;">' + escapeHtml_(alerta.message) + '</p>' +
        '<div style="background:#d8ecff;border-radius:16px;padding:16px 18px;margin-bottom:22px;"><strong>Contratos activos asociados:</strong> ' + contratos.length + '</div>' +
        '<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #edf0f4;border-radius:14px;overflow:hidden;">' +
          '<thead><tr style="background:#f7f8fa;text-align:left;">' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">Radicación</th>' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">FIDUSAP</th>' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">Negocio</th>' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">Esquema</th>' +
          '</tr></thead><tbody>' + rows + '</tbody>' +
        '</table>' +
        '<div style="margin-top:26px;"><a href="' + CONFIG.DASHBOARD_URL + '" style="display:inline-block;background:#001391;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 22px;font-weight:800;">Ingresar al Dashboard</a></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function addBusinessDays_(date, days) {
  var result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var step = days < 0 ? -1 : 1;
  var remaining = Math.abs(days);
  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    var day = result.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return result;
}

function formatDateKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function normalizeProfileName_(profile) {
  var normalized = normalizaTexto_(profile);
  if (normalized === 'facturacion') return ROLES.FACTURACION;
  if (normalized === 'super admin' || normalized === 'superadmin' || normalized === 'super administrador' || normalized === 'superadministrador') return ROLES.SUPER_ADMIN;
  return toCleanString_(profile);
}

function normalizaEstadoNegocio_(estado) {
  return normalizaTexto_(estado);
}

function normalizaTexto_(texto) {
  return toCleanString_(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}



function formatSheetDate_(value) {
  if (!value) return 'No registrada';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return toCleanString_(value) || 'No registrada';
}

function interpretarTextoComision(texto) {
  if (!texto) return 'No Especificada';
  var limpio = texto.toString().toLowerCase();
  if (limpio.indexOf('variable') !== -1 || limpio.indexOf('porcentaje') !== -1 || limpio.indexOf('%') !== -1) return 'Variable';
  if (limpio.indexOf('fija') !== -1 || limpio.indexOf('fijo') !== -1 || limpio.indexOf('mensual') !== -1) return 'Fija';
  return 'Variable (Por Interpretar)';
}

function cortarTexto(texto, largo) {
  if (!texto) return '';
  return texto.toString().substring(0, largo);
}

function toCleanString_(value) {
  return value === null || value === undefined ? '' : value.toString().trim();
}

function normalizeEmail_(value) {
  return toCleanString_(value).toLowerCase();
}

function normalizeKey_(value) {
  return toCleanString_(value).toLowerCase();
}

function isHeaderLike_(value) {
  return value.toString().toLowerCase().indexOf('radicaci') !== -1;
}

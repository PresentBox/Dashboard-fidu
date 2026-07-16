// ============================================================================
// CONFIGURACIÓN CENTRALIZADA
// ============================================================================
const CONFIG = {
  APP_TITLE: 'Fidu Gestión - CRM Lotes',
  APP_VERSION: '0.2.11',
  SHEETS: {
    CONTROL: 'control',
    BTM: 'CONT/BTM',
    SFC: 'INV SFC',
    USUARIOS: 'usuarios',
    FACTURACION: 'facturacion',
    LIQUIDACIONES: 'liquidaciones',
    TABLA_COMISIONES: 'Tabla de comisiones',
    PRELIQUIDACIONES: 'preliquidaciones'
  },
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
    CODIGO_FIDUSAP: 1,
    NOMBRE_LEGACY: 1,
    NOMBRE: 3,
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
  PERIOD_CUTOFF_DAY: 2,
  DASHBOARD_URL: 'https://script.google.com/a/macros/bbva.com/s/AKfycbyFsbZtNVXLaKN6Rba2uTPj9k4-1iBiqzlkleUwLQs1ytgS2nETaz_teUz9yQllh6Ey_A/exec',
  // Cambia este correo para ejecutar pruebas desde el menú de Apps Script sin editar parámetros de funciones.
  TEST_EMAIL: 'pruebas@bbva.com'
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
  var preliquidacionesPeriodoActual = buildCurrentPeriodPreliquidationMap_(libro);
  var ultimasPreliquidaciones = buildLatestPreliquidationMap_(libro);
  var tiposComision = getCommissionTypes_(libro);

  return buildCrmResponse_(correoUsuario, esSuperAdmin, esFacturacion, perfilesAdicionales, datosControl, mapaAsignacionesBTM, mapaEstadosSFC, facturadosPeriodoActual, liquidacionesPeriodoActual, preliquidacionesPeriodoActual, ultimasPreliquidaciones, tiposComision);
}


/**
 * Crea un negocio nuevo desde el formulario frontal para iniciar preliquidación.
 * @param {Object} payload Datos abiertos del negocio.
 * @return {string}
 */
function registrarNuevoNegocio(payload) {
  payload = payload || {};
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getRequiredSheets_(book);
  var email = getCurrentUserEmail_();
  var radicacion = toCleanString_(payload.radicacion);
  var nombre = toCleanString_(payload.nombreNegocio);
  if (!radicacion || !nombre) throw new Error('No. Radicación y Nombre del negocio son obligatorios.');

  var datosControl = sheets.control.getDataRange().getValues();
  var existing = buildControlRowsMap_(datosControl);
  if (existing[normalizeKey_(radicacion)]) throw new Error('Ya existe un negocio con la radicación ' + radicacion + '.');

  var controlRow = new Array(12).fill('');
  controlRow[CONFIG.CONTROL_COLS.RADICACION] = radicacion;
  controlRow[CONFIG.CONTROL_COLS.CODIGO_FIDUSAP] = toCleanString_(payload.codigoFidusap);
  controlRow[CONFIG.CONTROL_COLS.FECHA_CONSTITUCION] = parseOptionalDate_(payload.fechaConstitucion);
  controlRow[CONFIG.CONTROL_COLS.FECHA_VIGENCIA] = parseOptionalDate_(payload.fechaVigencia);
  controlRow[CONFIG.CONTROL_COLS.NOMBRE_NEGOCIO] = nombre;
  controlRow[CONFIG.CONTROL_COLS.ESTADO] = toCleanString_(payload.estado) || 'Activo';
  var tiposComisionSugeridos = normalizeCommissionTypesPayload_(payload.tipoComisionSugerida || payload.tiposComisionSugerida);
  var descripcionComisiones = toCleanString_(payload.descripcionComisiones);
  controlRow[CONFIG.CONTROL_COLS.COMISION] = tiposComisionSugeridos.length
    ? ('Tipos de comisión sugeridos: ' + tiposComisionSugeridos.join(', ') + (descripcionComisiones ? '. ' + descripcionComisiones : ''))
    : descripcionComisiones;
  controlRow[CONFIG.CONTROL_COLS.TIPO] = normalizeGeneralType_(payload.tipoGeneral);
  sheets.control.appendRow(controlRow);

  var btmRow = new Array(24).fill('');
  btmRow[CONFIG.BTM_COLS.RADICACION] = radicacion;
  btmRow[CONFIG.BTM_COLS.CODIGO_FIDUSAP] = toCleanString_(payload.codigoFidusap);
  btmRow[CONFIG.BTM_COLS.NOMBRE] = nombre;
  btmRow[CONFIG.BTM_COLS.PROFESIONAL_CONTABLE] = normalizeEmail_(payload.profesionalContable);
  btmRow[CONFIG.BTM_COLS.GERENTE] = normalizeEmail_(payload.gerenteBtm) || email;
  btmRow[CONFIG.BTM_COLS.PROFESIONAL_BTM] = normalizeEmail_(payload.profesionalBtm) || email;
  sheets.btm.appendRow(btmRow);

  notifyAssignedBtmNewBusiness_(btmRow[CONFIG.BTM_COLS.GERENTE], btmRow[CONFIG.BTM_COLS.PROFESIONAL_BTM], email, radicacion, nombre, tiposComisionSugeridos);
  var resumenPreliquidacionInicial = registrarPreliquidacionesInicialesNuevoNegocio_(book, email, radicacion, nombre, controlRow, payload.preliquidacionesIniciales);

  return '✅ Negocio ' + radicacion + ' creado y notificado al BTM asignado.' + (resumenPreliquidacionInicial.cantidad ? ' Se guardaron ' + resumenPreliquidacionInicial.cantidad + ' preliquidación(es) inicial(es) por $' + resumenPreliquidacionInicial.total.toLocaleString('es-CO') + '.' : ' No se guardaron preliquidaciones iniciales.');
}

/**
 * Guarda cambios de estado por lote y envía correos consolidados a contadores.
 * @param {Object} paqueteCambios Objeto { radicacion: nuevoEstado }.
 * @return {string}
 */


function registrarPreliquidacionesInicialesNuevoNegocio_(book, usuario, radicacion, nombreNegocio, controlRow, paquetes) {
  var resumen = { cantidad: 0, total: 0 };
  if (!Array.isArray(paquetes) || paquetes.length === 0) return resumen;

  var tipos = getCommissionTypes_(book);
  var sheet = getOrCreatePreliquidationSheet_(book);
  var period = getCurrentBillingPeriod_();
  var now = new Date();
  var rows = [];
  var notificaciones = [];

  paquetes.forEach(function(paquete) {
    var tipo = findCommissionType_(tipos, paquete.tipoComision);
    if (!tipo) throw new Error('Selecciona un tipo de comisión válido para la preliquidación inicial: ' + toCleanString_(paquete.tipoComision));
    var valores = paquete.valores || {};
    var calculo = calcularPreliquidacion_(tipo, valores);
    if (!calculo.total || calculo.total <= 0) return;
    var id = Utilities.getUuid();
    rows.push([
      now,
      period,
      id,
      radicacion,
      toCleanString_(controlRow[CONFIG.CONTROL_COLS.CODIGO_FIDUSAP]) || '',
      nombreNegocio,
      tipo.tipo,
      JSON.stringify(valores),
      calculo.subtotal,
      calculo.ivaValor,
      calculo.total,
      usuario,
      'PRELIQUIDADA',
      '',
      '',
      toCleanString_(controlRow[CONFIG.CONTROL_COLS.COMISION]) || ''
    ]);
    resumen.cantidad++;
    resumen.total += calculo.total;
    notificaciones.push({ tipo: tipo.tipo, calculo: calculo });
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    notificaciones.forEach(function(item) {
      notifyBillingPreliquidation_(book, usuario, nombreNegocio, radicacion, item.tipo, item.calculo);
    });
  }

  return resumen;
}

function normalizeGeneralType_(value) {
  var normalized = normalizaTexto_(value);
  if (normalized === 'fija' || normalized === 'fijo') return 'Fija';
  if (normalized === 'variable') return 'Variable';
  throw new Error('Tipo general inválido. Selecciona Fija o Variable.');
}

function normalizeCommissionTypesPayload_(value) {
  if (Array.isArray(value)) {
    return value.map(toCleanString_).filter(function(item, index, array) {
      return item && array.indexOf(item) === index;
    });
  }
  var clean = toCleanString_(value);
  if (!clean) return [];
  return clean.split(',').map(toCleanString_).filter(function(item, index, array) {
    return item && array.indexOf(item) === index;
  });
}

function buildAssignmentCatalogs_(asignaciones) {
  var catalogs = { gerentesBtm: [], profesionalesBtm: [], profesionalesContables: [] };
  Object.keys(asignaciones || {}).forEach(function(key) {
    addUniqueEmail_(catalogs.gerentesBtm, asignaciones[key].gerente);
    addUniqueEmail_(catalogs.profesionalesBtm, asignaciones[key].profesionalBtm);
    addUniqueEmail_(catalogs.profesionalesContables, asignaciones[key].profesionalContable);
  });
  catalogs.gerentesBtm.sort();
  catalogs.profesionalesBtm.sort();
  catalogs.profesionalesContables.sort();
  return catalogs;
}

function addUniqueEmail_(list, value) {
  var email = normalizeEmail_(value);
  if (email && list.indexOf(email) === -1) list.push(email);
}

function buildStandardAlertShellHtml_(title, subtitle, contentHtml) {
  return '<div style="background:#f3f4f6;padding:28px;font-family:Segoe UI,Arial,sans-serif;color:#020b5f;">' +
    '<div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 45px rgba(4,17,90,0.08);">' +
      '<div style="background:#001391;color:#fff;padding:28px 32px;">' +
        '<div style="font-size:36px;font-weight:900;margin-bottom:12px;">BBVA</div>' +
        '<h1 style="margin:0;font-size:24px;line-height:1.25;">' + escapeHtml_(title) + '</h1>' +
        '<p style="margin:10px 0 0;color:#d8ecff;">' + escapeHtml_(subtitle || 'CRM Fiduciaria BBVA · Sistema de alertas') + '</p>' +
      '</div>' +
      '<div style="padding:28px 32px;">' + contentHtml + '</div>' +
    '</div>' +
  '</div>';
}

function buildDashboardButtonHtml_(label) {
  return '<div style="margin-top:26px;"><a href="' + CONFIG.DASHBOARD_URL + '" style="display:inline-block;background:#001391;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 22px;font-weight:800;">' + escapeHtml_(label || 'Ingresar al Dashboard') + '</a></div>';
}

function buildInfoBoxHtml_(text) {
  return '<div style="background:#d8ecff;border-radius:16px;padding:16px 18px;margin:18px 0 22px;color:#020b5f;">' + text + '</div>';
}

function buildSimpleRowsTableHtml_(headers, rows) {
  var headerHtml = headers.map(function(header) {
    return '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;text-align:left;">' + escapeHtml_(header) + '</th>';
  }).join('');
  var rowHtml = rows.map(function(row) {
    return '<tr>' + row.map(function(cell, index) {
      var color = index === 0 ? '#001391' : '#020b5f';
      var weight = index === 0 ? 'font-weight:700;' : '';
      return '<td style="padding:12px;border-bottom:1px solid #edf0f4;color:' + color + ';' + weight + '">' + escapeHtml_(cell) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #edf0f4;border-radius:14px;overflow:hidden;">' +
    '<thead><tr style="background:#f7f8fa;">' + headerHtml + '</tr></thead><tbody>' + rowHtml + '</tbody></table>';
}

function buildAssignedBtmNewBusinessHtml_(creador, radicacion, nombre, tipos) {
  var rows = [
    ['Radicación', radicacion],
    ['Nombre del negocio', nombre],
    ['Tipos de comisión sugeridos', tipos],
    ['Creado por', creador]
  ];
  return buildStandardAlertShellHtml_(
    'Nuevo negocio asignado en Fidu Gestión',
    'CRM Fiduciaria BBVA · Asignación BTM',
    '<p style="font-size:17px;line-height:1.55;margin:0 0 18px;font-weight:800;">Hola,</p>' +
    '<p style="font-size:16px;line-height:1.55;margin:0 0 14px;">Se creó un nuevo negocio en Fidu Gestión y quedaste asignado como BTM responsable.</p>' +
    buildInfoBoxHtml_('<strong>Acción sugerida:</strong> Revisa el negocio, acepta la gestión operativa y genera la preliquidación inicial cuando corresponda.') +
    buildSimpleRowsTableHtml_(['Dato', 'Detalle'], rows) +
    buildDashboardButtonHtml_('Revisar negocio') +
    '<p style="font-size:14px;line-height:1.55;margin:22px 0 0;color:#5d668a;">Gracias por tu gestión.</p>'
  );
}

function buildBillingPreliquidationHtml_(usuario, nombreNegocio, radicacion, tipoComision, calculo) {
  var rows = [
    ['Radicación', radicacion],
    ['Negocio', nombreNegocio],
    ['Tipo de comisión', tipoComision],
    ['Subtotal', '$' + calculo.subtotal.toLocaleString('es-CO')],
    ['IVA', '$' + calculo.ivaValor.toLocaleString('es-CO')],
    ['Total', '$' + calculo.total.toLocaleString('es-CO')]
  ];
  return buildStandardAlertShellHtml_(
    'Preliquidación generada para facturación',
    'CRM Fiduciaria BBVA · Preliquidación',
    '<p style="font-size:17px;line-height:1.55;margin:0 0 18px;font-weight:800;">Hola equipo de Facturación,</p>' +
    '<p style="font-size:16px;line-height:1.55;margin:0 0 14px;">El usuario BTM <strong>' + escapeHtml_(usuario) + '</strong> generó una preliquidación que requiere gestión de facturación.</p>' +
    buildInfoBoxHtml_('<strong>Acción requerida:</strong> Ingresa al Dashboard para revisar y dejar en firme la factura FIDUSAP.') +
    buildSimpleRowsTableHtml_(['Dato', 'Detalle'], rows) +
    buildDashboardButtonHtml_('Gestionar facturación') +
    '<p style="font-size:14px;line-height:1.55;margin:22px 0 0;color:#5d668a;">Gracias por tu gestión.</p>'
  );
}

function notifyAssignedBtmNewBusiness_(gerente, profesionalBtm, creador, radicacion, nombre, tiposComision) {
  var destinatarios = [];
  addUniqueEmail_(destinatarios, gerente);
  addUniqueEmail_(destinatarios, profesionalBtm);
  if (!destinatarios.length) return 0;
  var asunto = 'Nuevo negocio asignado en Fidu Gestión - ' + radicacion;
  var tipos = tiposComision && tiposComision.length ? tiposComision.join(', ') : 'Sin tipo sugerido';
  var cuerpo = 'Hola,\n\n' +
    'Se creó un nuevo negocio en Fidu Gestión y quedaste asignado como BTM responsable.\n\n' +
    'Radicación: ' + radicacion + '\n' +
    'Nombre del negocio: ' + nombre + '\n' +
    'Tipos de comisión sugeridos: ' + tipos + '\n' +
    'Creado por: ' + creador + '\n\n' +
    'Ingresa al Dashboard para revisar, aceptar la gestión operativa y generar la preliquidación inicial cuando corresponda: ' + CONFIG.DASHBOARD_URL;
  var html = buildAssignedBtmNewBusinessHtml_(creador, radicacion, nombre, tipos);
  destinatarios.forEach(function(email) {
    MailApp.sendEmail({
      to: email,
      subject: asunto,
      body: cuerpo,
      htmlBody: html
    });
  });
  return destinatarios.length;
}

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
 * Permite al BTM actualmente asignado reasignar temporalmente el gerente/profesional BTM.
 * @param {Object} payload Datos de reasignación.
 * @return {string}
 */
function reasignarBtmNegocio(payload) {
  payload = payload || {};
  var radicacion = toCleanString_(payload.radicacion);
  var nuevoGerente = normalizeEmail_(payload.gerenteBtm);
  var nuevoProfesional = normalizeEmail_(payload.profesionalBtm);
  if (!radicacion) throw new Error('Radicación inválida para reasignar BTM.');
  if (!nuevoGerente && !nuevoProfesional) throw new Error('Selecciona al menos un Gerente BTM o Profesional BTM para reasignar.');

  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getRequiredSheets_(book);
  var email = getCurrentUserEmail_();
  var datosBTM = sheets.btm.getDataRange().getValues();
  var key = normalizeKey_(radicacion);
  var targetRow = -1;
  var asignacionActual = null;

  for (var row = 1; row < datosBTM.length; row++) {
    if (normalizeKey_(datosBTM[row][CONFIG.BTM_COLS.RADICACION]) === key) {
      targetRow = row + 1;
      asignacionActual = {
        gerente: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.GERENTE]),
        profesionalBtm: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.PROFESIONAL_BTM])
      };
      break;
    }
  }

  if (targetRow === -1) throw new Error('No se encontró la radicación ' + radicacion + ' en CONT/BTM.');
  if (email !== asignacionActual.gerente && email !== asignacionActual.profesionalBtm) {
    throw new Error('Solo el BTM actualmente asignado al negocio puede reasignarlo temporalmente.');
  }

  if (nuevoGerente) sheets.btm.getRange(targetRow, CONFIG.BTM_COLS.GERENTE + 1).setValue(nuevoGerente);
  if (nuevoProfesional) sheets.btm.getRange(targetRow, CONFIG.BTM_COLS.PROFESIONAL_BTM + 1).setValue(nuevoProfesional);

  return '✅ Reasignación BTM guardada para la radicación ' + radicacion + '.';
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
  return perfiles.indexOf(ROLES.SUPER_ADMIN) !== -1;
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
    tiposComision: [],
    metricas: { totalActivos: 0, totalVariables: 0, discrepancias: 0, pendientesFacturacionPeriodo: 0, totalInactivos: 0, totalEnLiquidacion: 0, totalFijos: 0, totalContratosComision: 0 },
    periodoActual: getCurrentBillingPeriod_(),
    version: CONFIG.APP_VERSION
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
      nombreBTM: toCleanString_(datosBTM[row][CONFIG.BTM_COLS.NOMBRE]) || toCleanString_(datosBTM[row][CONFIG.BTM_COLS.NOMBRE_LEGACY]) || 'Sin Nombre Especificado',
      profesionalContable: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.PROFESIONAL_CONTABLE]),
      gerente: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.GERENTE]),
      profesionalBtm: normalizeEmail_(datosBTM[row][CONFIG.BTM_COLS.PROFESIONAL_BTM])
    };
  }

  return mapaAsignacionesBTM;
}

function buildCrmResponse_(correoUsuario, esSuperAdmin, esFacturacion, perfilesAdicionales, datosControl, mapaAsignacionesBTM, mapaEstadosSFC, facturadosPeriodoActual, liquidacionesPeriodoActual, preliquidacionesPeriodoActual, ultimasPreliquidaciones, tiposComision) {
  var contratosProcesados = [];
  var rolesDetectados = new Set();
  var metricas = { totalActivos: 0, totalVariables: 0, discrepancias: 0, pendientesFacturacionPeriodo: 0, totalInactivos: 0, totalEnLiquidacion: 0, totalFijos: 0, totalContratosComision: 0 };

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
    var tipoGeneralNormalizado = normalizaTexto_(datosControl[row][CONFIG.CONTROL_COLS.TIPO]);
    if (tipoGeneralNormalizado === 'variable') esquema = 'Variable';
    if (tipoGeneralNormalizado === 'fija' || tipoGeneralNormalizado === 'fijo') esquema = 'Fija';

    var estaActivo = estadoControl.toLowerCase() === 'activo';
    var facturadoPeriodoActual = Boolean(facturadosPeriodoActual[radicacionKey]);
    var liquidacionCerradaPeriodoActual = Boolean(liquidacionesPeriodoActual[radicacionKey]);
    var preliquidacionesContrato = preliquidacionesPeriodoActual[radicacionKey] || [];
    var preliquidadoPeriodoActual = preliquidacionesContrato.length > 0;
    var ultimaPreliquidacion = ultimasPreliquidaciones[radicacionKey] || null;
    var pendientePeriodoActual = esFacturacion
      ? preliquidacionesContrato.some(function(pre) { return pre.estado !== 'FACTURADA'; })
      : estaActivo && esquema === 'Variable' && !preliquidadoPeriodoActual && !liquidacionCerradaPeriodoActual;
    if (pendientePeriodoActual) metricas.pendientesFacturacionPeriodo++;

    if (rolesEnFila.length > 0 || esSuperAdmin || esFacturacion) {
      var incluirEnMetricas = esSuperAdmin || rolesEnFila.length > 0 || (esFacturacion && pendientePeriodoActual);
      if (incluirEnMetricas) {
        if (estaActivo) metricas.totalActivos++;
        if (normalizaEstadoNegocio_(estadoControl) === 'inactivo') metricas.totalInactivos++;
        if (normalizaEstadoNegocio_(estadoControl) === 'en liquidacion') metricas.totalEnLiquidacion++;
        if (esquema === 'Variable') metricas.totalVariables++;
        if (esquema === 'Fija') metricas.totalFijos++;
        if (esquema === 'Variable' || esquema === 'Fija') metricas.totalContratosComision++;
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
        descripcionComisiones: toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.COMISION]) || 'No Especificado',
        esquemaComision: esquema,
        validacionSFC: estadoValidacion,
        estadoActual: estadoControl,
        facturadoPeriodoActual: facturadoPeriodoActual,
        facturacionPeriodoActual: facturadosPeriodoActual[radicacionKey] || null,
        liquidacionCerradaPeriodoActual: liquidacionCerradaPeriodoActual,
        preliquidadoPeriodoActual: preliquidadoPeriodoActual,
        preliquidacionesPeriodoActual: preliquidacionesContrato,
        ultimaPreliquidacion: ultimaPreliquidacion,
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
    tiposComision: tiposComision || [],
    catalogosAsignacion: buildAssignmentCatalogs_(mapaAsignacionesBTM),
    metricas: metricas,
    periodoActual: getCurrentBillingPeriod_(),
    version: CONFIG.APP_VERSION
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
    var items = gruposPorContador[contadorDestino];
    var cuerpo = buildNotificationBody_(ejecutor, items);
    var html = buildNotificationHtml_(ejecutor, items);
    MailApp.sendEmail({
      to: contadorDestino,
      subject: asunto,
      body: cuerpo,
      htmlBody: html
    });
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
  var timeZone = Session.getScriptTimeZone();
  var today = new Date();
  var scriptDay = Number(Utilities.formatDate(today, timeZone, 'd'));
  var periodDate = new Date(today.getTime());

  if (scriptDay <= CONFIG.PERIOD_CUTOFF_DAY) {
    periodDate.setMonth(periodDate.getMonth() - 1);
  }

  return Utilities.formatDate(periodDate, timeZone, CONFIG.CURRENT_PERIOD_FORMAT);
}

function normalizePeriodValue_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), CONFIG.CURRENT_PERIOD_FORMAT);
  }
  var text = toCleanString_(value).replace(/^'/, '');
  var dateMatch = text.match(/^(\d{4})[-\/](\d{1,2})(?:[-\/]\d{1,2})?$/);
  if (dateMatch) return dateMatch[1] + '-' + ('0' + dateMatch[2]).slice(-2);
  var parsed = new Date(text);
  if (!isNaN(parsed.getTime()) && /\d{4}/.test(text)) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), CONFIG.CURRENT_PERIOD_FORMAT);
  }
  return text;
}

function buildCurrentPeriodBillingMap_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.FACTURACION);
  var map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;

  var currentPeriod = getCurrentBillingPeriod_();
  var values = sheet.getDataRange().getValues();
  for (var row = 1; row < values.length; row++) {
    var period = normalizePeriodValue_(values[row][1]);
    var radicacion = normalizeKey_(values[row][2]);
    if (period === currentPeriod && radicacion) {
      map[radicacion] = {
        fechaRegistro: formatSheetDate_(values[row][0]),
        periodo: period,
        radicacion: toCleanString_(values[row][2]),
        usuario: toCleanString_(values[row][3]),
        estado: toCleanString_(values[row][4]) || 'FACTURADO',
        codigoFidusap: toCleanString_(values[row][5]),
        fechaFacturacion: formatSheetDate_(values[row][6]),
        valorFacturado: Number(values[row][7]) || 0,
        facturaFidusap: toCleanString_(values[row][8]),
        cufe: toCleanString_(values[row][9])
      };
    }
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
    var period = normalizePeriodValue_(values[row][1]);
    var radicacion = normalizeKey_(values[row][2]);
    if (period === currentPeriod && radicacion) map[radicacion] = true;
  }
  return map;
}


/**
 * Registra una preliquidación por tipo de comisión y notifica a Facturación.
 * @param {Object} payload Datos de preliquidación desde el frontend.
 * @return {Object}
 */
function registrarPreliquidacionContrato(payload) {
  payload = payload || {};
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var email = getCurrentUserEmail_();
  var sheets = getRequiredSheets_(book);
  var datosControl = sheets.control.getDataRange().getValues();
  var datosBTM = sheets.btm.getDataRange().getValues();
  var asignaciones = buildBtmAssignmentsMap_(datosBTM);
  var perfiles = getAdditionalProfiles_(book, email);
  var esAdmin = isSuperAdmin_(email, perfiles);
  var tipos = getCommissionTypes_(book);
  var tipo = findCommissionType_(tipos, payload.tipoComision);
  if (!tipo) throw new Error('Selecciona un tipo de comisión válido desde la tabla de comisiones.');

  var radicacion = toCleanString_(payload.radicacion);
  var key = normalizeKey_(radicacion);
  if (!key) throw new Error('Radicación inválida para preliquidar.');

  var controlPorRadicacion = buildControlRowsMap_(datosControl);
  var row = controlPorRadicacion[key];
  if (!row) throw new Error('No se encontró la radicación ' + radicacion + ' en control.');

  var estadoNegocio = normalizaEstadoNegocio_(row[CONFIG.CONTROL_COLS.ESTADO]);
  if (estadoNegocio !== 'activo') throw new Error('El negocio está ' + toCleanString_(row[CONFIG.CONTROL_COLS.ESTADO]) + ' y no permite preliquidar.');

  var asignacion = asignaciones[key] || buildEmptyAssignment_();
  var puedePreliquidar = esAdmin || email === asignacion.gerente || email === asignacion.profesionalBtm;
  if (!puedePreliquidar) throw new Error('Solo BTM, profesional BTM o Súper Admin pueden generar la preliquidación.');

  var calculo = calcularPreliquidacion_(tipo, payload.valores || {});
  var period = getCurrentBillingPeriod_();
  var now = new Date();
  var sheet = getOrCreatePreliquidationSheet_(book);
  var id = Utilities.getUuid();
  var nombreNegocio = toCleanString_(row[CONFIG.CONTROL_COLS.NOMBRE_NEGOCIO]) || asignacion.nombreBTM;

  sheet.appendRow([
    now,
    period,
    id,
    radicacion,
    toCleanString_(row[CONFIG.CONTROL_COLS.CODIGO_FIDUSAP]) || '',
    nombreNegocio,
    tipo.tipo,
    JSON.stringify(payload.valores || {}),
    calculo.subtotal,
    calculo.ivaValor,
    calculo.total,
    email,
    'PRELIQUIDADA',
    '',
    '',
    toCleanString_(row[CONFIG.CONTROL_COLS.COMISION]) || ''
  ]);

  notifyBillingPreliquidation_(book, email, nombreNegocio, radicacion, tipo.tipo, calculo);

  return {
    id: id,
    radicacion: radicacion,
    periodo: period,
    tipoComision: tipo.tipo,
    subtotal: calculo.subtotal,
    iva: calculo.ivaValor,
    total: calculo.total,
    estado: 'PRELIQUIDADA',
    mensaje: '✅ Preliquidación registrada por $' + calculo.total.toLocaleString('es-CO') + ' y notificada a Facturación.'
  };
}


/**
 * Registra una o varias preliquidaciones de una misma radicación y devuelve el total consolidado.
 * @param {Object[]} paquetes
 * @return {Object}
 */
function registrarPreliquidacionesContrato(paquetes) {
  if (!Array.isArray(paquetes) || paquetes.length === 0) {
    throw new Error('Agrega al menos un tipo de comisión para preliquidar.');
  }
  var resultados = paquetes.map(function(paquete) {
    return registrarPreliquidacionContrato(paquete);
  });
  var subtotal = resultados.reduce(function(sum, item) { return sum + (Number(item.subtotal) || 0); }, 0);
  var iva = resultados.reduce(function(sum, item) { return sum + (Number(item.iva) || 0); }, 0);
  var total = resultados.reduce(function(sum, item) { return sum + (Number(item.total) || 0); }, 0);
  return {
    cantidad: resultados.length,
    subtotal: subtotal,
    iva: iva,
    total: total,
    resultados: resultados,
    mensaje: '✅ Se registraron ' + resultados.length + ' preliquidación(es). Subtotal: $' + subtotal.toLocaleString('es-CO') + '. IVA: $' + iva.toLocaleString('es-CO') + '. Total consolidado: $' + total.toLocaleString('es-CO') + '.'
  };
}

/**
 * Compatibilidad con clientes antiguos. La facturación ya no se confirma por línea.
 */
function confirmarPreliquidacionFacturada() {
  throw new Error('La facturación ahora se registra por negocio completo. Actualiza la aplicación y usa Registrar factura del negocio.');
}

/**
 * Registra una factura consolidada para todas las preliquidaciones del negocio en el periodo actual.
 * @param {Object} payload Datos de factura del negocio.
 * @return {Object}
 */
function registrarFacturacionNegocio(payload) {
  return registrarFacturacionesNegocio_([payload], false);
}

/**
 * Importa facturas consolidadas previamente leídas desde un CSV en el frontend.
 * @param {Object[]} registros Filas normalizadas del archivo.
 * @return {Object}
 */
function importarFacturacionMasiva(registros) {
  return registrarFacturacionesNegocio_(registros, true);
}

function registrarFacturacionesNegocio_(registros, esImportacion) {
  if (!Array.isArray(registros) || registros.length === 0) {
    throw new Error('No hay registros de facturación para procesar.');
  }

  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    var email = getCurrentUserEmail_();
    var perfiles = getAdditionalProfiles_(book, email);
    if (!isSuperAdmin_(email, perfiles) && perfiles.indexOf(ROLES.FACTURACION) === -1) {
      throw new Error('Solo el perfil Facturación puede registrar facturas.');
    }

    var sheets = getRequiredSheets_(book);
    var controlRows = buildControlRowsMap_(sheets.control.getDataRange().getValues());
    var preSheet = getOrCreatePreliquidationSheet_(book);
    ensurePreliquidationBillingColumns_(preSheet);
    var preValues = preSheet.getRange(1, 1, preSheet.getLastRow(), 18).getValues();
    var billingSheet = getOrCreateBillingSheet_(book);
    var facturadosPeriodo = buildCurrentPeriodBillingMap_(book);
    var periodoActual = getCurrentBillingPeriod_();
    var now = new Date();
    var billingRows = [];
    var keysProcesadas = {};

    registros.forEach(function(raw, index) {
      var payload = raw || {};
      var radicacion = toCleanString_(payload.radicacion);
      var key = normalizeKey_(radicacion);
      var prefijo = esImportacion ? 'Fila ' + (index + 2) + ': ' : '';
      if (!key) throw new Error(prefijo + 'la radicación es obligatoria.');
      if (keysProcesadas[key]) throw new Error(prefijo + 'la radicación ' + radicacion + ' está repetida en el archivo.');
      if (facturadosPeriodo[key]) throw new Error(prefijo + 'la radicación ' + radicacion + ' ya está facturada en ' + periodoActual + '.');

      var controlRow = controlRows[key];
      if (!controlRow) throw new Error(prefijo + 'la radicación ' + radicacion + ' no existe en control.');
      var codigoControl = toCleanString_(controlRow[CONFIG.CONTROL_COLS.CODIGO_FIDUSAP]);
      var codigoArchivo = toCleanString_(payload.codigoFidusap);
      if (codigoArchivo && normalizeKey_(codigoArchivo) !== normalizeKey_(codigoControl)) {
        throw new Error(prefijo + 'el Código FIDUSAP no coincide con control para la radicación ' + radicacion + '.');
      }

      var periodo = normalizePeriodValue_(payload.periodo || periodoActual);
      if (periodo !== periodoActual) {
        throw new Error(prefijo + 'el periodo debe ser ' + periodoActual + '.');
      }
      var factura = toCleanString_(payload.facturaFidusap);
      var cufe = toCleanString_(payload.cufe);
      if (!factura) throw new Error(prefijo + 'el número de factura FIDUSAP es obligatorio.');
      if (!cufe) throw new Error(prefijo + 'el CUFE es obligatorio.');
      var fechaFacturacion = parseRequiredBillingDate_(payload.fechaFacturacion, prefijo);

      var indicesPreliquidacion = [];
      var totalPreliquidado = 0;
      for (var row = 1; row < preValues.length; row++) {
        if (normalizePeriodValue_(preValues[row][1]) !== periodo || normalizeKey_(preValues[row][3]) !== key) continue;
        indicesPreliquidacion.push(row);
        totalPreliquidado += Number(preValues[row][10]) || 0;
      }
      if (indicesPreliquidacion.length === 0) {
        throw new Error(prefijo + 'no existen preliquidaciones del periodo para la radicación ' + radicacion + '.');
      }

      var valorInformado = parseNumber_(payload.valorFacturado);
      if (valorInformado <= 0) throw new Error(prefijo + 'el valor facturado debe ser mayor que cero.');
      if (Math.round(valorInformado) !== Math.round(totalPreliquidado)) {
        throw new Error(prefijo + 'el valor facturado (' + valorInformado + ') no coincide con el total preliquidado (' + totalPreliquidado + ').');
      }

      indicesPreliquidacion.forEach(function(preRow) {
        preValues[preRow][12] = 'FACTURADA';
        preValues[preRow][13] = factura;
        preValues[preRow][14] = email;
        preValues[preRow][16] = cufe;
        preValues[preRow][17] = fechaFacturacion;
      });
      billingRows.push([now, periodo, radicacion, email, 'FACTURADO', codigoControl, fechaFacturacion, Math.round(totalPreliquidado), factura, cufe]);
      keysProcesadas[key] = true;
    });

    var primeraFilaFacturacion = billingSheet.getLastRow() + 1;
    billingSheet.getRange(primeraFilaFacturacion, 1, billingRows.length, 10).setValues(billingRows);
    try {
      if (preValues.length > 1) {
        preSheet.getRange(2, 1, preValues.length - 1, 18).setValues(preValues.slice(1));
      }
    } catch (writeError) {
      billingSheet.deleteRows(primeraFilaFacturacion, billingRows.length);
      throw writeError;
    }
    SpreadsheetApp.flush();

    return {
      cantidad: billingRows.length,
      periodo: periodoActual,
      mensaje: '✅ Se registraron ' + billingRows.length + ' negocio(s) facturado(s) para el periodo ' + periodoActual + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

function parseRequiredBillingDate_(value, prefijo) {
  var text = toCleanString_(value);
  if (!text) throw new Error((prefijo || '') + 'la fecha de facturación es obligatoria.');
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error((prefijo || '') + 'la fecha de facturación debe usar formato AAAA-MM-DD.');
  var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    throw new Error((prefijo || '') + 'la fecha de facturación no es válida.');
  }
  return date;
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
    var tipoGeneralNormalizado = normalizaTexto_(row[CONFIG.CONTROL_COLS.TIPO]);
    if (tipoGeneralNormalizado === 'variable') esquema = 'Variable';
    if (tipoGeneralNormalizado === 'fija' || tipoGeneralNormalizado === 'fijo') esquema = 'Fija';
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


function getOrCreatePreliquidationSheet_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.PRELIQUIDACIONES);
  if (!sheet) {
    sheet = book.insertSheet(CONFIG.SHEETS.PRELIQUIDACIONES);
    sheet.getRange(1, 1, 1, 18).setValues([[
      'fecha_registro', 'periodo', 'id', 'radicacion', 'codigo_fidusap', 'nombre_negocio',
      'tipo_comision', 'valores_json', 'subtotal', 'iva', 'total', 'usuario_preliquida',
      'estado_preliquidacion', 'factura_fidusap', 'usuario_factura', 'descripcion_comision',
      'cufe', 'fecha_facturacion'
    ]]);
  }
  return sheet;
}

function ensurePreliquidationBillingColumns_(sheet) {
  if (sheet.getMaxColumns() < 18) sheet.insertColumnsAfter(sheet.getMaxColumns(), 18 - sheet.getMaxColumns());
  sheet.getRange(1, 17, 1, 2).setValues([['cufe', 'fecha_facturacion']]);
}

function buildCurrentPeriodPreliquidationMap_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.PRELIQUIDACIONES);
  var map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;
  var period = getCurrentBillingPeriod_();
  var values = sheet.getDataRange().getValues();
  for (var row = 1; row < values.length; row++) {
    if (normalizePeriodValue_(values[row][1]) !== period) continue;
    var key = normalizeKey_(values[row][3]);
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push({
      fecha: formatSheetDate_(values[row][0]),
      periodo: normalizePeriodValue_(values[row][1]),
      id: toCleanString_(values[row][2]),
      radicacion: toCleanString_(values[row][3]),
      tipoComision: toCleanString_(values[row][6]),
      subtotal: Number(values[row][8]) || 0,
      iva: Number(values[row][9]) || 0,
      total: Number(values[row][10]) || 0,
      usuario: toCleanString_(values[row][11]),
      estado: toCleanString_(values[row][12]) || 'PRELIQUIDADA',
      facturaFidusap: toCleanString_(values[row][13]),
      cufe: toCleanString_(values[row][16]),
      fechaFacturacion: formatSheetDate_(values[row][17])
    });
  }
  return map;
}

function buildLatestPreliquidationMap_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.PRELIQUIDACIONES);
  var map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;

  var values = sheet.getDataRange().getValues();
  for (var row = 1; row < values.length; row++) {
    var key = normalizeKey_(values[row][3]);
    if (!key) continue;
    var record = {
      fecha: formatSheetDate_(values[row][0]),
      fechaSerial: values[row][0] instanceof Date ? values[row][0].getTime() : row,
      periodo: normalizePeriodValue_(values[row][1]),
      id: toCleanString_(values[row][2]),
      radicacion: toCleanString_(values[row][3]),
      tipoComision: toCleanString_(values[row][6]),
      subtotal: Number(values[row][8]) || 0,
      iva: Number(values[row][9]) || 0,
      total: Number(values[row][10]) || 0,
      usuario: toCleanString_(values[row][11]),
      estado: toCleanString_(values[row][12]) || 'PRELIQUIDADA',
      facturaFidusap: toCleanString_(values[row][13])
    };
    if (!map[key] || record.fechaSerial >= map[key].fechaSerial) map[key] = record;
  }
  Object.keys(map).forEach(function(key) { delete map[key].fechaSerial; });
  return map;
}


function getSheetByNameInsensitive_(book, name) {
  var target = normalizaTexto_(name);
  var sheets = book.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (normalizaTexto_(sheets[i].getName()) === target) return sheets[i];
  }
  return null;
}

function getCommissionTypes_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.TABLA_COMISIONES) || getSheetByNameInsensitive_(book, CONFIG.SHEETS.TABLA_COMISIONES);
  if (!sheet || sheet.getLastRow() < 4) return [];
  var smmlv = Number(sheet.getRange('B1').getValue()) || Number(sheet.getRange('A2').getValue()) || 0;
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(4, 1, lastRow - 3, 7).getValues();
  var displays = sheet.getRange(4, 1, lastRow - 3, 7).getDisplayValues();
  var backgrounds = sheet.getRange(4, 1, lastRow - 3, 7).getBackgrounds();
  var result = [];
  for (var i = 0; i < values.length; i++) {
    var tipo = toCleanString_(values[i][0]);
    if (!tipo) continue;
    result.push({
      tipo: tipo,
      descripcion: toCleanString_(values[i][1]),
      smmlv: smmlv,
      campos: {
        saldoUvr: buildCommissionField_('Saldos Medios / Cantidad UVR', 'saldoUvr', tipo, values[i][1], values[i][2], displays[i][2], backgrounds[i][2]),
        valorUvr: buildCommissionField_('Valor / UVR (Pesos)', 'valorUvr', tipo, values[i][1], values[i][3], displays[i][3], backgrounds[i][3]),
        cantidad: buildCommissionField_('Cantidad', 'cantidad', tipo, values[i][1], values[i][4], displays[i][4], backgrounds[i][4]),
        iva: buildCommissionField_('IVA', 'iva', tipo, values[i][1], values[i][5], displays[i][5], backgrounds[i][5])
      },
      ejemploTotal: Number(values[i][6]) || parseCurrency_(displays[i][6]) || 0
    });
  }
  return result;
}

function buildCommissionField_(label, key, tipo, descripcion, value, display, background) {
  var mode = inferCommissionFieldMode_(key, tipo, descripcion, display);
  var rawValue = Number(value) || parseCurrency_(display) || 0;
  return {
    key: key,
    label: label,
    enabled: !isDisabledCommissionCell_(background),
    ejemplo: toCleanString_(display),
    valor: rawValue,
    valorEntrada: rawValue,
    modo: mode
  };
}

function inferCommissionFieldMode_(key, tipo, descripcion, display) {
  if (key !== 'cantidad') return key;
  var text = normalizaTexto_(tipo + ' ' + descripcion + ' ' + display);
  if (text.indexOf('%') !== -1 || text.indexOf('porcentaje') !== -1 || text.indexOf('ventas') !== -1 || text.indexOf('rendimientos') !== -1 || text.indexOf('recursos administrados') !== -1) {
    return 'porcentaje';
  }
  if (text.indexOf('salario') !== -1 || text.indexOf('smmlv') !== -1 || text.indexOf('smlmv') !== -1) return 'salarios';
  return 'cantidad';
}

function isDisabledCommissionCell_(background) {
  var hex = toCleanString_(background).replace('#', '');
  if (hex.length !== 6) return false;
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  return Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r >= 120 && r <= 210;
}

function findCommissionType_(tipos, tipoComision) {
  var normalized = normalizaTexto_(tipoComision);
  for (var i = 0; i < tipos.length; i++) {
    if (normalizaTexto_(tipos[i].tipo) === normalized) return tipos[i];
  }
  return null;
}

function calcularPreliquidacion_(tipo, valores) {
  var saldoUvr = parseNumber_(valores.saldoUvr);
  var valorUvr = parseNumber_(valores.valorUvr);
  var cantidad = parseNumber_(valores.cantidad);
  var ivaRate = parseNumber_(valores.iva);
  if (!ivaRate) ivaRate = 0.19;
  if (ivaRate > 1) ivaRate = ivaRate / 100;

  var enabled = tipo.campos || {};
  var subtotal = 0;
  if (usesMinimumWageCalculation_(tipo)) {
    subtotal = cantidad * (tipo.smmlv || 0);
  } else if (enabled.saldoUvr && enabled.saldoUvr.enabled && enabled.valorUvr && enabled.valorUvr.enabled) {
    subtotal = saldoUvr * valorUvr;
  } else if (enabled.saldoUvr && enabled.saldoUvr.enabled && enabled.cantidad && enabled.cantidad.enabled) {
    subtotal = saldoUvr * normalizeRate_(cantidad);
  } else if (enabled.valorUvr && enabled.valorUvr.enabled && enabled.cantidad && enabled.cantidad.enabled) {
    subtotal = valorUvr * (enabled.cantidad.modo === 'porcentaje' ? normalizeRate_(cantidad) : (cantidad || 1));
  } else if (enabled.valorUvr && enabled.valorUvr.enabled) {
    subtotal = valorUvr;
  } else if (enabled.cantidad && enabled.cantidad.enabled) {
    subtotal = cantidad * (tipo.smmlv || 0);
  } else if (enabled.saldoUvr && enabled.saldoUvr.enabled) {
    subtotal = saldoUvr;
  }

  var ivaValor = subtotal * ivaRate;
  return {
    subtotal: Math.round(subtotal),
    ivaValor: Math.round(ivaValor),
    total: Math.round(subtotal + ivaValor),
    ivaRate: ivaRate
  };
}

function usesMinimumWageCalculation_(tipo) {
  return !!(tipo && tipo.campos && tipo.campos.cantidad && tipo.campos.cantidad.enabled && tipo.campos.cantidad.modo === 'salarios');
}

function normalizeRate_(value) {
  if (!value) return 0;
  return value / 100;
}

function parseNumber_(value) {
  if (typeof value === 'number') return value;
  var text = String(value || '').trim().replace(/[$\s%]/g, '');
  if (!text) return 0;
  var hasComma = text.indexOf(',') !== -1;
  var hasDot = text.indexOf('.') !== -1;
  if (hasComma && hasDot) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    text = text.replace(',', '.');
  } else if (hasDot && text.indexOf('.') !== text.lastIndexOf('.')) {
    text = text.replace(/\./g, '');
  } else if (hasDot && text.charAt(0) !== '0' && /^\d{1,3}\.\d{3}$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  return Number(text) || 0;
}

function parseCurrency_(value) {
  return parseNumber_(value);
}

function notifyBillingPreliquidation_(book, usuario, nombreNegocio, radicacion, tipoComision, calculo) {
  var emails = getEmailsByProfile_(book, ROLES.FACTURACION);
  if (!emails.length) return 0;
  var subject = 'Preliquidación generada para facturación - ' + radicacion;
  var body = 'Hola equipo de Facturación,\n\n' +
    'El usuario BTM ' + usuario + ' generó una preliquidación para el negocio ' + nombreNegocio + '.\n\n' +
    'Radicación: ' + radicacion + '\n' +
    'Tipo de comisión: ' + tipoComision + '\n' +
    'Subtotal: $' + calculo.subtotal.toLocaleString('es-CO') + '\n' +
    'IVA: $' + calculo.ivaValor.toLocaleString('es-CO') + '\n' +
    'Total: $' + calculo.total.toLocaleString('es-CO') + '\n\n' +
    'Ingresa al Dashboard para dejar en firme la factura FIDUSAP: ' + CONFIG.DASHBOARD_URL;
  var html = buildBillingPreliquidationHtml_(usuario, nombreNegocio, radicacion, tipoComision, calculo);
  emails.forEach(function(email) {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      htmlBody: html
    });
  });
  return emails.length;
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
  throw new Error('Este flujo fue reemplazado por la facturación consolidada del negocio. Registra factura, CUFE, fecha y valor desde la vista Facturación.');
}

function getOrCreateBillingSheet_(book) {
  var sheet = book.getSheetByName(CONFIG.SHEETS.FACTURACION);
  if (!sheet) {
    sheet = book.insertSheet(CONFIG.SHEETS.FACTURACION);
  }
  if (sheet.getMaxColumns() < 10) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 10 - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, 10).setValues([[
    'fecha_registro', 'periodo', 'radicacion', 'usuario', 'estado_facturacion',
    'codigo_fidusap', 'fecha_facturacion', 'valor_facturado', 'factura_fidusap', 'cufe'
  ]]);
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
    return [item.radicacion, item.nombre, item.estado];
  });

  return buildStandardAlertShellHtml_(
    'Cambios de estado listos para validación de Facturación',
    'CRM Fiduciaria BBVA · Sistema de alertas por lotes',
    '<p style="font-size:17px;line-height:1.55;margin:0 0 18px;font-weight:800;">Hola equipo de Facturación,</p>' +
    '<p style="font-size:16px;line-height:1.55;margin:0 0 14px;">El usuario BTM <strong>' + escapeHtml_(ejecutor) + '</strong> guardó un lote con modificaciones de estado desde el CRM Corporativo. Por favor valida las comisiones antes de continuar con la facturación.</p>' +
    buildInfoBoxHtml_('<strong>Resumen:</strong> ' + items.length + ' negocio(s) requieren revisión de Facturación.') +
    buildSimpleRowsTableHtml_(['Radicación', 'Negocio', 'Nuevo estado'], rows) +
    buildDashboardButtonHtml_('Revisar negocios') +
    '<p style="font-size:14px;line-height:1.55;margin:22px 0 0;color:#5d668a;">Gracias por tu gestión.</p>'
  );
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
 * Wrapper sin parámetros para Apps Script: simula la alerta con una fecha de ejemplo.
 * Úsalo desde el botón Ejecutar sin escribir argumentos en la firma de la función.
 * @return {Object}
 */
function probarSimulacionAlertasLiquidacion() {
  return simularAlertasLiquidacionBTM('2026-07-29');
}

/**
 * Wrapper sin parámetros para Apps Script: envía el correo de prueba al correo configurado.
 * Cambia CONFIG.TEST_EMAIL si quieres probar con otro destinatario.
 * @return {string}
 */
function probarCorreoLiquidacionBTM() {
  return enviarCorreoPruebaLiquidacionBTM(CONFIG.TEST_EMAIL, '3_DIAS');
}

/**
 * Muestra las fechas exactas de alertas para un mes, sin enviar correos.
 * @return {Object}
 */
function probarCalendarioAlertasLiquidacion() {
  var resultado = simularCalendarioAlertasLiquidacion();
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function probarCorreoLiquidacion3Dias() {
  return enviarCorreoPruebaLiquidacionBTM(CONFIG.TEST_EMAIL, '3_DIAS');
}

function probarCorreoLiquidacion2Dias() {
  return enviarCorreoPruebaLiquidacionBTM(CONFIG.TEST_EMAIL, '2_DIAS');
}

function probarCorreoLiquidacion1Dia() {
  return enviarCorreoPruebaLiquidacionBTM(CONFIG.TEST_EMAIL, '1_DIA');
}

function probarCorreoLiquidacionCierre() {
  return enviarCorreoPruebaLiquidacionBTM(CONFIG.TEST_EMAIL, 'CIERRE');
}

/**
 * Simula la alerta de liquidación sin enviar correos.
 * @param {string=} fechaISO Fecha opcional en formato yyyy-MM-dd para probar días específicos.
 * @return {Object}
 */
function simularAlertasLiquidacionBTM(fechaISO) {
  var fecha = fechaISO ? new Date(fechaISO + 'T12:00:00') : new Date();
  var alerta = getLiquidationAlertForDate_(fecha);
  if (!alerta) {
    return {
      enviaCorreo: false,
      fechaEvaluada: formatDateKey_(fecha),
      mensaje: 'La fecha evaluada no coincide con el calendario de alertas.'
    };
  }

  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getRequiredSheets_(libro);
  var datosControl = sheets.control.getDataRange().getValues();
  var datosBTM = sheets.btm.getDataRange().getValues();
  var asignaciones = buildBtmAssignmentsMap_(datosBTM);
  var liquidacionesPeriodoActual = buildCurrentPeriodLiquidationMap_(libro);
  var preliquidacionesPeriodoActual = buildCurrentPeriodPreliquidationMap_(libro);
  var grupos = buildLiquidationReminderGroups_(datosControl, asignaciones, liquidacionesPeriodoActual, preliquidacionesPeriodoActual);
  var emails = Object.keys(grupos);

  return {
    enviaCorreo: emails.length > 0,
    fechaEvaluada: formatDateKey_(fecha),
    tipoAlerta: alerta.type,
    fechaLimite: alerta.deadlineLabel,
    asunto: alerta.subject,
    titulo: alerta.title,
    destinatarios: emails,
    totalDestinatarios: emails.length,
    totalContratos: emails.reduce(function(total, email) { return total + grupos[email].length; }, 0),
    muestraPrimerDestinatario: emails.length ? grupos[emails[0]].slice(0, 5) : []
  };
}

/**
 * Envía un correo de prueba de alerta de liquidación al correo indicado o al usuario activo.
 * No depende de que hoy sea fecha de alerta.
 * @param {string=} emailDestino Correo destino opcional.
 * @param {string=} tipoAlerta Tipo opcional: 3_DIAS, 2_DIAS, 1_DIA o CIERRE.
 * @return {string}
 */
function enviarCorreoPruebaLiquidacionBTM(emailDestino, tipoAlerta) {
  var destino = normalizeEmail_(emailDestino || getCurrentUserEmail_());
  if (!destino || destino.indexOf('@') === -1) throw new Error('Indica un correo válido para la prueba.');

  var alerta = buildLiquidationAlertByType_(tipoAlerta || '3_DIAS', getNextLiquidationFirstDay_(new Date()));
  alerta.subject = '🧪 Prueba · ' + alerta.subject;

  var contratos = getSampleLiquidationContracts_();
  MailApp.sendEmail({
    to: destino,
    subject: alerta.subject,
    body: buildLiquidationReminderBody_(alerta, contratos, destino),
    htmlBody: buildLiquidationReminderHtml_(alerta, contratos, destino)
  });

  return 'Correo de prueba ' + alerta.type + ' enviado a ' + destino + ' con ' + contratos.length + ' contrato(s) de muestra.';
}

function getSampleLiquidationContracts_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getRequiredSheets_(libro);
  var datosControl = sheets.control.getDataRange().getValues();
  var datosBTM = sheets.btm.getDataRange().getValues();
  var asignaciones = buildBtmAssignmentsMap_(datosBTM);
  var liquidacionesPeriodoActual = buildCurrentPeriodLiquidationMap_(libro);
  var preliquidacionesPeriodoActual = buildCurrentPeriodPreliquidationMap_(libro);
  var grupos = buildLiquidationReminderGroups_(datosControl, asignaciones, liquidacionesPeriodoActual, preliquidacionesPeriodoActual);
  var emails = Object.keys(grupos);
  if (emails.length) return grupos[emails[0]].slice(0, 5);

  return [{
    radicacion: 'PRUEBA-001',
    codigoFidusap: 'FIDU-TEST',
    nombre: 'Contrato de prueba visual',
    esquema: 'Variable'
  }];
}

/**
 * Envía alertas mensuales de liquidación BTM según calendario:
 * - 3, 2 y 1 días hábiles antes del día 1.
 * - Día 1 calendario como cierre de novedades / periodo finalizado.
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
  var preliquidacionesPeriodoActual = buildCurrentPeriodPreliquidationMap_(libro);
  var grupos = buildLiquidationReminderGroups_(datosControl, asignaciones, liquidacionesPeriodoActual, preliquidacionesPeriodoActual);
  var emails = Object.keys(grupos);

  emails.forEach(function(email) {
    var body = buildLiquidationReminderBody_(alerta, grupos[email], email);
    var html = buildLiquidationReminderHtml_(alerta, grupos[email], email);
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

function buildLiquidationReminderGroups_(datosControl, asignaciones, liquidacionesPeriodoActual, preliquidacionesPeriodoActual) {
  var grupos = {};

  for (var row = 1; row < datosControl.length; row++) {
    var radicacion = toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.RADICACION]);
    var radKey = normalizeKey_(radicacion);
    if (!radKey || isHeaderLike_(radKey)) continue;

    var estado = toCleanString_(datosControl[row][CONFIG.CONTROL_COLS.ESTADO]) || 'Activo';
    if (estado.toLowerCase() !== 'activo') continue;
    if (liquidacionesPeriodoActual[radKey]) continue;
    if (preliquidacionesPeriodoActual && preliquidacionesPeriodoActual[radKey]) continue;

    var esquema = interpretarTextoComision(datosControl[row][CONFIG.CONTROL_COLS.COMISION]);
    var tipoGeneralNormalizado = normalizaTexto_(datosControl[row][CONFIG.CONTROL_COLS.TIPO]);
    if (tipoGeneralNormalizado === 'variable') esquema = 'Variable';
    if (tipoGeneralNormalizado === 'fija' || tipoGeneralNormalizado === 'fijo') esquema = 'Fija';
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
  var targetFirst = getNextLiquidationFirstDay_(date);
  var alerts = getLiquidationAlertsForFirstDay_(targetFirst);

  for (var i = 0; i < alerts.length; i++) {
    if (formatDateKey_(alerts[i].date) === todayKey) return alerts[i];
  }
  return null;
}

function getNextLiquidationFirstDay_(date) {
  if (date.getDate() > 1) return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getLiquidationAlertsForFirstDay_(targetFirst) {
  return [
    buildLiquidationAlertByType_('3_DIAS', targetFirst),
    buildLiquidationAlertByType_('2_DIAS', targetFirst),
    buildLiquidationAlertByType_('1_DIA', targetFirst),
    buildLiquidationAlertByType_('CIERRE', targetFirst)
  ];
}

function buildLiquidationAlertByType_(type, targetFirst) {
  var deadlineLabel = formatDateDisplay_(targetFirst);
  var alerts = {
    '3_DIAS': {
      type: '3_DIAS',
      date: addBusinessDays_(targetFirst, -3),
      subject: 'Ya puedes iniciar la liquidación de comisiones variables',
      title: 'Inicio de liquidación mensual',
      paragraphs: [
        'Ya puedes iniciar la liquidación de los negocios a tu cargo que cuentan con comisión variable.',
        'Te recomendamos revisar con anticipación la información y registrar las novedades correspondientes, con el fin de evitar pendientes al cierre del periodo.',
        'Fecha límite para registrar novedades: ' + deadlineLabel,
        'Puedes consultar los negocios pendientes en el Dashboard.'
      ]
    },
    '2_DIAS': {
      type: '2_DIAS',
      date: addBusinessDays_(targetFirst, -2),
      subject: 'Quedan 2 días hábiles para completar la liquidación',
      title: 'Quedan 2 días hábiles para el cierre',
      paragraphs: [
        'Quedan 2 días hábiles para completar la liquidación de los negocios a tu cargo que tienen comisión variable.',
        'Por favor, revisa los negocios pendientes y registra las novedades antes de la fecha de cierre.',
        'Fecha límite: ' + deadlineLabel,
        'Consulta el detalle de los negocios en el Dashboard.'
      ]
    },
    '1_DIA': {
      type: '1_DIA',
      date: addBusinessDays_(targetFirst, -1),
      subject: 'Queda 1 día hábil para registrar novedades',
      title: 'Último día hábil para registrar novedades',
      paragraphs: [
        'Queda 1 día hábil para registrar las novedades asociadas a la liquidación de los negocios con comisión variable.',
        'Te invitamos a validar hoy la información pendiente y completar la gestión antes del cierre.',
        'Fecha límite: ' + deadlineLabel,
        'Consulta los negocios pendientes en el Dashboard.',
        'Evita que queden negocios sin liquidar.'
      ]
    },
    'CIERRE': {
      type: 'CIERRE',
      date: new Date(targetFirst.getFullYear(), targetFirst.getMonth(), 1),
      subject: 'Cierre de liquidación de comisiones variables',
      title: 'Periodo de novedades finalizado',
      paragraphs: [
        'El periodo para registrar novedades de la liquidación de comisiones variables ha finalizado.',
        'Al cierre, quedaron pendientes de gestión los siguientes negocios fiduciarios a tu cargo:',
        'Por favor, revisa estos casos y realiza la gestión correspondiente de acuerdo con el procedimiento definido.',
        'Para más información, consulta el Dashboard.'
      ]
    }
  };
  var alert = alerts[type] || alerts['3_DIAS'];
  alert.deadline = targetFirst;
  alert.deadlineLabel = deadlineLabel;
  return alert;
}

function simularCalendarioAlertasLiquidacion(anio, mes) {
  var hoy = new Date();
  var targetYear = anio || hoy.getFullYear();
  var targetMonthIndex = mes ? mes - 1 : hoy.getMonth();
  var targetFirst = new Date(targetYear, targetMonthIndex, 1);
  var alerts = getLiquidationAlertsForFirstDay_(targetFirst);

  return {
    mesEvaluado: Utilities.formatDate(targetFirst, Session.getScriptTimeZone(), 'yyyy-MM'),
    fechaCierre: formatDateKey_(targetFirst),
    alertas: alerts.map(function(alerta) {
      return {
        tipo: alerta.type,
        fechaEnvio: formatDateKey_(alerta.date),
        asunto: alerta.subject,
        titulo: alerta.title,
        fechaLimite: alerta.deadlineLabel,
        mensajes: alerta.paragraphs
      };
    })
  };
}

function buildLiquidationReminderBody_(alerta, contratos, emailDestino) {
  var nombre = formatRecipientName_(emailDestino);
  var lines = [
    'Hola, ' + nombre + ':',
    ''
  ];

  alerta.paragraphs.forEach(function(paragraph) {
    lines.push(paragraph);
    lines.push('');
  });

  lines.push('Tabla o listado de negocios pendientes (' + contratos.length + '):');
  lines.push('');

  contratos.slice(0, 30).forEach(function(item) {
    lines.push('• Radicación: ' + item.radicacion + ' | Código FIDUSAP: ' + item.codigoFidusap + ' | Negocio: ' + item.nombre + ' | Esquema: ' + item.esquema);
  });

  lines.push('');
  lines.push('Ingresa al Dashboard: ' + CONFIG.DASHBOARD_URL);
  lines.push('');
  lines.push('Gracias por tu gestión.');

  return lines.join('\n');
}

function buildLiquidationReminderHtml_(alerta, contratos, emailDestino) {
  var nombre = formatRecipientName_(emailDestino);
  var paragraphHtml = alerta.paragraphs.map(function(paragraph) {
    return '<p style="font-size:16px;line-height:1.55;margin:0 0 14px;">' + escapeHtml_(paragraph) + '</p>';
  }).join('');
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
        '<p style="font-size:17px;line-height:1.55;margin:0 0 18px;font-weight:800;">Hola, ' + escapeHtml_(nombre) + ':</p>' +
        paragraphHtml +
        '<div style="background:#d8ecff;border-radius:16px;padding:16px 18px;margin:18px 0 22px;"><strong>Tabla o listado de negocios pendientes:</strong> ' + contratos.length + '</div>' +
        '<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #edf0f4;border-radius:14px;overflow:hidden;">' +
          '<thead><tr style="background:#f7f8fa;text-align:left;">' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">Radicación</th>' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">FIDUSAP</th>' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">Negocio</th>' +
            '<th style="padding:12px;color:#5d668a;font-size:12px;text-transform:uppercase;">Esquema</th>' +
          '</tr></thead><tbody>' + rows + '</tbody>' +
        '</table>' +
        '<div style="margin-top:26px;"><a href="' + CONFIG.DASHBOARD_URL + '" style="display:inline-block;background:#001391;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 22px;font-weight:800;">Ingresar al Dashboard</a></div>' +
        '<p style="font-size:14px;line-height:1.55;margin:22px 0 0;color:#5d668a;">Gracias por tu gestión.</p>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function formatRecipientName_(email) {
  var local = normalizeEmail_(email).split('@')[0] || 'BTM';
  return local.split(/[._-]+/).filter(Boolean).map(function(part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ') || 'BTM';
}

function formatDateDisplay_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
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



function parseOptionalDate_(value) {
  if (!value) return '';
  var date = new Date(value + 'T12:00:00');
  return isNaN(date.getTime()) ? toCleanString_(value) : date;
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

/* =====================================================================
 *  PANEL DE CONTROL - lógica del cliente
 * ===================================================================== */
var TOKEN = null, USER = null, CFG = {}, DISTRITOS = [], GRADOS = [], TIPOS = [], APP_URL = baseUrl();
var LS_KEY = 'rp_panel_token';
var QRS = [], USUARIOS = [], MALLAS = [], DISTS_ALL = [], REPORTE = [];
var MF = null, MAP_ESC = null, MAP_COB = null, COB_DATA = null, LEY = { esc: [], cob: [] }, SEC = 'dash', DASH_TIMER = null;
var COLORES = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa6b8', '#d61f9b', '#7aa800', '#c97b00', '#008080', '#9a6324', '#800000', '#1f3a93', '#e0457b', '#2e8b57', '#6a5acd'];
var TITULOS = { dash: 'Tablero', mapa: 'Mapa de escaneos', cobertura: 'Rutas establecidas y cobertura', mallas: 'Malla operativa', qrs: 'Puntos (monedas)', estadisticas: 'Estadísticas por distrito', usuarios: 'Usuarios', distritos: 'Catálogo de distritos / servicios', reportes: 'Reporte de monedas', cuenta: 'Mi cuenta' };

/* ---------------- utilidades ---------------- */
alExpirar = function () { salir(true); };
function apiT(fn) { return api.apply(null, [fn, TOKEN].concat([].slice.call(arguments, 1))); }

function modal(titulo, html, wide) {
  $('#mTitle').textContent = titulo;
  $('#mBody').innerHTML = html;
  $('#modalBox').className = 'modal-box' + (wide ? ' wide' : '');
  $('#modal').hidden = false;
}
function cerrarModal() {
  $('#modal').hidden = true; $('#mBody').innerHTML = '';
  if (MF && MF.map) MF.map = null;
}
function confirmar(msg, okTxt) {
  return new Promise(function (res) {
    modal('Confirmar', '<p>' + esc(msg) + '</p><div class="modal-foot"><button class="btn" id="cfNo">Cancelar</button><button class="btn btn-primary" id="cfSi">' + (okTxt || 'Aceptar') + '</button></div>');
    $('#cfNo').onclick = function () { cerrarModal(); res(false); };
    $('#cfSi').onclick = function () { cerrarModal(); res(true); };
  });
}
function mostrar(id) { ['vLogin', 'vCambio', 'vApp'].forEach(function (v) { $('#' + v).hidden = v !== id; }); }
function esSuper() { return USER && USER.rol === 'SUPERADMIN'; }
function hoy() { return CFG.hoy || new Date().toISOString().slice(0, 10); }
function badgeHora(e) {
  var c = { 'A TIEMPO': 'b-ok', 'ADELANTADO': 'b-warn', 'ATRASADO': 'b-bad', 'SIN HORA': 'b-gray' }[e] || 'b-gray';
  return e ? '<span class="badge ' + c + '">' + esc(e) + '</span>' : '';
}
function badgeEstado(e) {
  return '<span class="badge ' + ({ ACTIVO: 'b-ok', PENDIENTE: 'b-warn', INACTIVO: 'b-bad' }[e] || 'b-gray') + '">' + esc(e) + '</span>';
}
function badgeValidez(v) {
  var c = { 'VALIDO': 'b-ok', 'NO VALIDO': 'b-bad', 'SIN FOTO': 'b-bad', 'PENDIENTE FOTO': 'b-warn' }[v] || 'b-gray';
  return '<span class="badge ' + c + '">' + esc(v === 'VALIDO' ? 'VÁLIDO' : v === 'NO VALIDO' ? 'NO VÁLIDO' : v) + '</span>';
}
function fotoVigente(e) { return !CFG.limiteFotos || String(e.fecha || e.fechaHora || '').slice(0, 10) >= CFG.limiteFotos; }
function btnFoto(e) {
  if (!e.nFotos) return '';
  return fotoVigente(e) ? '<button class="btn btn-sm" onclick="verFoto(\'' + e.id + '\',0)">📷 Foto</button>' : '<span class="small muted" title="Las fotos se conservan ' + (CFG.fotosDias || 10) + ' días">🗑 foto caducada</span>';
}
async function verFoto(id, idx) {
  try {
    toast('Cargando foto...');
    var f = await apiT('fotoVer', id, idx || 0);
    modal('Foto de evidencia', '<div class="mb"><span class="badge b-warn">Reto: ' + esc(f.reto) + '</span> <span class="small muted">' + esc(f.retoTexto) + '</span></div>' +
      '<img src="' + f.dataUrl + '" style="width:100%;border-radius:10px;display:block">' +
      (f.total > 1 ? '<div class="row mt">' + Array.from({ length: f.total }, function (_, i) { return '<button class="btn btn-sm" onclick="verFoto(\'' + id + '\',' + i + ')">Foto ' + (i + 1) + '</button>'; }).join('') + '</div>' : '') +
      '<p class="small muted mt">Recibida: ' + esc(f.fotoHora) + ' · tomada en vivo desde la app (sin galería). Se eliminará automáticamente a los ' + (CFG.fotosDias || 10) + ' días.</p>');
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function difTxt(d) { if (d === '' || d == null) return ''; d = Number(d); return (d > 0 ? '+' : '') + d + ' min'; }
function tabla(cols, filas, vacio) {
  if (!filas.length) return '<div class="card muted center">' + (vacio || 'Sin registros') + '</div>';
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
    '</tr></thead><tbody>' + filas.map(function (f) { return '<tr>' + f.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
}
function opcionesDistrito(sel, conTodos) {
  var o = conTodos && esSuper() ? '<option value="">— Todos —</option>' : '';
  return o + DISTRITOS.filter(function (d) { return d.activo === 'SI' || d.id === sel; }).map(function (d) {
    return '<option value="' + d.id + '"' + (d.id === sel ? ' selected' : '') + '>' + esc(d.nombre) + (d.tipo ? ' (' + esc(d.tipo) + ')' : '') + '</option>';
  }).join('');
}
function distDefecto() { return esSuper() ? (DISTRITOS[0] ? DISTRITOS[0].id : '') : USER.distritoId; }
function parseCoords(s) {
  var m = /(-?\d{1,3}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/.exec(String(s || ''));
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

/* ---------------- autenticación ---------------- */
document.addEventListener('DOMContentLoaded', async function () {
  $$('#nav button').forEach(function (b) { b.onclick = function () { ir(b.dataset.sec); }; });
  TOKEN = lsGet(LS_KEY);
  if (TOKEN) { try { await iniciarPanel(); return; } catch (e) { TOKEN = null; lsSet(LS_KEY, null); } }
  mostrar('vLogin');
});

async function doLogin(ev) {
  ev.preventDefault();
  await run($('#lgBtn'), async function () {
    var r = await api('login', $('#lgUser').value.trim(), $('#lgPass').value, 'panel');
    TOKEN = r.token; USER = r.usuario; lsSet(LS_KEY, TOKEN);
    $('#lgPass').value = '';
    if (USER.debeCambiar) { $('#cbAct').value = ''; mostrar('vCambio'); return; }
    await iniciarPanel();
  });
}
async function doRecuperar() {
  var id = $('#lgUser').value.trim();
  if (!id) { toast('Escriba su correo o cédula en el campo de usuario.', 'err'); return; }
  try { toast(await api('recuperarClave', id), 'ok', 6000); } catch (e) { toast(e.message, 'err'); }
}
async function doCambio(ev) {
  ev.preventDefault();
  if ($('#cbNew').value !== $('#cbNew2').value) { toast('Las claves no coinciden.', 'err'); return; }
  await run($('#cbBtn'), async function () {
    USER = await apiT('cambiarClave', $('#cbAct').value, $('#cbNew').value);
    toast('Clave actualizada.', 'ok');
    await iniciarPanel();
  });
}
function salir(silencioso) {
  if (TOKEN && !silencioso) api('logout', TOKEN).catch(function () { });
  TOKEN = null; USER = null; lsSet(LS_KEY, null);
  if (DASH_TIMER) clearInterval(DASH_TIMER);
  cerrarModal();
  mostrar('vLogin');
}

async function iniciarPanel() {
  var r = await apiT('panelInit');
  USER = r.usuario; CFG = r.cfg; DISTRITOS = r.distritos; GRADOS = r.grados; TIPOS = r.tipos;
  if (r.appUrl && r.appUrl.indexOf('SU-USUARIO') === -1) APP_URL = r.appUrl;
  if (USER.debeCambiar) { mostrar('vCambio'); return; }
  mostrar('vApp');
  $('#userChip').innerHTML = '<b>' + esc(USER.nombres) + '</b> · ' + esc(USER.rol) + (USER.distritoNombre ? ' · ' + esc(USER.distritoNombre) : '');
  $$('[data-super]').forEach(function (b) { b.hidden = !esSuper(); });
  $$('[data-only-super]').forEach(function (b) { b.hidden = !esSuper(); });
  ['#dDist', '#mDist', '#cDist', '#maDist', '#qDist', '#uDist', '#rDist', '#eDist'].forEach(function (s) { $(s).innerHTML = opcionesDistrito(esSuper() ? '' : USER.distritoId, true); });
  ['#mDesde', '#mHasta', '#cFecha', '#maDesde', '#maHasta', '#rDesde', '#rHasta', '#eDesde', '#eHasta'].forEach(function (s) { $(s).value = hoy(); });
  $('#cRadio').value = CFG.radio;
  if (esSuper() && !DISTRITOS.length) toast('Primero cree un distrito/servicio en el catálogo.', '', 6000);
  if (DASH_TIMER) clearInterval(DASH_TIMER);
  DASH_TIMER = setInterval(function () { if (SEC === 'dash' && !$('#vApp').hidden) cargarDash(); }, 60000);
  ir('dash');
}

function ir(sec) {
  SEC = sec;
  $$('#nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.sec === sec); });
  $$('.sec').forEach(function (s) { s.hidden = s.id !== 's-' + sec; });
  $('#secTitle').textContent = TITULOS[sec] || '';
  $('#sidebar').classList.remove('open');
  var loaders = {
    dash: cargarDash, qrs: cargarQRs, estadisticas: function () { if (!ESTAD) cargarEstadisticas(); }, usuarios: cargarUsuarios, distritos: cargarDistritos, mallas: function () { cargarMallas(); },
    mapa: function () { cargarPoliciasSelect('mPol', val('#mDist')); if (!MAP_ESC) consultarMapa(); },
    cobertura: function () { if (!MAP_COB) consultarCobertura(); },
    reportes: function () { cargarPoliciasSelect('rPol', val('#rDist')); },
    cuenta: renderCuenta
  };
  if (loaders[sec]) loaders[sec]();
}

async function cargarPoliciasSelect(selId, distId) {
  try {
    var l = await apiT('usuariosListar', { distritoId: distId, rol: 'POLICIA' });
    $('#' + selId).innerHTML = '<option value="">— Todos —</option>' + l.map(function (u) { return '<option value="' + u.id + '">' + esc(u.grado + ' ' + u.nombres) + '</option>'; }).join('');
  } catch (e) { }
}

/* ---------------- TABLERO ---------------- */
async function cargarDash() {
  try {
    var d = await apiT('dashboard', val('#dDist'));
    $('#dHora').textContent = 'Actualizado ' + new Date().toLocaleTimeString();
    var st = [['Puntos (monedas)', d.qrs], ['Servidores activos', d.policias], ['Patrullando hoy', d.patrullandoHoy], ['Monedas atrapadas hoy', d.escaneosHoy], ['Mallas hoy', d.mallasHoy.length], ['No válidos hoy', d.alertasHoy], ['Registros pendientes', d.pendientes]];
    $('#dStats').innerHTML = st.map(function (s) { return '<div class="stat"><div class="n">' + s[1] + '</div><div class="l">' + s[0] + '</div></div>'; }).join('');
    $('#dMallas').innerHTML = tabla(['Malla', 'Distrito', 'Horario', 'Ruta', 'Asignados', 'Cumplimiento', ''], d.mallasHoy.map(function (m) {
      return ['<b>' + esc(m.nombre) + '</b><br><span class="badge">' + m.modo + '</span>', esc(m.distritoNombre), '<b>' + esc(m.horario) + '</b>', '<span class="small">' + esc(m.resumen) + '</span>', '<span class="small">' + m.nAsignados + ' servidores</span>',
        '<div class="progress"><div style="width:' + m.pct + '%"></div></div><span class="small">' + m.hechos + '/' + m.total + ' (' + m.pct + '%)</span>' + (m.noCumplidos ? '<div class="nocump nocump-sm">❌ ' + m.noCumplidos + ' NO CUMPLIDO' + (m.noCumplidos > 1 ? 'S' : '') + '</div>' : ''),
        '<button class="btn btn-sm" onclick="verCumplimiento(\'' + m.id + '\')">Detalle</button>'];
    }), 'No hay mallas programadas para hoy.');
    $('#dUlt').innerHTML = tablaEscaneos(d.ultimos, true);
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}

function tablaEscaneos(list, corto) {
  var cols = corto ? ['Hora', 'Servidor', 'Moneda / lugar', 'Validez', 'Programado', 'Estado', 'Orden', '']
    : ['Fecha / hora', 'Servidor', 'Cédula', 'Moneda / lugar', 'Validez', 'GPS del celular', 'Malla', 'Programado', 'Dif.', 'Estado', 'Orden OK', 'Evidencia'];
  var filas = list.map(function (e) {
    var serv = '<b>' + esc(e.grado + ' ' + e.nombres) + '</b>';
    var qr = '<b>P' + esc(e.qrNumero) + '</b> ' + esc(e.qrNombre);
    var ord = e.ordenCorrecto === 'SI' ? '<span class="badge b-ok">SÍ</span>' : e.ordenCorrecto === 'NO' ? '<span class="badge b-bad">NO</span>' : '';
    var val = (e.motivo && e.motivo.indexOf('FUERA DE HORARIO') === 0 ? '<div class="nocump nocump-sm">❌ NO CUMPLIDO</div>' : badgeValidez(e.validez)) + (e.motivo ? '<div class="small" style="color:var(--rojo)">' + esc(e.motivo) + '</div>' : '') + (e.alerta ? '<div class="small muted">' + esc(e.alerta) + '</div>' : '');
    var gps = e.latDispositivo ? '<a target="_blank" href="https://www.google.com/maps?q=' + e.latDispositivo + ',' + e.lngDispositivo + '">a ' + esc(e.distanciaM) + ' m</a> <span class="small muted">±' + esc(e.precisionM) + '</span>' : '—';
    if (corto) return [e.hora, serv, qr, val, esc(e.horaEsperada || '-'), badgeHora(e.estadoHora) + ' <span class="small muted">' + difTxt(e.minutosDif) + '</span>', ord, btnFoto(e)];
    return [esc(e.fechaHora), serv, esc(e.cedula), qr, val, gps, esc(e.mallaNombre || 'Libre'), esc(e.horaEsperada || '-'), difTxt(e.minutosDif), badgeHora(e.estadoHora), ord, btnFoto(e) || '<span class="small muted">' + (e.retos ? 'sin foto' : '—') + '</span>'];
  });
  if (!filas.length) return '<div class="card muted center">Sin escaneos.</div>';
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
    filas.map(function (f, i) { return '<tr class="' + (list[i].validez === 'VALIDO' ? '' : list[i].validez === 'PENDIENTE FOTO' ? 'pend' : 'mala') + '">' + f.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
}

/* ---------------- MAPAS (Google Maps) ---------------- */
function popupEsc(e) {
  return '<div class="pop"><div style="margin-bottom:4px">' + badgeValidez(e.validez) + '</div><b>' + esc(e.grado + ' ' + e.nombres) + '</b><br>CI: ' + esc(e.cedula) +
    '<br>🪙 <b>Punto ' + esc(e.qrNumero) + '</b> – ' + esc(e.qrNombre) +
    '<br>🕒 ' + esc(e.fechaHora) +
    (e.mallaNombre ? '<br>Malla: ' + esc(e.mallaNombre) + ' · orden ' + esc(e.ordenEsperado) : '<br>Escaneo libre') +
    '<br>Programado: ' + esc(e.horaEsperada || '-') + ' ' + badgeHora(e.estadoHora) + ' ' + difTxt(e.minutosDif) +
    (e.ordenCorrecto ? '<br>Orden correcto: ' + e.ordenCorrecto : '') +
    (e.distanciaM !== '' ? '<br>📱 Celular a <b>' + esc(e.distanciaM) + ' m</b> de la moneda (±' + esc(e.precisionM) + ' m)' : '') +
    (e.motivo ? '<br><span style="color:#cf3b3b;font-weight:600">' + esc(e.motivo) + '</span>' : '') +
    (e.alerta ? '<br><span class="badge b-warn">' + esc(e.alerta) + '</span>' : '') +
    (e.nFotos ? (fotoVigente(e) ? '<br><button class="btn btn-sm" style="margin-top:6px" onclick="verFoto(\'' + e.id + '\',0)">📷 Ver foto de evidencia</button>' : '<br><span class="small muted">🗑 Foto caducada (' + (CFG.fotosDias || 10) + ' días)</span>') : '') +
    '<br><a target="_blank" href="https://www.google.com/maps?q=' + e.lat + ',' + e.lng + '">Abrir en Google Maps</a></div>';
}
function toggleCapa(tipo, i, on) {
  var it = LEY[tipo][i], map = tipo === 'esc' ? MAP_ESC : MAP_COB;
  it.on = on;
  it.layer.setMap(on ? map : null);
}
function renderLeyenda(tipo, cont) {
  $(cont).innerHTML = LEY[tipo].length ? LEY[tipo].map(function (it, i) {
    if (it.soloTexto) return '<div class="it"><span class="grow">' + it.html + '</span></div>';
    return '<label class="it" style="font-weight:400;color:inherit;cursor:pointer"><input type="checkbox" ' + (it.on ? 'checked' : '') + ' onchange="toggleCapa(\'' + tipo + '\',' + i + ',this.checked)">' +
      '<span class="dot" style="background:' + it.color + '"></span><span class="grow">' + it.html + '</span></label>';
  }).join('') : '<div class="muted">Sin datos para los filtros.</div>';
}
function limpiarCapas(tipo) { LEY[tipo].forEach(function (it) { it.layer.setMap(null); }); LEY[tipo] = []; }

async function consultarMapa(btn) {
  await run(btn, async function () {
    var r = await apiT('mapaEscaneos', { desde: val('#mDesde'), hasta: val('#mHasta'), distritoId: val('#mDist'), usuarioId: val('#mPol') });
    if (!MAP_ESC) MAP_ESC = await gmMapa($('#mapEsc'));
    var map = MAP_ESC, bounds = [];
    map.__info.close();
    limpiarCapas('esc');
    var lq = new Capa();
    r.qrs.forEach(function (q) { lq.add(gmPunto(map, q.lat, q.lng, '#ffd34d', 12, 'Punto ' + q.numero + ' · ' + q.nombre, '<div class="pop"><b>🪙 Punto ' + q.numero + '</b> – ' + esc(q.nombre) + '</div>', '#7a5a12')); });
    lq.setMap(map);
    LEY.esc.push({ layer: lq, color: '#999', html: '<b>Puntos (monedas)</b> <span class="muted">(' + r.qrs.length + ')</span>', on: true });
    var grupos = {}, orden = [];
    r.escaneos.forEach(function (e) { if (!grupos[e.usuarioId]) { grupos[e.usuarioId] = []; orden.push(e.usuarioId); } grupos[e.usuarioId].push(e); });
    orden.forEach(function (uid, i) {
      var color = COLORES[i % COLORES.length], lg = new Capa();
      var pts = grupos[uid].slice().sort(function (a, b) { return a.fechaHora < b.fechaHora ? -1 : 1; });
      var porDia = {}, k = 0, malos = 0;
      pts.filter(function (e) { return e.validez === 'VALIDO'; }).forEach(function (e) { (porDia[e.fecha] = porDia[e.fecha] || []).push([Number(e.lat), Number(e.lng)]); });
      Object.keys(porDia).forEach(function (d) { if (porDia[d].length > 1) lg.add(gmLinea(porDia[d], color, 3, true, true)); });
      pts.forEach(function (e) {
        bounds.push([Number(e.lat), Number(e.lng)]);
        if (e.validez === 'VALIDO') {
          k++;
          lg.add(gmNum(map, e.lat, e.lng, k, color, popupEsc(e), e.hora + ' · Punto ' + e.qrNumero + ' · VÁLIDO'));
        } else {
          malos++;
          var rojo = e.validez === 'PENDIENTE FOTO' ? '#c98a00' : '#cf3b3b';
          lg.add(gmNum(map, e.lat, e.lng, '✕', rojo, popupEsc(e), e.hora + ' · Punto ' + e.qrNumero + ' · ' + e.validez));
          if (e.latDispositivo) {
            // dónde estaba realmente el celular
            lg.add(gmLinea([[e.lat, e.lng], [e.latDispositivo, e.lngDispositivo]], rojo, 2, true, false));
            lg.add(gmPunto(map, e.latDispositivo, e.lngDispositivo, rojo, 16, 'Ubicación real del celular (' + e.distanciaM + ' m de la moneda)', popupEsc(e), '#fff'));
            if (Number(e.distanciaM) < 20000) bounds.push([Number(e.latDispositivo), Number(e.lngDispositivo)]);
          }
        }
      });
      lg.setMap(map);
      var p = pts[0], nombre = p.grado + ' ' + p.nombres;
      LEY.esc.push({ layer: lg, color: color, on: true, html: '<b>' + esc(nombre) + '</b><br><span class="muted">CI ' + esc(p.cedula) + ' · ' + k + ' válidos' + (malos ? ' · <span style="color:#cf3b3b;font-weight:700">' + malos + ' no válidos</span>' : '') + ' · ' + pts[0].hora + '–' + pts[pts.length - 1].hora + '</span>' });
    });
    renderLeyenda('esc', '#mLeyenda');
    if (!bounds.length) r.qrs.forEach(function (q) { bounds.push([q.lat, q.lng]); });
    gmAjustar(map, bounds, 18);
    if (!r.escaneos.length && btn) toast('No hay escaneos con esos filtros.');
  });
}

async function consultarCobertura(btn) {
  await run(btn, async function () {
    COB_DATA = await apiT('mapaCobertura', { fecha: val('#cFecha'), distritoId: val('#cDist') });
    if (!MAP_COB) MAP_COB = await gmMapa($('#mapCob'), { mapTypeId: 'hybrid' });
    dibujarCobertura();
  });
}
function dibujarCobertura() {
  if (!COB_DATA || !MAP_COB) return;
  var radio = Number(val('#cRadio')) || CFG.radio;
  var map = MAP_COB, bounds = [];
  map.__info.close();
  limpiarCapas('cob');
  var escPorPunto = {};
  COB_DATA.escaneos.forEach(function (e) { if (e.puntoId && e.validez === 'VALIDO') escPorPunto[e.puntoId] = (escPorPunto[e.puntoId] || 0) + 1; });
  var unicos = {};
  var capasMalla = COB_DATA.mallas.map(function (m, i) {
    var color = COLORES[i % COLORES.length], lg = new Capa();
    var line = m.puntos.map(function (p) { return [p.lat, p.lng]; });
    if (line.length > 1) lg.add(gmLinea(line, color, 4, false, true));
    var hechos = 0;
    m.puntos.forEach(function (p) {
      unicos[p.qrId] = 1; bounds.push([p.lat, p.lng]);
      var ok = !!escPorPunto[p.id]; if (ok) hechos++;
      lg.add(gmCirculo(p.lat, p.lng, radio, color, .3));
      lg.add(gmNum(map, p.lat, p.lng, p.orden, color, '<div class="pop"><b>' + esc(m.nombre) + '</b><br>Orden ' + p.orden + ': <b>Punto ' + p.qrNumero + '</b> – ' + esc(p.qrNombre) +
        '<br>Hora programada: ' + esc(p.hora || 'libre') + '<br>Radio de cobertura: ' + radio + ' m<br>Integrantes: ' + esc(m.asignados.join(', ')) +
        '<br>Estado: ' + (ok ? '<span class="badge b-ok">Atrapada</span>' : '<span class="badge b-warn">Pendiente</span>') + '</div>', 'Orden ' + p.orden + ' · ' + p.qrNombre));
    });
    lg.setMap(map);
    var area = Math.round(m.puntos.length * Math.PI * radio * radio);
    return { layer: lg, color: color, on: true, html: '<b>' + esc(m.nombre) + '</b> <span class="badge">' + m.modo + '</span><br><span class="muted">' + m.puntos.length + ' puntos · ' + hechos + ' escaneados · ≈' + area.toLocaleString() + ' m²<br>' + esc(m.asignados.join(', ')) + '</span>' };
  });
  var nU = Object.keys(unicos).length;
  LEY.cob.push({ soloTexto: true, layer: new Capa(), html: '<b>Resumen ' + esc(COB_DATA.fecha) + '</b><br><span class="muted">' + COB_DATA.mallas.length + ' mallas · ' + nU + ' puntos únicos cubiertos · ≈' + Math.round(nU * Math.PI * radio * radio).toLocaleString() + ' m² de cobertura (radio ' + radio + ' m)</span>' });
  capasMalla.forEach(function (c) { LEY.cob.push(c); });
  var lAll = new Capa();
  COB_DATA.qrs.forEach(function (q) {
    lAll.add(gmCirculo(q.lat, q.lng, radio, '#777777', .18));
    lAll.add(gmPunto(map, q.lat, q.lng, '#333', 8, 'Punto ' + q.numero + ' · ' + q.nombre, null, '#fff'));
  });
  var allOn = !COB_DATA.mallas.length;
  if (allOn) { lAll.setMap(map); COB_DATA.qrs.forEach(function (q) { bounds.push([q.lat, q.lng]); }); }
  LEY.cob.push({ layer: lAll, color: '#777', on: allOn, html: '<b>Todos los puntos</b><br><span class="muted">' + COB_DATA.qrs.length + ' puntos con radio de ' + radio + ' m</span>' });
  var lE = new Capa();
  COB_DATA.escaneos.forEach(function (e) {
    var okv = e.validez === 'VALIDO';
    if (okv) lE.add(gmPunto(map, e.lat, e.lng, '#15925a', 14, e.hora + ' · ' + e.nombres, popupEsc(e), '#fff'));
    else if (e.latDispositivo) lE.add(gmPunto(map, e.latDispositivo, e.lngDispositivo, '#cf3b3b', 14, 'NO VÁLIDO · ' + e.hora + ' · ' + e.nombres, popupEsc(e), '#fff'));
  });
  lE.setMap(map);
  LEY.cob.push({ layer: lE, color: '#15925a', on: true, html: '<b>Escaneos del día</b><br><span class="muted">' + COB_DATA.escaneos.filter(function (e) { return e.validez === 'VALIDO'; }).length + ' válidos (verde) · ' + COB_DATA.escaneos.filter(function (e) { return e.validez !== 'VALIDO'; }).length + ' no válidos (rojo, ubicación real)</span>' });
  renderLeyenda('cob', '#cLeyenda');
  gmAjustar(map, bounds, 18);
}

/* ---------------- PUNTOS (MONEDAS VIRTUALES) ---------------- */
async function cargarQRs() {
  try { QRS = await apiT('qrsListar', { distritoId: val('#qDist') }); renderQRs(); } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function renderQRs() {
  var b = val('#qBuscar').toLowerCase();
  var l = QRS.filter(function (q) { return !b || String(q.numero) === b || q.nombre.toLowerCase().indexOf(b) > -1; });
  $('#qTabla').innerHTML = tabla(['N°', 'Moneda', 'Lugar / entidad', 'Ubicación de la moneda', 'Sobre la vía', 'Radio', 'Distrito', 'Acciones'], l.map(function (q) {
    var via = q.ajuste === 'VIA' ? '<span class="badge b-ok">✓ a ' + q.ajusteM + ' m de la entidad</span>' : '<span class="badge b-warn">Ubicada a mano</span>';
    return ['<b style="font-size:16px">' + q.numero + '</b>', '<div style="width:44px;height:44px">' + coinSVG({ grado: 'GRADO', nombres: 'NOMBRE DEL POLICÍA', punto: q.nombre, hora: q.hora || '' }) + '</div>',
      '<b>' + esc(q.nombre) + '</b><br><span class="small muted">' + esc(q.descripcion) + '</span>',
      '<a target="_blank" href="https://www.google.com/maps?q=' + q.lat + ',' + q.lng + '">' + q.lat.toFixed(6) + ', ' + q.lng.toFixed(6) + '</a>', via,
      (q.radio || CFG.geocerca || 30) + ' m', esc(q.distritoNombre),
      '<div class="acciones"><button class="btn btn-sm" onclick="formQR(\'' + q.id + '\')">✏️ Editar</button><button class="btn btn-sm btn-danger" onclick="eliminarQR(\'' + q.id + '\')">🗑</button></div>'];
  }), 'No hay puntos. Cree el primero con "+ Nuevo punto".');
}
function formQR(id) {
  var q = id ? QRS.find(function (x) { return x.id === id; }) : null;
  var dId = q ? q.distritoId : (val('#qDist') || distDefecto());
  var sig = 1 + QRS.filter(function (x) { return x.distritoId === dId; }).reduce(function (m, x) { return Math.max(m, x.numero); }, 0);
  q = q || { numero: sig, nombre: '', descripcion: '', lat: '', lng: '', latEntidad: '', lngEntidad: '', hora: '', distritoId: dId };
  modal(id ? 'Editar punto N° ' + q.numero : 'Nuevo punto (moneda)',
    '<div class="form-grid">' +
    '<div><label>N° del punto</label><input type="number" min="1" id="fqNum" value="' + q.numero + '"></div>' +
    '<div><label>Radio para atrapar (m)</label><input type="number" min="10" max="200" id="fqRadio" value="' + esc(q.radio || '') + '" placeholder="' + (CFG.geocerca || 30) + ' (por defecto)"></div>' +
    '<div class="full"><label>Nombre del lugar / entidad</label><input id="fqNom" value="' + esc(q.nombre) + '" placeholder="Ej: Fiscalía, Gasolinera, Parque Central"></div>' +
    '<div class="full"><label>Referencia</label><input id="fqDesc" value="' + esc(q.descripcion) + '"></div>' +
    (esSuper() ? '<div class="full"><label>Distrito / Servicio</label><select id="fqDist">' + opcionesDistrito(q.distritoId) + '</select></div>' : '') +
    '<div class="full"><label>Ubicación de la ENTIDAD (pegue coordenadas o un enlace de Google Maps, o haga clic en el mapa)</label><input id="fqPaste" oninput="pegarCoords(this.value)" placeholder="-2.170998, -79.922359"></div>' +
    '<input type="hidden" id="fqLatE" value="' + q.latEntidad + '"><input type="hidden" id="fqLngE" value="' + q.lngEntidad + '">' +
    '<input type="hidden" id="fqLat" value="' + q.lat + '"><input type="hidden" id="fqLng" value="' + q.lng + '">' +
    '<div class="full"><div class="row mb"><span class="small muted grow">🏢 = entidad · 🪙 = moneda. La moneda se ubica sola sobre la <b>vía más cercana</b>, nunca dentro de una edificación. Puede arrastrarla por la vía.</span><button class="btn btn-sm" onclick="miUbicacionQR(this)">📍 Mi ubicación</button></div>' +
    '<div id="fqMap" class="map map-sm" style="height:340px"></div><div id="fqVia" class="small mt"></div></div>' +
    '</div><div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="fqBtn" onclick="guardarQR(\'' + (id || '') + '\')">Guardar</button></div>');
  setTimeout(async function () {
    if (!document.getElementById('fqMap')) return;
    var map;
    try { map = await gmMapa($('#fqMap'), { mapTypeId: 'hybrid' }); } catch (e) { toast(e.message, 'err'); return; }
    if (!document.getElementById('fqMap')) return;
    MF = { map: map, ent: null, coin: null, linea: null };
    if (q.latEntidad) { ponerEntidad(q.latEntidad, q.lngEntidad, false); ponerMoneda(q.lat, q.lng); map.setCenter({ lat: Number(q.lat), lng: Number(q.lng) }); map.setZoom(19); }
    else if (QRS.length) { map.setCenter({ lat: QRS[0].lat, lng: QRS[0].lng }); map.setZoom(16); }
    map.addListener('click', function (ev) { ponerEntidad(ev.latLng.lat(), ev.latLng.lng(), true); });
  }, 120);
}
function iconoDiv(html, css) { var d = document.createElement('div'); d.style.cssText = css; d.innerHTML = html; return d; }
function ponerEntidad(lat, lng, ajustar) {
  lat = Number(lat); lng = Number(lng);
  $('#fqLatE').value = lat.toFixed(7); $('#fqLngE').value = lng.toFixed(7);
  if (!MF.ent) MF.ent = new google.maps.marker.AdvancedMarkerElement({ map: MF.map, position: { lat: lat, lng: lng }, title: 'Entidad', content: iconoDiv('🏢', 'font-size:26px;transform:translateY(30%)') });
  else MF.ent.position = { lat: lat, lng: lng };
  if (ajustar) ajustarVia(lat, lng);
}
function ponerMoneda(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  $('#fqLat').value = lat.toFixed(7); $('#fqLng').value = lng.toFixed(7);
  if (!MF.coin) {
    MF.coin = new google.maps.marker.AdvancedMarkerElement({ map: MF.map, position: { lat: lat, lng: lng }, gmpDraggable: true, title: 'Moneda (arrástrela por la vía)',
      content: iconoDiv(coinSVG({ grado: '', nombres: val('#fqNom') || 'MONEDA', punto: '', hora: '' }), 'width:46px;height:46px;transform:translateY(50%);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))') });
    MF.coin.addListener('dragend', function () { var p = gmLatLng(MF.coin.position); ajustarVia(p.lat, p.lng, true); });
  } else MF.coin.position = { lat: lat, lng: lng };
  if (MF.linea) MF.linea.setMap(null);
  if ($('#fqLatE').value) { MF.linea = gmLinea([[$('#fqLatE').value, $('#fqLngE').value], [lat, lng]], '#ffd34d', 2, true, false); MF.linea.setMap(MF.map); }
}
async function ajustarVia(lat, lng, desdeMoneda) {
  $('#fqVia').innerHTML = '⏳ Buscando la vía más cercana...';
  try {
    var v = await apiT('puntoAjustarVia', lat, lng);
    ponerMoneda(v.lat, v.lng);
    MF.manual = !v.ok;
    $('#fqVia').innerHTML = v.ok ? '<span class="badge b-ok">✓ ' + esc(v.mensaje) + '</span>' : '<span class="badge b-warn">⚠ ' + esc(v.mensaje) + '</span> Arrastre la moneda 🪙 hasta la vía.';
    if (!desdeMoneda && MF.map.getZoom() < 18) { MF.map.setCenter({ lat: v.lat, lng: v.lng }); MF.map.setZoom(19); }
  } catch (e) { $('#fqVia').textContent = e.message; }
}
function pegarCoords(s) { var c = parseCoords(s); if (c && MF && MF.map) { ponerEntidad(c.lat, c.lng, true); MF.map.setCenter(c); MF.map.setZoom(19); } }
function miUbicacionQR(btn) {
  if (!navigator.geolocation) { toast('El navegador no permite geolocalización.', 'err'); return; }
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(function (p) {
    btn.disabled = false; ponerEntidad(p.coords.latitude, p.coords.longitude, true);
    MF.map.setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); MF.map.setZoom(19);
    toast('Ubicación obtenida (precisión ' + Math.round(p.coords.accuracy) + ' m)');
  }, function () { btn.disabled = false; toast('No se pudo obtener la ubicación.', 'err'); }, { enableHighAccuracy: true, timeout: 10000 });
}
async function guardarQR(id, confirmarManual) {
  if (!val('#fqLatE')) { toast('Ubique la entidad en el mapa.', 'err'); return; }
  await run($('#fqBtn'), async function () {
    var datos = { id: id, numero: val('#fqNum'), nombre: val('#fqNom'), descripcion: val('#fqDesc'), latEntidad: val('#fqLatE'), lngEntidad: val('#fqLngE'),
      lat: val('#fqLat'), lng: val('#fqLng'), radio: val('#fqRadio'), distritoId: esSuper() ? val('#fqDist') : USER.distritoId, confirmarManual: confirmarManual === true };
    try {
      var r = await apiT('qrGuardar', datos);
      cerrarModal(); toast('Punto guardado. ' + r.mensaje, 'ok', 6000); await cargarQRs();
    } catch (e) {
      if (String(e.message).indexOf('AJUSTE_VIA') === 0) {
        if (window.confirm(e.message.replace(/^AJUSTE_VIA:\s*/, '') + '\n\n¿La moneda 🪙 ya está sobre la vía (no dentro de una edificación)?')) return guardarQR(id, true);
        return;
      }
      throw e;
    }
  });
}
async function eliminarQR(id) {
  var q = QRS.find(function (x) { return x.id === id; });
  if (!await confirmar('¿Eliminar el punto N° ' + q.numero + ' (' + q.nombre + ')? Su moneda dejará de aparecer en mallas nuevas.', 'Eliminar')) return;
  try { toast(await apiT('qrEliminar', id), 'ok'); cargarQRs(); } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- ESTADÍSTICAS POR DISTRITO ---------------- */
var ESTAD = null;
async function cargarEstadisticas(btn) {
  await run(btn, async function () {
    ESTAD = await apiT('estadisticasDistritos', { desde: val('#eDesde'), hasta: val('#eHasta'), distritoId: val('#eDist') });
    var pct = function (v) { return v == null ? '—' : '<b style="color:' + (v >= 90 ? 'var(--verde)' : v >= 70 ? 'var(--ambar)' : 'var(--rojo)') + '">' + v + '%</b>'; };
    var fila = function (r, tot) {
      return '<tr' + (tot ? ' style="font-weight:800;background:var(--azul3)"' : '') + '><td>' + (tot ? 'TOTAL' : '<b>' + esc(r.distrito) + '</b><div class="small muted">' + esc(r.tipo || '') + '</div>') + '</td>' +
        '<td>' + r.puntos + (r.puntos ? '<div class="small muted">' + r.puntosEnVia + ' sobre vía</div>' : '') + '</td>' +
        '<td>' + r.mallasTotal + '</td><td>' + r.mallasVigentes + '</td><td>' + r.mallasFuturas + '</td><td>' + r.mallasFinalizadas + '</td><td>' + r.mallasEnRango + '</td>' +
        '<td>' + r.policias + '</td><td>' + r.programadas + '</td><td style="color:var(--verde);font-weight:700">' + r.atrapadas + '</td>' +
        '<td>' + (r.noCumplidas ? '<span class="nocump nocump-sm" style="margin:0">' + r.noCumplidas + '</span>' : '0') + '</td><td>' + r.pendientes + '</td><td>' + pct(r.pct) + '</td></tr>';
    };
    $('#eTabla').innerHTML = '<p class="small muted">Del ' + esc(ESTAD.desde) + ' al ' + esc(ESTAD.hasta) + ' (' + ESTAD.dias + ' días). Las monedas programadas cuentan cada moneda de cada policía por cada día de vigencia.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th rowspan="2">Distrito / Servicio</th><th rowspan="2">Puntos establecidos</th><th colspan="5" style="text-align:center">Mallas establecidas</th><th rowspan="2">Policías activos</th><th colspan="5" style="text-align:center">Monedas en el rango</th></tr>' +
      '<tr><th>Total</th><th>Vigentes hoy</th><th>Futuras</th><th>Finalizadas</th><th>En el rango</th><th>Programadas</th><th>Atrapadas</th><th>No cumplidas</th><th>Pendientes</th><th>Cumplimiento</th></tr></thead><tbody>' +
      ESTAD.filas.map(function (r) { return fila(r); }).join('') + (ESTAD.filas.length > 1 ? fila(ESTAD.total, true) : '') + '</tbody></table></div>';
  });
}
function csvEstadisticas() {
  if (!ESTAD) { toast('Primero consulte.', 'err'); return; }
  var cols = [['distrito', 'Distrito'], ['puntos', 'Puntos'], ['puntosEnVia', 'Puntos sobre vía'], ['mallasTotal', 'Mallas total'], ['mallasVigentes', 'Mallas vigentes hoy'], ['mallasFuturas', 'Mallas futuras'], ['mallasFinalizadas', 'Mallas finalizadas'], ['mallasEnRango', 'Mallas en rango'], ['policias', 'Policías activos'], ['programadas', 'Monedas programadas'], ['atrapadas', 'Atrapadas'], ['noCumplidas', 'No cumplidas'], ['pendientes', 'Pendientes'], ['pct', 'Cumplimiento %']];
  var csv = '﻿' + cols.map(function (c) { return c[1]; }).join(';') + '\n' + ESTAD.filas.concat([ESTAD.total]).map(function (r) { return cols.map(function (c) { return r[c[0]] == null ? '' : r[c[0]]; }).join(';'); }).join('\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'estadisticas_distritos_' + ESTAD.desde + '_' + ESTAD.hasta + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- MALLA OPERATIVA ---------------- */
async function cargarMallas(btn) {
  await run(btn, async function () {
    MALLAS = await apiT('mallasListar', { desde: val('#maDesde'), hasta: val('#maHasta'), distritoId: val('#maDist'), dia: hoy() });
    $('#maTabla').innerHTML = tabla(['Vigencia', 'Malla', 'Horario', 'Ruta programada', 'Personal', 'Cumplimiento hoy', 'Acciones'], MALLAS.map(function (m) {
      var cumpl = m.activaDia ? '<div class="progress"><div style="width:' + m.pct + '%"></div></div><span class="small">' + m.hechos + '/' + m.total + ' (' + m.pct + '%)</span>' + (m.noCumplidos ? '<div class="nocump nocump-sm">❌ ' + m.noCumplidos + ' NO CUMPLIDO' + (m.noCumplidos > 1 ? 'S' : '') + '</div>' : '')
        : '<span class="small muted">' + (m.fecha > hoy() ? 'Inicia ' + esc(m.vigencia.split(' – ')[0]) : 'Finalizada') + '</span>';
      return ['<b>' + esc(m.vigencia) + '</b>', '<b>' + esc(m.nombre) + '</b><br><span class="badge">' + m.modo + '</span> <span class="small muted">±' + m.tolerancia + ' min</span>' + (m.exigirFoto !== 'NO' ? ' <span class="badge b-warn">📷 foto</span>' : '') + '<div class="small muted">' + esc(m.distritoNombre) + '</div>',
        '<b>' + esc(m.horario) + '</b>', '<span class="small">' + esc(m.resumen) + '</span>',
        '<button class="btn btn-sm" onclick="personalMalla(\'' + m.id + '\')">👥 ' + m.nAsignados + '</button>', cumpl,
        '<div class="acciones"><button class="btn btn-sm" onclick="verCumplimiento(\'' + m.id + '\')">📈</button><button class="btn btn-sm" title="Descargar PDF" onclick="pdfMalla(\'' + m.id + '\', this)">📄 PDF</button><button class="btn btn-sm" title="Editar" onclick="formMalla(\'' + m.id + '\')">✏️</button>' +
        '<button class="btn btn-sm" title="Copiar a otras fechas" onclick="duplicarMalla(\'' + m.id + '\')">⧉</button>' +
        '<button class="btn btn-sm btn-danger" onclick="eliminarMalla(\'' + m.id + '\')">🗑</button></div>'];
    }), 'No hay mallas vigentes en el rango de fechas.');
  });
}

async function formMalla(id) {
  var d0 = val('#maDesde') || hoy();
  var base = { malla: { nombre: '', fecha: d0, fechaHasta: d0, distritoId: val('#maDist') || distDefecto(), modo: 'INDIVIDUAL', tolerancia: CFG.tolerancia, observacion: '', exigirFoto: CFG.fotoObligatoria === false ? 'NO' : 'SI' }, puntos: [], asignados: [] };
  if (id) { try { base = await apiT('mallaObtener', id); } catch (e) { toast(e.message, 'err'); return; } }
  var m = base.malla;
  MF = { id: id || '', puntos: base.puntos.map(function (p) { return { id: p.id, qrId: p.qrId, hora: p.hora }; }), qrs: [], map: null };
  modal(id ? 'Editar malla operativa' : 'Nueva malla operativa',
    '<div class="form-grid">' +
    '<div class="full"><label>Nombre de la malla / red</label><input id="mfNom" value="' + esc(m.nombre) + '" placeholder="Ej: PATRULLA 1 - MAÑANA"></div>' +
    '<div><label>Vigente desde</label><input type="date" id="mfFecha" value="' + esc(m.fecha) + '" onchange="if($(\'#mfHasta\').value<this.value)$(\'#mfHasta\').value=this.value"></div>' +
    '<div><label>Vigente hasta</label><input type="date" id="mfHasta" value="' + esc(m.fechaHasta || m.fecha) + '"></div>' +
    (esSuper() ? '<div><label>Distrito / Servicio</label><select id="mfDist" onchange="cargarMFDistrito(this.value)">' + opcionesDistrito(m.distritoId) + '</select></div>' : '') +
    '<div><label>Modalidad</label><select id="mfModo"><option value="INDIVIDUAL"' + (m.modo === 'INDIVIDUAL' ? ' selected' : '') + '>Individual (cada uno escanea)</option><option value="GRUPAL"' + (m.modo === 'GRUPAL' ? ' selected' : '') + '>Grupal (basta uno del grupo)</option></select></div>' +
    '<div><label>Tolerancia (± min)</label><input type="number" min="0" id="mfTol" value="' + esc(m.tolerancia) + '"></div>' +
    '<div style="display:flex;align-items:flex-end"><label style="display:flex;gap:8px;align-items:center;color:var(--texto);font-size:14px;margin:0 0 10px"><input type="checkbox" id="mfFoto"' + (m.exigirFoto !== 'NO' ? ' checked' : '') + '> 📷 Exigir foto de evidencia (reto al azar)</label></div>' +
    '<div class="full"><label>Observación</label><input id="mfObs" value="' + esc(m.observacion) + '"></div>' +
    '</div>' +
    '<div class="mt"><h3>Monedas de la malla (punto y hora)</h3>' +
    '<div class="add-qr"><div><label>Punto</label><select id="mfQr"></select></div>' +
    '<div><label>Hora(s) de la moneda <span style="color:var(--rojo)">*</span></label><div id="mfHoras" class="horas"></div></div>' +
    '<div style="align-self:end"><button class="btn btn-primary" onclick="agregarPuntoMF()">+ Agregar a la malla</button></div></div>' +
    '<div class="row mb"><span class="small muted grow">La hora es obligatoria. Un mismo punto puede tener varias monedas a distintas horas. Se ordenan por hora automáticamente.</span><button class="btn btn-sm" onclick="if(MF.puntos.length&&confirm(\'¿Quitar todos los puntos?\')){MF.puntos=[];renderMFPuntos()}">Vaciar</button></div>' +
    '<div class="pt-list" id="mfPuntos"></div></div>' +
    '<div class="mt"><div id="mfMap" class="map map-sm"></div></div>' +
    '<p class="small muted mt">👥 El personal se asigna desde la pantalla <b>Usuarios</b> (o con el botón 👥 de la malla).</p>' +
    '<div class="modal-foot">' +
    '<button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="mfBtn" onclick="guardarMalla()">Guardar malla</button></div>', true);
  setTimeout(async function () {
    if (!document.getElementById('mfMap')) return;
    cargarMFDistrito(esSuper() ? val('#mfDist') : USER.distritoId);
    try { var map = await gmMapa($('#mfMap')); if (MF && document.getElementById('mfMap')) { MF.map = map; renderMFPuntos(); } } catch (e) { toast(e.message, 'err'); }
  }, 100);
}
async function cargarMFDistrito(dId) {
  try {
    MF.qrs = await apiT('qrsListar', { distritoId: dId });
    var ids = MF.qrs.map(function (q) { return q.id; });
    MF.puntos = MF.puntos.filter(function (p) { return ids.indexOf(p.qrId) > -1; });
    $('#mfQr').innerHTML = MF.qrs.map(function (q) { return '<option value="' + q.id + '">' + q.numero + ' · ' + esc(q.nombre) + '</option>'; }).join('') || '<option value="">No hay puntos en este distrito</option>';
    $('#mfQr').onchange = function () { var q = MF.qrs.find(function (x) { return x.id === val('#mfQr'); }); MF.horasAdd = [q && q.hora ? q.hora : '']; renderHorasAdd(); };
    $('#mfQr').onchange();
    renderMFPuntos();
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
/* Horas a agregar para el punto seleccionado (una o varias, mínimo una) */
function renderHorasAdd() {
  var h = MF.horasAdd && MF.horasAdd.length ? MF.horasAdd : [''];
  $('#mfHoras').innerHTML = h.map(function (x, i) {
    return '<span class="hchip"><input type="time" value="' + esc(x) + '" onchange="MF.horasAdd[' + i + ']=this.value">' +
      (h.length > 1 ? '<button class="x" title="Quitar hora" onclick="MF.horasAdd.splice(' + i + ',1);renderHorasAdd()">×</button>' : '') + '</span>';
  }).join('') + '<button class="btn btn-sm" onclick="MF.horasAdd.push(\'\');renderHorasAdd()">+ otra hora</button>';
  MF.horasAdd = h;
}
function ordenarPuntosMF() {
  MF.puntos.sort(function (a, b) { return (a.hora || '99:99') < (b.hora || '99:99') ? -1 : (a.hora || '99:99') > (b.hora || '99:99') ? 1 : 0; });
}
function agregarPuntoMF() {
  var id = val('#mfQr'); if (!id) return;
  var horas = $$('#mfHoras input').map(function (i) { return i.value; }).filter(Boolean);
  if (!horas.length) { toast('Ingrese al menos una hora para el punto.', 'err'); $('#mfHoras input').focus(); return; }
  var q = MF.qrs.find(function (x) { return x.id === id; });
  var rep = horas.filter(function (h) { return MF.puntos.some(function (p) { return p.qrId === id && p.hora === h; }); });
  if (rep.length) { toast(q.nombre + ' ya tiene moneda a las ' + rep.join(', ') + '.', 'err'); return; }
  horas.forEach(function (h) { MF.puntos.push({ qrId: id, hora: h }); });
  ordenarPuntosMF(); MF.horasAdd = ['']; renderHorasAdd(); renderMFPuntos();
  toast(q.nombre + ': ' + horas.length + (horas.length > 1 ? ' monedas agregadas.' : ' moneda agregada a las ' + horas[0] + '.'), 'ok');
}
function quitarPuntoMF(i) { MF.puntos.splice(i, 1); renderMFPuntos(); }
function cambiarHoraMF(i, v) { MF.puntos[i].hora = v; ordenarPuntosMF(); renderMFPuntos(); }
function renderMFPuntos() {
  var qm = {}; MF.qrs.forEach(function (q) { qm[q.id] = q; });
  $('#mfPuntos').innerHTML = MF.puntos.map(function (p, i) {
    var q = qm[p.qrId] || { numero: '?', nombre: '(no disponible)' };
    return '<div class="pt"><span class="num-icon"><span style="background:var(--azul)">' + (i + 1) + '</span></span><div>🪙 <b>' + esc(q.nombre) + '</b> <span class="small muted">punto ' + q.numero + '</span></div>' +
      '<input type="time" required value="' + esc(p.hora) + '" style="' + (p.hora ? '' : 'border:2px solid var(--rojo);background:#fde2e2') + '" onchange="cambiarHoraMF(' + i + ', this.value)">' +
      '<div class="acciones"><button class="btn btn-sm btn-danger" title="Quitar" onclick="quitarPuntoMF(' + i + ')">✕</button></div></div>';
  }).join('') || '<div class="muted small">Agregue los puntos en el orden en que deben escanearse.</div>';
  if (MF.map) {
    if (MF.capa) MF.capa.setMap(null);
    MF.capa = new Capa();
    var line = [];
    MF.puntos.forEach(function (p, i) {
      var q = qm[p.qrId]; if (!q) return;
      line.push([q.lat, q.lng]);
      MF.capa.add(gmCirculo(q.lat, q.lng, CFG.radio, '#1a4fa3', .25));
      MF.capa.add(gmNum(MF.map, q.lat, q.lng, i + 1, '#0b2e6b', null, q.nombre + ' ' + (p.hora || '')));
    });
    if (line.length > 1) MF.capa.add(gmLinea(line, '#1a4fa3', 3, false, true));
    MF.capa.setMap(MF.map);
    var all = line.length ? line : MF.qrs.map(function (q) { return [q.lat, q.lng]; });
    gmAjustar(MF.map, all, 17);
  }
}
async function guardarMalla() {
  if (!MF.puntos.length) { toast('Agregue al menos una moneda (punto y hora).', 'err'); return; }
  if (MF.puntos.some(function (p) { return !p.hora; })) { toast('Todas las monedas deben tener hora (marcadas en rojo).', 'err'); return; }
  await run($('#mfBtn'), async function () {
    var r = await apiT('mallaGuardar', {
      id: MF.id, nombre: val('#mfNom'), fecha: val('#mfFecha'), fechaHasta: val('#mfHasta'), distritoId: esSuper() ? val('#mfDist') : USER.distritoId,
      modo: val('#mfModo'), tolerancia: val('#mfTol'), observacion: val('#mfObs'), exigirFoto: $('#mfFoto').checked,
      puntos: MF.puntos
    });
    cerrarModal();
    toast(MF.id ? 'Malla actualizada.' : 'Malla creada. Ahora asigne el personal desde la pantalla Usuarios.', 'ok', 7000);
    cargarMallas();
  });
}
function celdaCumpl(s, grupo) {
  if (!s) return '<span class="badge b-gray">Pendiente</span>';
  if (s.noCumplido) return '<div class="nocump">❌ NO CUMPLIDO</div>' + (s.motivo ? '<div class="small" style="color:var(--rojo);font-weight:600;margin-top:4px">' + esc(s.motivo) + '</div>' : '<div class="small" style="color:var(--rojo);margin-top:4px">No se presentó en su horario</div>') + (grupo && s.nombres ? '<div class="small">' + esc(s.grado + ' ' + s.nombres) + '</div>' : '');
  if (s.validez !== 'VALIDO') return '<span class="small">' + s.hora + '</span> ' + badgeValidez(s.validez) + (s.motivo ? '<div class="small" style="color:var(--rojo)">' + esc(s.motivo) + '</div>' : '') + (grupo ? '<div class="small">' + esc(s.grado + ' ' + s.nombres) + '</div>' : '');
  return '<b>' + s.hora + '</b> ' + badgeHora(s.estadoHora) + ' <span class="small muted">' + difTxt(s.minutosDif) + '</span>' +
    (s.ordenCorrecto === 'NO' ? '<br><span class="badge b-bad">Fuera de orden</span>' : '') + (s.nFotos ? ' <button class="btn btn-sm" onclick="verFoto(\'' + s.id + '\',0)">📷</button>' : '') +
    (grupo ? '<br><span class="small">' + esc(s.grado + ' ' + s.nombres) + '</span>' : '');
}
async function verCumplimiento(id, dia) {
  try {
    var c = await apiT('mallaCumplimiento', id, dia || '');
    var cols = ['Orden', 'Punto', 'Hora / ventana'].concat(c.columnas.map(function (x) { return esc(x.nombre); }));
    var filas = c.filas.map(function (f) {
      return ['<b>' + f.orden + '</b>', '🪙 <b>' + esc(f.qrNombre) + '</b> <span class="small muted">P' + f.qrNumero + '</span>', '<b>' + esc(f.hora) + '</b><div class="small muted">' + esc(f.desde) + '–' + esc(f.hasta) + '</div>'].concat(c.columnas.map(function (col) { return celdaCumpl(f.celdas[col.id], col.id === 'GRUPO'); }));
    });
    var vig = c.malla.fecha === c.malla.fechaHasta ? c.malla.fecha : c.malla.fecha + ' a ' + c.malla.fechaHasta;
    modal('Cumplimiento · ' + c.malla.nombre,
      '<div class="row mb"><span class="badge">Vigencia ' + esc(vig) + '</span><span class="badge">' + esc(c.distritoNombre) + '</span><span class="badge">' + c.malla.modo + '</span><span class="badge">±' + c.malla.tolerancia + ' min</span>' +
      '<span class="grow"></span><label style="margin:0">Día</label><input type="date" style="width:170px" min="' + c.malla.fecha + '" max="' + c.malla.fechaHasta + '" value="' + c.dia + '" onchange="verCumplimiento(\'' + id + '\', this.value)"></div>' +
      '<div class="stats"><div class="stat"><div class="n">' + c.pct + '%</div><div class="l">Cumplimiento del ' + esc(c.dia) + '</div></div><div class="stat"><div class="n">' + c.hechos + '/' + c.total + '</div><div class="l">Puntos válidos</div></div><div class="stat"><div class="n">' + c.aTiempo + '</div><div class="l">A tiempo</div></div>' +
      '<div class="stat" style="' + (c.noCumplidos ? 'background:#cf3b3b;border-color:#cf3b3b' : '') + '"><div class="n" style="' + (c.noCumplidos ? 'color:#fff' : '') + '">' + c.noCumplidos + '</div><div class="l" style="' + (c.noCumplidos ? 'color:#fff;font-weight:700' : '') + '">❌ No cumplidos</div></div></div>' +
      tabla(cols, filas), true);
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function duplicarMalla(id) {
  modal('Copiar malla a otras fechas', '<p class="small muted">Se crea una nueva malla con los mismos puntos, horarios y personal.</p><div class="form-grid"><div><label>Desde</label><input type="date" id="dupF" value="' + hoy() + '"></div><div><label>Hasta</label><input type="date" id="dupH" value="' + hoy() + '"></div></div>' +
    '<p class="small muted mt">Si alguien del personal tendría cruce de horario con otra de sus mallas, el sistema lo avisará y no copiará.</p>' +
    '<div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="dupBtn">Copiar</button></div>');
  $('#dupBtn').onclick = function () {
    run($('#dupBtn'), async function () {
      await apiT('mallaDuplicar', id, val('#dupF'), false, val('#dupH'));
      cerrarModal(); toast('Malla copiada con sus puntos, horarios y personal.', 'ok'); cargarMallas();
    });
  };
}

/* ---- Personal de la malla: quitar, agregar, transferir ---- */
async function personalMalla(id) {
  try {
    var r = await Promise.all([apiT('mallaObtener', id), apiT('mallasDestino', id)]);
    var o = r[0], destinos = r[1];
    var pols = await apiT('usuariosListar', { distritoId: o.malla.distritoId, rol: 'POLICIA', estado: 'ACTIVO' });
    var dentro = {}; o.asignados.forEach(function (a) { dentro[a.id] = 1; });
    var optsDest = destinos.map(function (d) { return '<option value="' + d.id + '">' + esc(d.nombre) + ' · ' + esc(d.vigencia) + ' · ' + esc(d.horario) + '</option>'; }).join('');
    modal('👥 Personal · ' + o.malla.nombre,
      '<p class="small muted">' + o.asignados.length + ' servidores asignados. Los cambios se aplican de inmediato.</p>' +
      tabla(['Grado y nombres', 'Cédula', 'Acciones'], o.asignados.map(function (a) {
        return ['<b>' + esc(a.grado) + '</b> ' + esc(a.nombres), esc(a.cedula),
          '<div class="acciones"><button class="btn btn-sm" onclick="abrirTransferir(\'' + id + '\',\'' + a.id + '\')"' + (destinos.length ? '' : ' disabled title="No hay otras mallas vigentes"') + '>⇄ Transferir</button>' +
          '<button class="btn btn-sm btn-danger" onclick="quitarDeMalla(\'' + id + '\',\'' + a.id + '\')">Quitar</button></div>'];
      })) +
      '<div id="trBox" class="card mt" hidden><h3 id="trTit"></h3><label>Malla destino</label><select id="trDest">' + optsDest + '</select>' +

      '<div class="modal-foot"><button class="btn" onclick="$(\'#trBox\').hidden=true">Cancelar</button><button class="btn btn-primary" id="trBtn">Transferir</button></div></div>' +
      '<div class="card mt"><h3>Agregar servidor</h3><div class="row"><select id="addPol" class="grow" style="width:auto">' +
      pols.filter(function (u) { return !dentro[u.id]; }).map(function (u) { return '<option value="' + u.id + '">' + esc(u.grado + ' ' + u.nombres) + ' · ' + esc(u.cedula) + '</option>'; }).join('') +
      '</select><button class="btn btn-primary" id="addBtn" onclick="agregarAMalla(\'' + id + '\')">+ Agregar</button></div></div>', true);
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function abrirTransferir(mallaId, uid) {
  var tr = $('#trBox'); tr.hidden = false;
  var fila = Array.prototype.find.call(document.querySelectorAll('#mBody tr'), function (r) { return r.innerHTML.indexOf("abrirTransferir('" + mallaId + "','" + uid + "')") > -1; });
  $('#trTit').textContent = 'Transferir a ' + (fila ? fila.cells[0].textContent : '');
  $('#trBtn').onclick = function () {
    run($('#trBtn'), async function () {
      var msg = await apiT('mallaTransferir', mallaId, uid, val('#trDest'), false);
      toast(msg, 'ok', 6000); personalMalla(mallaId); cargarMallas();
    });
  };
  tr.scrollIntoView({ behavior: 'smooth' });
}
async function quitarDeMalla(mallaId, uid) {
  if (!await confirmar('¿Quitar a este servidor de la malla?', 'Quitar')) { personalMalla(mallaId); return; }
  try { toast(await apiT('mallaQuitarPolicia', mallaId, uid), 'ok'); } catch (e) { if (!e.silent) toast(e.message, 'err', 8000); }
  personalMalla(mallaId); cargarMallas();
}
async function agregarAMalla(mallaId) {
  var uid = val('#addPol'); if (!uid) return;
  await run($('#addBtn'), async function () {
    toast(await apiT('mallaAgregarPolicia', mallaId, uid, false), 'ok', 6000);
    personalMalla(mallaId); cargarMallas();
  });
}

/* ---- PDF de la malla (se genera en el navegador) ---- */
var _pdfLibs = null;
function cargarScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('No se pudo cargar ' + src)); }; document.head.appendChild(s); }); }
function cargarPDF() {
  if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
  if (!_pdfLibs) _pdfLibs = cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    .then(function () { return cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'); })
    .catch(function (e) { _pdfLibs = null; throw e; });
  return _pdfLibs;
}
function fCorta(f) { var p = String(f || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
async function pdfMalla(id, btn) {
  await run(btn, async function () {
    var r = await Promise.all([apiT('mallaObtener', id), cargarPDF()]);
    var o = r[0], m = o.malla;
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), azul = [11, 46, 107];
    // Encabezado
    doc.setFillColor.apply(doc, azul); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(INSTITUCION.toUpperCase() + ' · ' + APP_NOMBRE.toUpperCase(), 14, 9);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('MALLA OPERATIVA: ' + m.nombre, 14, 18);
    doc.setTextColor(29, 36, 51);
    var horas = o.puntos.map(function (p) { return p.hora; }).filter(Boolean).sort();
    var vig = m.fecha === m.fechaHasta ? fCorta(m.fecha) : 'Del ' + fCorta(m.fecha) + ' al ' + fCorta(m.fechaHasta);
    var info = [['Distrito / Servicio', o.distritoNombre], ['Vigencia', vig], ['Horario', horas.length ? horas[0] + ' a ' + horas[horas.length - 1] : 'Libre'],
      ['Modalidad', m.modo === 'GRUPAL' ? 'Grupal (basta que un integrante escanee cada punto)' : 'Individual (cada integrante escanea cada punto)'],
      ['Tolerancia', '± ' + m.tolerancia + ' minutos'], ['Personal asignado', o.asignados.length + (o.asignados.length === 1 ? ' servidor' : ' servidores')]];
    if (m.observacion) info.push(['Observación', m.observacion]);
    doc.autoTable({ startY: 31, body: info, theme: 'plain', styles: { fontSize: 10, cellPadding: 1.4 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42, textColor: [107, 118, 144] } }, margin: { left: 14, right: 14 } });
    // Puntos
    var y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor.apply(doc, azul); doc.text('PUNTOS Y HORARIOS (en orden de escaneo)', 14, y);
    doc.autoTable({
      startY: y + 3, head: [['Orden', 'Punto', 'Lugar (moneda)', 'Hora', 'Ubicación']],
      body: o.puntos.map(function (p) { return [p.orden, 'N° ' + p.qrNumero, p.qrNombre + (p.descripcion ? '\n' + p.descripcion : ''), p.hora || 'Libre', 'Abrir mapa']; }),
      headStyles: { fillColor: azul, fontSize: 10 }, styles: { fontSize: 10, cellPadding: 2.2, valign: 'middle' },
      columnStyles: { 0: { halign: 'center', cellWidth: 16, fontStyle: 'bold' }, 1: { cellWidth: 18, fontStyle: 'bold' }, 3: { halign: 'center', cellWidth: 20, fontStyle: 'bold' }, 4: { cellWidth: 26, textColor: [26, 79, 163] } },
      margin: { left: 14, right: 14 },
      didDrawCell: function (d) {
        if (d.section === 'body' && d.column.index === 4) { var p = o.puntos[d.row.index]; doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng }); }
      }
    });
    y = doc.lastAutoTable.finalY + 5;
    var ruta = o.puntos.filter(function (p) { return p.lat; }).map(function (p) { return p.lat + ',' + p.lng; });
    if (ruta.length) { doc.setFontSize(10); doc.setTextColor(26, 79, 163); doc.textWithLink('>> Ver la ruta completa en Google Maps', 14, y, { url: 'https://www.google.com/maps/dir/' + ruta.join('/') }); y += 4; }
    // Personal
    y += 5; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor.apply(doc, azul); doc.text('PERSONAL ASIGNADO', 14, y);
    doc.autoTable({
      startY: y + 3, head: [['N°', 'Grado', 'Apellidos y nombres', 'Cédula', 'Teléfono']],
      body: o.asignados.map(function (a, i) { return [i + 1, a.grado || '', a.nombres, a.cedula, a.telefono || '']; }),
      headStyles: { fillColor: azul, fontSize: 10 }, styles: { fontSize: 10, cellPadding: 2 }, columnStyles: { 0: { halign: 'center', cellWidth: 12 } }, margin: { left: 14, right: 14 }
    });
    // Instrucciones
    y = doc.lastAutoTable.finalY + 8;
    var inst = ['1. Abra la app de patrullaje: verá sus monedas del día (con su grado y nombre) en el mapa.',
      '2. Llegue a cada moneda en su hora (± ' + m.tolerancia + ' min). Antes de la hora la moneda se ve opaca y no se puede atrapar.',
      '3. A menos de ' + (CFG.geocerca || 30) + ' m, abra la cámara, gire hacia la dirección indicada y toque la moneda (se toma la foto de evidencia).',
      'App de patrullaje: ' + (APP_URL || '')].filter(Boolean);
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(29, 36, 51); doc.text('INSTRUCCIONES', 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    inst.forEach(function (t, i) { doc.text(doc.splitTextToSize(t, W - 28), 14, y + 6 + i * 6); });
    // Pie de página
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(107, 118, 144);
      doc.text('Generado el ' + new Date().toLocaleString('es-EC') + ' por ' + USER.nombres, 14, 290);
      doc.text('Página ' + i + ' de ' + n, W - 14, 290, { align: 'right' });
    }
    doc.save('Malla_' + m.nombre.replace(/[^\w]+/g, '_') + '_' + m.fecha + (m.fechaHasta !== m.fecha ? '_al_' + m.fechaHasta : '') + '.pdf');
  });
}
async function eliminarMalla(id) {
  if (!await confirmar('¿Eliminar esta malla operativa?', 'Eliminar')) return;
  try { toast(await apiT('mallaEliminar', id), 'ok'); cargarMallas(); } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- USUARIOS + CENTRO DE ASIGNACIÓN ---------------- */
var USEL = {};
async function cargarUsuarios() {
  try { USUARIOS = await apiT('usuariosListar', { distritoId: val('#uDist'), rol: val('#uRol'), estado: val('#uEstado') }); USEL = {}; renderUsuarios(); } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function chipsMallas(u) {
  return (u.mallas || []).map(function (m) { return '<span class="mchip" title="' + esc(m.vigencia + ' · ' + m.horario) + '"><b>' + esc(m.nombre) + '</b> · ' + esc(m.horario) + '</span>'; }).join('') || '<span class="small muted">Sin malla</span>';
}
function filtrarUsuarios() {
  var b = val('#uBuscar').toLowerCase(), bc = normCedula(b), fa = val('#uAsig');
  return USUARIOS.filter(function (u) {
    var n = (u.mallas || []).length;
    if (fa !== '' && (u.rol !== 'POLICIA' || (fa === '0' && n) || (fa === '1' && n !== 1) || (fa === '2' && n < 2))) return false;
    return !b || (u.nombres + ' ' + u.email).toLowerCase().indexOf(b) > -1 || (bc && u.cedula.indexOf(bc) > -1) || u.cedula.indexOf(b) > -1;
  });
}
function renderUsuarios() {
  var l = filtrarUsuarios();
  var head = ['<input type="checkbox" title="Seleccionar todos" onchange="selTodosU(this.checked)">', 'Cédula', 'Grado y nombres', 'Rol / Estado', 'Mallas asignadas (vigentes)', 'Acciones'];
  var filas = l.map(function (u) {
    var self = u.id === USER.id, pol = u.rol === 'POLICIA', n = (u.mallas || []).length;
    var asig = pol && u.estado === 'ACTIVO' ? '<button class="btn btn-sm btn-primary" onclick="modalAsignar([\'' + u.id + '\'])">📅 Asignar</button>' +
      (n ? '<button class="btn btn-sm" onclick="modalMover(\'' + u.id + '\')">⇄ Mover</button><button class="btn btn-sm" onclick="limpiarUsuarios([\'' + u.id + '\'])">🧹 Limpiar</button>' : '') : '';
    return {
      cls: pol ? (n >= 2 ? 'a2' : n === 1 ? 'a1' : 'a0') : '',
      celdas: [pol && u.estado === 'ACTIVO' ? '<input type="checkbox" class="uchk" value="' + u.id + '"' + (USEL[u.id] ? ' checked' : '') + ' onchange="USEL[this.value]=this.checked;contarU()">' : '',
        esc(u.cedula), '<b>' + esc(u.grado) + '</b> ' + esc(u.nombres) + (u.telefono ? '<div class="small muted">' + esc(u.telefono) + '</div>' : '') + (esSuper() ? '<div class="small muted">' + esc(u.distritoNombre || '—') + '</div>' : ''),
        '<span class="badge">' + u.rol + '</span> ' + badgeEstado(u.estado) + '<div class="small muted">Últ. acceso: ' + esc(u.ultimoAcceso || '—') + '</div>',
        pol ? chipsMallas(u) : '<span class="small muted">—</span>',
        '<div class="acciones">' + (u.estado === 'PENDIENTE' ? '<button class="btn btn-sm btn-ok" onclick="estadoUsr(\'' + u.id + '\',\'ACTIVO\')">✔ Aprobar</button>' : '') + asig +
        '<button class="btn btn-sm" title="Editar" onclick="formUsuario(\'' + u.id + '\')">✏️</button>' +
        (self ? '' : '<button class="btn btn-sm" title="Restablecer clave (= cédula)" onclick="resetUsr(\'' + u.id + '\')">🔑</button>' +
          (u.estado === 'ACTIVO' ? '<button class="btn btn-sm btn-danger" title="Desactivar usuario" onclick="estadoUsr(\'' + u.id + '\',\'INACTIVO\')">⛔</button>' : u.estado === 'INACTIVO' ? '<button class="btn btn-sm" onclick="estadoUsr(\'' + u.id + '\',\'ACTIVO\')">Activar</button>' : '')) + '</div>']
    };
  });
  if (!filas.length) { $('#uTabla').innerHTML = '<div class="card muted center">No hay usuarios.</div>'; contarU(); return; }
  $('#uTabla').innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
    filas.map(function (f) { return '<tr class="' + f.cls + '">' + f.celdas.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  contarU();
}
function selTodosU(on) { $$('.uchk').forEach(function (c) { c.checked = on; USEL[c.value] = on; }); contarU(); }
function seleccionU() { return Object.keys(USEL).filter(function (k) { return USEL[k]; }); }
function contarU() { var n = seleccionU().length; $('#uSelN').textContent = n + (n === 1 ? ' seleccionado' : ' seleccionados'); }
function asignarSeleccionados() { var ids = seleccionU(); if (!ids.length) { toast('Marque los usuarios en la primera columna.', 'err'); return; } modalAsignar(ids); }
function limpiarSeleccionados() { var ids = seleccionU(); if (!ids.length) { toast('Marque los usuarios en la primera columna.', 'err'); return; } limpiarUsuarios(ids); }
function nombreU(id) { var u = USUARIOS.find(function (x) { return x.id === id; }); return u ? (u.grado + ' ' + u.nombres).trim() : id; }

/** Lista de mallas vigentes/futuras con casillas */
function listaMallasHTML(mallas, marcadas, bloqueadas) {
  if (!mallas.length) return '<div class="card muted center">No hay mallas vigentes. Créelas primero en "Malla operativa".</div>';
  return '<div class="chk-list" style="max-height:340px">' + mallas.map(function (m) {
    var bl = bloqueadas && bloqueadas[m.id];
    return '<label style="padding:8px 6px;border-bottom:1px solid var(--borde)"><input type="checkbox" class="mchk" value="' + m.id + '"' + ((marcadas && marcadas[m.id]) || bl ? ' checked' : '') + (bl ? ' disabled' : '') + '>' +
      '<span style="flex:1"><b>' + esc(m.nombre) + '</b>' + (bl ? ' <span class="badge b-ok">ya asignado</span>' : '') + '<br><span class="small muted">📅 ' + esc(m.vigencia) + ' · 🕒 ' + esc(m.horario) + ' · 👥 ' + m.nAsignados + '</span></span></label>';
  }).join('') + '</div>';
}
async function mallasDelDistrito(uids) {
  var u = USUARIOS.find(function (x) { return x.id === uids[0]; });
  return apiT('mallasActivas', esSuper() ? (u ? u.distritoId : '') : USER.distritoId);
}
async function modalAsignar(uids) {
  try {
    var mallas = await mallasDelDistrito(uids);
    var ya = {};
    if (uids.length === 1) { var u = USUARIOS.find(function (x) { return x.id === uids[0]; }); (u.mallas || []).forEach(function (m) { ya[m.id] = 1; }); }
    modal('📅 Asignar a malla(s)',
      '<p><b>' + (uids.length === 1 ? esc(nombreU(uids[0])) : uids.length + ' usuarios seleccionados') + '</b></p>' +
      '<p class="small muted">Marque una o varias mallas. El sistema no permite asignar mallas que se crucen en fechas y horarios.</p>' + listaMallasHTML(mallas, {}, ya) +
      '<div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="asgBtn">Asignar</button></div>', true);
    $('#asgBtn').onclick = function () {
      var mids = $$('.mchk').filter(function (c) { return c.checked && !c.disabled; }).map(function (c) { return c.value; });
      if (!mids.length) { toast('Marque al menos una malla.', 'err'); return; }
      run($('#asgBtn'), async function () { var msg = await apiT('usuariosAsignar', uids, mids); cerrarModal(); toast(msg, 'ok', 6000); cargarUsuarios(); });
    };
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
async function modalMover(uid) {
  try {
    var u = USUARIOS.find(function (x) { return x.id === uid; });
    var mallas = await mallasDelDistrito([uid]);
    var opts = u.mallas.map(function (m) { return '<option value="' + m.id + '">' + esc(m.nombre) + ' · ' + esc(m.vigencia) + ' · ' + esc(m.horario) + '</option>'; }).join('');
    modal('⇄ Mover a otra(s) malla(s)',
      '<p><b>' + esc(nombreU(uid)) + '</b></p><label>Sacar de la malla</label><select id="movOrig" onchange="renderDestinosMover(\'' + uid + '\')">' + opts + '</select>' +
      '<label class="mt" style="margin-top:14px">Mover a (una o más)</label><div id="movDest"></div>' +
      '<div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="movBtn">Mover</button></div>', true);
    MF = { movMallas: mallas };
    renderDestinosMover(uid);
    $('#movBtn').onclick = function () {
      var mids = $$('.mchk').filter(function (c) { return c.checked && !c.disabled; }).map(function (c) { return c.value; });
      if (!mids.length) { toast('Marque al menos una malla destino.', 'err'); return; }
      run($('#movBtn'), async function () { var msg = await apiT('usuarioMover', uid, val('#movOrig'), mids); cerrarModal(); toast(msg, 'ok', 6000); cargarUsuarios(); });
    };
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function renderDestinosMover(uid) {
  var u = USUARIOS.find(function (x) { return x.id === uid; }), orig = val('#movOrig'), ya = {};
  (u.mallas || []).forEach(function (m) { if (m.id !== orig) ya[m.id] = 1; });
  $('#movDest').innerHTML = listaMallasHTML(MF.movMallas.filter(function (m) { return m.id !== orig; }), {}, ya);
}
async function limpiarUsuarios(uids) {
  if (!await confirmar('¿Retirar a ' + (uids.length === 1 ? nombreU(uids[0]) : uids.length + ' usuarios') + ' de TODAS sus mallas vigentes? Quedarán sin asignación.', 'Limpiar')) return;
  try { toast(await apiT('usuariosLimpiar', uids), 'ok', 6000); cargarUsuarios(); } catch (e) { if (!e.silent) toast(e.message, 'err', 8000); }
}
function formUsuario(id) {
  var u = id ? USUARIOS.find(function (x) { return x.id === id; }) : { cedula: '', nombres: '', grado: '', email: '', telefono: '', rol: 'POLICIA', distritoId: val('#uDist') || distDefecto() };
  var roles = esSuper() ? ['POLICIA', 'ADMIN', 'SUPERADMIN'] : ['POLICIA'];
  modal(id ? 'Editar usuario' : 'Nuevo usuario',
    '<div class="form-grid">' +
    '<div><label>Cédula (9 o 10 dígitos)</label><input id="fuCed" value="' + esc(u.cedula) + '" inputmode="numeric" maxlength="10" onblur="this.value=normCedula(this.value)"></div>' +
    '<div><label>Grado</label><select id="fuGrado"><option value="">—</option>' + GRADOS.map(function (g) { return '<option' + (g === u.grado ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></div>' +
    '<div class="full"><label>Apellidos y nombres</label><input id="fuNom" value="' + esc(u.nombres) + '"></div>' +
    '<div><label>Correo electrónico (opcional)</label><input id="fuMail" type="email" value="' + esc(u.email) + '"></div>' +
    '<div><label>Teléfono</label><input id="fuTel" value="' + esc(u.telefono) + '"></div>' +
    '<div' + (esSuper() ? '' : ' hidden') + '><label>Rol</label><select id="fuRol">' + roles.map(function (r) { return '<option' + (r === u.rol ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></div>' +
    '<div' + (esSuper() ? '' : ' hidden') + '><label>Distrito / Servicio</label><select id="fuDist"><option value="">— (solo Super Admin) —</option>' + opcionesDistrito(u.distritoId) + '</select></div>' +
    '</div>' + (id ? '' : '<p class="small muted">🔑 Usuario y clave inicial: su <b>número de cédula</b> (con o sin el 0). Deberá cambiarla en el primer ingreso. Luego asígnelo a sus mallas desde esta pantalla.</p>') +
    '<div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="fuBtn" onclick="guardarUsuario(\'' + (id || '') + '\')">Guardar</button></div>');
}
async function guardarUsuario(id) {
  await run($('#fuBtn'), async function () {
    var r = await apiT('usuarioGuardar', { id: id, cedula: val('#fuCed'), grado: val('#fuGrado'), nombres: val('#fuNom'), email: val('#fuMail'), telefono: val('#fuTel'), rol: esSuper() ? val('#fuRol') : 'POLICIA', distritoId: esSuper() ? val('#fuDist') : USER.distritoId });
    cerrarModal(); toast(r.mensaje, 'ok', 9000); cargarUsuarios();
  });
}
async function estadoUsr(id, estado) {
  try { toast(await apiT('usuarioEstado', id, estado), 'ok', 8000); cargarUsuarios(); } catch (e) { toast(e.message, 'err'); }
}
async function resetUsr(id) {
  if (!await confirmar('¿Restablecer la clave? Quedará como su número de cédula y deberá cambiarla al ingresar.', 'Restablecer')) return;
  try { toast(await apiT('usuarioResetClave', id), 'ok', 9000); } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- DISTRITOS ---------------- */
async function cargarDistritos() {
  try {
    DISTS_ALL = await apiT('distritosListar');
    DISTRITOS = DISTS_ALL;
    $('#diTabla').innerHTML = tabla(['Código', 'Nombre', 'Tipo', 'Descripción', 'Estado', 'Acciones'], DISTS_ALL.map(function (d) {
      return [esc(d.codigo), '<b>' + esc(d.nombre) + '</b>', '<span class="badge">' + esc(d.tipo) + '</span>', esc(d.descripcion), d.activo === 'SI' ? '<span class="badge b-ok">ACTIVO</span>' : '<span class="badge b-bad">INACTIVO</span>',
        '<div class="acciones"><button class="btn btn-sm" onclick="formDistrito(\'' + d.id + '\')">✏️</button><button class="btn btn-sm btn-danger" onclick="eliminarDistrito(\'' + d.id + '\')">🗑</button></div>'];
    }), 'Cree el primer distrito o servicio.');
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function formDistrito(id) {
  var d = id ? DISTS_ALL.find(function (x) { return x.id === id; }) : { nombre: '', tipo: 'DISTRITO', codigo: '', descripcion: '', activo: 'SI' };
  modal(id ? 'Editar' : 'Nuevo distrito / servicio',
    '<div class="form-grid"><div><label>Tipo</label><select id="fdTipo">' + TIPOS.map(function (t) { return '<option' + (t === d.tipo ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Código</label><input id="fdCod" value="' + esc(d.codigo) + '"></div>' +
    '<div class="full"><label>Nombre</label><input id="fdNom" value="' + esc(d.nombre) + '"></div>' +
    '<div class="full"><label>Descripción</label><input id="fdDesc" value="' + esc(d.descripcion) + '"></div>' +
    '<div><label>Estado</label><select id="fdAct"><option value="SI"' + (d.activo === 'SI' ? ' selected' : '') + '>Activo</option><option value="NO"' + (d.activo === 'NO' ? ' selected' : '') + '>Inactivo</option></select></div></div>' +
    '<div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="fdBtn" onclick="guardarDistrito(\'' + (id || '') + '\')">Guardar</button></div>');
}
async function guardarDistrito(id) {
  await run($('#fdBtn'), async function () {
    await apiT('distritoGuardar', { id: id, tipo: val('#fdTipo'), codigo: val('#fdCod'), nombre: val('#fdNom'), descripcion: val('#fdDesc'), activo: val('#fdAct') });
    cerrarModal(); toast('Guardado.', 'ok'); await cargarDistritos(); refrescarSelectsDistrito();
  });
}
async function eliminarDistrito(id) {
  if (!await confirmar('¿Eliminar este registro del catálogo?', 'Eliminar')) return;
  try { toast(await apiT('distritoEliminar', id), 'ok'); await cargarDistritos(); refrescarSelectsDistrito(); } catch (e) { toast(e.message, 'err'); }
}
function refrescarSelectsDistrito() {
  ['#dDist', '#mDist', '#cDist', '#maDist', '#qDist', '#uDist', '#rDist', '#eDist'].forEach(function (s) { var v = val(s); $(s).innerHTML = opcionesDistrito(v, true); $(s).value = v; });
}

/* ---------------- REPORTES ---------------- */
function filtrosReporte() { return { desde: val('#rDesde'), hasta: val('#rHasta'), distritoId: val('#rDist'), usuarioId: val('#rPol') }; }
async function consultarReporte(btn) {
  await run(btn, async function () {
    REPORTE = await apiT('escaneosListar', filtrosReporte());
    $('#rTabla').innerHTML = '<p class="muted small">' + REPORTE.length + ' registros</p>' + tablaEscaneos(REPORTE, false);
  });
}
function descargarCSV() {
  if (!REPORTE.length) { toast('Primero realice una consulta.', 'err'); return; }
  var cols = ['fechaHora', 'qrNumero', 'qrNombre', 'lat', 'lng', 'cedula', 'grado', 'nombres', 'validez', 'motivo', 'latDispositivo', 'lngDispositivo', 'distanciaM', 'precisionM', 'retos', 'mallaNombre', 'ordenEsperado', 'horaEsperada', 'minutosDif', 'estadoHora', 'ordenCorrecto', 'alerta'];
  var q = function (v) { v = String(v == null ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var csv = '\ufeff' + cols.join(';') + '\n' + REPORTE.map(function (r) { return cols.map(function (c) { return q(c === 'cedula' ? '\'' + r[c] : r[c]); }).join(';'); }).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'escaneos_' + val('#rDesde') + '_' + val('#rHasta') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
}
async function exportarReporte(btn) {
  await run(btn, async function () {
    var url = await apiT('exportarEscaneos', filtrosReporte());
    modal('Exportación lista', '<p>Se creó la hoja de cálculo en Google Drive.</p><p><a class="btn btn-primary" target="_blank" href="' + esc(url) + '">Abrir hoja</a></p>');
  });
}

/* ---------------- CUENTA ---------------- */
function renderCuenta() {
  $('#ctDatos').innerHTML = '<b>' + esc(USER.grado + ' ' + USER.nombres) + '</b><br>CI: ' + esc(USER.cedula) + '<br>' + esc(USER.email) + '<br>Rol: ' + esc(USER.rol) + (USER.distritoNombre ? '<br>Distrito: ' + esc(USER.distritoNombre) : '') +
    '<p class="small muted">Enlace de la app policial: <br><span style="word-break:break-all">' + esc(APP_URL) + '</span></p>';
}
async function cambiarMiClave(ev) {
  ev.preventDefault();
  if (val('#ctNew') !== val('#ctNew2')) { toast('Las claves no coinciden.', 'err'); return; }
  await run($('#ctBtn'), async function () {
    USER = await apiT('cambiarClave', val('#ctAct'), val('#ctNew'));
    ['#ctAct', '#ctNew', '#ctNew2'].forEach(function (s) { $(s).value = ''; });
    toast('Clave actualizada.', 'ok');
  });
}

/* =====================================================================
 *  PANEL DE CONTROL - lógica del cliente
 * ===================================================================== */
var TOKEN = null, USER = null, CFG = {}, DISTRITOS = [], GRADOS = [], TIPOS = [], APP_URL = baseUrl();
var LS_KEY = 'rp_panel_token';
var QRS = [], USUARIOS = [], MALLAS = [], DISTS_ALL = [], REPORTE = [];
var MF = null, MAP_ESC = null, MAP_COB = null, COB_DATA = null, LEY = { esc: [], cob: [] }, SEC = 'dash', DASH_TIMER = null;
var COLORES = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa6b8', '#d61f9b', '#7aa800', '#c97b00', '#008080', '#9a6324', '#800000', '#1f3a93', '#e0457b', '#2e8b57', '#6a5acd'];
var TITULOS = { dash: 'Tablero', mapa: 'Mapa de escaneos', cobertura: 'Rutas establecidas y cobertura', mallas: 'Malla operativa', qrs: 'Puntos QR', usuarios: 'Usuarios', distritos: 'Catálogo de distritos / servicios', reportes: 'Reporte de escaneos', cuenta: 'Mi cuenta' };

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
  if (MF && MF.map) { try { MF.map.remove(); } catch (e) { } MF.map = null; }
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
function urlQR(q) { return (APP_URL || '') + '?qr=' + q.token; }

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
  ['#dDist', '#mDist', '#cDist', '#maDist', '#qDist', '#uDist', '#rDist'].forEach(function (s) { $(s).innerHTML = opcionesDistrito(esSuper() ? '' : USER.distritoId, true); });
  ['#mDesde', '#mHasta', '#cFecha', '#maDesde', '#maHasta', '#rDesde', '#rHasta'].forEach(function (s) { $(s).value = hoy(); });
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
    dash: cargarDash, qrs: cargarQRs, usuarios: cargarUsuarios, distritos: cargarDistritos, mallas: function () { cargarMallas(); },
    mapa: function () { cargarPoliciasSelect('mPol', val('#mDist')); if (!MAP_ESC) consultarMapa(); else MAP_ESC.map.invalidateSize(); },
    cobertura: function () { if (!MAP_COB) consultarCobertura(); else MAP_COB.map.invalidateSize(); },
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
    var st = [['QR activos', d.qrs], ['Servidores activos', d.policias], ['Patrullando hoy', d.patrullandoHoy], ['Escaneos hoy', d.escaneosHoy], ['Mallas hoy', d.mallasHoy.length], ['Alertas hoy', d.alertasHoy], ['Registros pendientes', d.pendientes]];
    $('#dStats').innerHTML = st.map(function (s) { return '<div class="stat"><div class="n">' + s[1] + '</div><div class="l">' + s[0] + '</div></div>'; }).join('');
    $('#dMallas').innerHTML = tabla(['Malla', 'Distrito', 'Ruta', 'Asignados', 'Cumplimiento', ''], d.mallasHoy.map(function (m) {
      return ['<b>' + esc(m.nombre) + '</b><br><span class="badge">' + m.modo + '</span>', esc(m.distritoNombre), '<span class="small">' + esc(m.resumen) + '</span>', '<span class="small">' + esc(m.asignados.join(', ')) + '</span>',
        '<div class="progress"><div style="width:' + m.pct + '%"></div></div><span class="small">' + m.hechos + '/' + m.total + ' (' + m.pct + '%)</span>',
        '<button class="btn btn-sm" onclick="verCumplimiento(\'' + m.id + '\')">Detalle</button>'];
    }), 'No hay mallas programadas para hoy.');
    $('#dUlt').innerHTML = tablaEscaneos(d.ultimos, true);
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}

function tablaEscaneos(list, corto) {
  var cols = corto ? ['Hora', 'Servidor', 'QR / Lugar', 'Malla', 'Programado', 'Estado', 'Orden', 'Alerta']
    : ['Fecha / hora', 'Servidor', 'Cédula', 'QR / Lugar', 'Coordenadas', 'Malla', 'Orden esp.', 'Programado', 'Dif.', 'Estado', 'Orden OK', 'GPS (m)', 'Alerta'];
  return tabla(cols, list.map(function (e) {
    var serv = '<b>' + esc(e.grado + ' ' + e.nombres) + '</b>';
    var qr = '<b>QR ' + esc(e.qrNumero) + '</b> ' + esc(e.qrNombre);
    var ord = e.ordenCorrecto === 'SI' ? '<span class="badge b-ok">SÍ</span>' : e.ordenCorrecto === 'NO' ? '<span class="badge b-bad">NO</span>' : '';
    var al = e.alerta ? '<span class="badge b-bad">⚠ ' + esc(e.alerta) + '</span>' : '';
    if (corto) return [e.hora, serv, qr, esc(e.mallaNombre || 'Libre'), esc(e.horaEsperada || '-'), badgeHora(e.estadoHora) + ' <span class="small muted">' + difTxt(e.minutosDif) + '</span>', ord, al];
    return [esc(e.fechaHora), serv, esc(e.cedula), qr, '<a target="_blank" href="https://www.google.com/maps?q=' + e.lat + ',' + e.lng + '">' + Number(e.lat).toFixed(5) + ', ' + Number(e.lng).toFixed(5) + '</a>',
      esc(e.mallaNombre || 'Libre'), esc(e.ordenEsperado), esc(e.horaEsperada || '-'), difTxt(e.minutosDif), badgeHora(e.estadoHora), ord, esc(e.distanciaM), al];
  }), 'Sin escaneos.');
}

/* ---------------- MAPAS ---------------- */
function capasBase() {
  var o = { maxZoom: 21 };
  var esriImg = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var esriLbl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  var esriRoads = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
  return {
    'Calles (detallado)': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', Object.assign({ subdomains: 'abcd', maxNativeZoom: 20, attribution: '© OpenStreetMap © CARTO' }, o)),
    'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', Object.assign({ maxNativeZoom: 19, attribution: '© OpenStreetMap' }, o)),
    'Satélite': L.tileLayer(esriImg, Object.assign({ maxNativeZoom: 19, attribution: 'Imágenes © Esri' }, o)),
    'Satélite + calles y nombres': L.layerGroup([
      L.tileLayer(esriImg, Object.assign({ maxNativeZoom: 19, attribution: 'Imágenes © Esri' }, o)),
      L.tileLayer(esriRoads, Object.assign({ maxNativeZoom: 19 }, o)),
      L.tileLayer(esriLbl, Object.assign({ maxNativeZoom: 19 }, o))])
  };
}
function crearMapa(id) {
  var base = capasBase();
  var m = L.map(id, { layers: [base['Calles (detallado)']], maxZoom: 21 }).setView([-1.83, -78.18], 7);
  L.control.scale({ imperial: false }).addTo(m);
  var ctrl = L.control.layers(base, {}, { collapsed: true }).addTo(m);
  return { map: m, ctrl: ctrl };
}
function numIcon(n, color) {
  return L.divIcon({ className: 'num-icon', html: '<span style="background:' + color + '">' + n + '</span>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
}
function popupEsc(e) {
  return '<div class="pop"><b>' + esc(e.grado + ' ' + e.nombres) + '</b><br>CI: ' + esc(e.cedula) +
    '<br><b>QR ' + esc(e.qrNumero) + '</b> – ' + esc(e.qrNombre) +
    '<br>🕒 ' + esc(e.fechaHora) +
    (e.mallaNombre ? '<br>Malla: ' + esc(e.mallaNombre) + ' · orden ' + esc(e.ordenEsperado) : '<br>Escaneo libre') +
    '<br>Programado: ' + esc(e.horaEsperada || '-') + ' ' + badgeHora(e.estadoHora) + ' ' + difTxt(e.minutosDif) +
    (e.ordenCorrecto ? '<br>Orden correcto: ' + e.ordenCorrecto : '') +
    (e.distanciaM !== '' ? '<br>GPS celular a ' + esc(e.distanciaM) + ' m' : '') +
    (e.alerta ? '<br><span class="badge b-bad">⚠ ' + esc(e.alerta) + '</span>' : '') +
    '<br><a target="_blank" href="https://www.google.com/maps?q=' + e.lat + ',' + e.lng + '">Abrir en Google Maps</a></div>';
}
function toggleCapa(tipo, i, on) {
  var it = LEY[tipo][i], map = (tipo === 'esc' ? MAP_ESC : MAP_COB).map;
  if (on) it.layer.addTo(map); else map.removeLayer(it.layer);
}
function renderLeyenda(tipo, cont) {
  $(cont).innerHTML = LEY[tipo].length ? LEY[tipo].map(function (it, i) {
    return '<label class="it" style="font-weight:400;color:inherit;cursor:pointer"><input type="checkbox" ' + (it.on ? 'checked' : '') + ' onchange="toggleCapa(\'' + tipo + '\',' + i + ',this.checked)">' +
      '<span class="dot" style="background:' + it.color + '"></span><span class="grow">' + it.html + '</span></label>';
  }).join('') : '<div class="muted">Sin datos para los filtros.</div>';
}

async function consultarMapa(btn) {
  await run(btn, async function () {
    var r = await apiT('mapaEscaneos', { desde: val('#mDesde'), hasta: val('#mHasta'), distritoId: val('#mDist'), usuarioId: val('#mPol') });
    if (MAP_ESC) MAP_ESC.map.remove();
    MAP_ESC = crearMapa('mapEsc');
    var map = MAP_ESC.map, bounds = [];
    LEY.esc = [];
    var lq = L.layerGroup();
    r.qrs.forEach(function (q) {
      L.circleMarker([q.lat, q.lng], { radius: 5, color: '#555', weight: 1, fillColor: '#fff', fillOpacity: 1 }).bindTooltip('QR ' + q.numero + ' · ' + esc(q.nombre)).addTo(lq);
    });
    lq.addTo(map); MAP_ESC.ctrl.addOverlay(lq, 'Puntos QR registrados');
    LEY.esc.push({ layer: lq, color: '#999', html: '<b>Puntos QR</b> <span class="muted">(' + r.qrs.length + ')</span>', on: true });
    var grupos = {}, orden = [];
    r.escaneos.forEach(function (e) { if (!grupos[e.usuarioId]) { grupos[e.usuarioId] = []; orden.push(e.usuarioId); } grupos[e.usuarioId].push(e); });
    orden.forEach(function (uid, i) {
      var color = COLORES[i % COLORES.length], lg = L.layerGroup();
      var pts = grupos[uid].slice().sort(function (a, b) { return a.fechaHora < b.fechaHora ? -1 : 1; });
      var porDia = {};
      pts.forEach(function (e) { (porDia[e.fecha] = porDia[e.fecha] || []).push([Number(e.lat), Number(e.lng)]); });
      Object.keys(porDia).forEach(function (k) { if (porDia[k].length > 1) L.polyline(porDia[k], { color: color, weight: 3, opacity: .75, dashArray: '8 6' }).addTo(lg); });
      pts.forEach(function (e, k) {
        var ll = [Number(e.lat), Number(e.lng)]; bounds.push(ll);
        L.marker(ll, { icon: numIcon(k + 1, color) }).bindPopup(popupEsc(e)).addTo(lg);
        if (e.latDispositivo) L.circleMarker([Number(e.latDispositivo), Number(e.lngDispositivo)], { radius: 4, color: color, weight: 1, fillOpacity: .25, dashArray: '2 2' }).bindTooltip('GPS del celular (' + e.distanciaM + ' m del QR)').addTo(lg);
      });
      lg.addTo(map);
      var p = pts[0], nombre = p.grado + ' ' + p.nombres;
      MAP_ESC.ctrl.addOverlay(lg, '<span style="color:' + color + '">●</span> ' + esc(nombre) + ' (' + pts.length + ')');
      LEY.esc.push({ layer: lg, color: color, on: true, html: '<b>' + esc(nombre) + '</b><br><span class="muted">CI ' + esc(p.cedula) + ' · ' + pts.length + ' escaneos · ' + pts[0].hora + '–' + pts[pts.length - 1].hora + '</span>' });
    });
    renderLeyenda('esc', '#mLeyenda');
    if (!bounds.length) r.qrs.forEach(function (q) { bounds.push([q.lat, q.lng]); });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    if (!r.escaneos.length && btn) toast('No hay escaneos con esos filtros.');
  });
}

async function consultarCobertura(btn) {
  await run(btn, async function () {
    COB_DATA = await apiT('mapaCobertura', { fecha: val('#cFecha'), distritoId: val('#cDist') });
    dibujarCobertura();
  });
}
function dibujarCobertura() {
  if (!COB_DATA) return;
  var radio = Number(val('#cRadio')) || CFG.radio;
  if (MAP_COB) MAP_COB.map.remove();
  MAP_COB = crearMapa('mapCob');
  var map = MAP_COB.map, bounds = [];
  LEY.cob = [];
  var escPorPunto = {};
  COB_DATA.escaneos.forEach(function (e) { if (e.puntoId) escPorPunto[e.puntoId] = (escPorPunto[e.puntoId] || 0) + 1; });
  var unicos = {};
  COB_DATA.mallas.forEach(function (m, i) {
    var color = COLORES[i % COLORES.length], lg = L.layerGroup();
    var line = m.puntos.map(function (p) { return [p.lat, p.lng]; });
    if (line.length > 1) L.polyline(line, { color: color, weight: 4, opacity: .85 }).addTo(lg);
    var hechos = 0;
    m.puntos.forEach(function (p) {
      unicos[p.qrId] = [p.lat, p.lng]; bounds.push([p.lat, p.lng]);
      var ok = !!escPorPunto[p.id]; if (ok) hechos++;
      L.circle([p.lat, p.lng], { radius: radio, color: color, weight: 1.5, fillColor: color, fillOpacity: .3 }).addTo(lg);
      L.marker([p.lat, p.lng], { icon: numIcon(p.orden, color) }).bindPopup('<div class="pop"><b>' + esc(m.nombre) + '</b><br>Orden ' + p.orden + ': <b>QR ' + p.qrNumero + '</b> – ' + esc(p.qrNombre) +
        '<br>Hora programada: ' + esc(p.hora || 'libre') + '<br>Radio de cobertura: ' + radio + ' m<br>Integrantes: ' + esc(m.asignados.join(', ')) +
        '<br>Estado: ' + (ok ? '<span class="badge b-ok">Escaneado</span>' : '<span class="badge b-warn">Pendiente</span>') + '</div>').addTo(lg);
    });
    lg.addTo(map);
    var area = Math.round(m.puntos.length * Math.PI * radio * radio);
    MAP_COB.ctrl.addOverlay(lg, '<span style="color:' + color + '">■</span> ' + esc(m.nombre));
    LEY.cob.push({ layer: lg, color: color, on: true, html: '<b>' + esc(m.nombre) + '</b> <span class="badge">' + m.modo + '</span><br><span class="muted">' + m.puntos.length + ' puntos · ' + hechos + ' escaneados · ≈' + area.toLocaleString() + ' m²<br>' + esc(m.asignados.join(', ')) + '</span>' });
  });
  var lAll = L.layerGroup();
  COB_DATA.qrs.forEach(function (q) {
    L.circle([q.lat, q.lng], { radius: radio, color: '#555', weight: 1, fillColor: '#777', fillOpacity: .18 }).addTo(lAll);
    L.circleMarker([q.lat, q.lng], { radius: 3, color: '#333', fillOpacity: 1 }).bindTooltip('QR ' + q.numero + ' · ' + esc(q.nombre)).addTo(lAll);
  });
  var allOn = !COB_DATA.mallas.length;
  if (allOn) { lAll.addTo(map); COB_DATA.qrs.forEach(function (q) { bounds.push([q.lat, q.lng]); }); }
  MAP_COB.ctrl.addOverlay(lAll, 'Todos los puntos QR (' + radio + ' m)');
  LEY.cob.push({ layer: lAll, color: '#777', on: allOn, html: '<b>Todos los puntos QR</b><br><span class="muted">' + COB_DATA.qrs.length + ' puntos con radio de ' + radio + ' m</span>' });
  var lE = L.layerGroup();
  COB_DATA.escaneos.forEach(function (e) {
    L.circleMarker([Number(e.lat), Number(e.lng)], { radius: 6, color: '#fff', weight: 2, fillColor: '#15925a', fillOpacity: 1 }).bindPopup(popupEsc(e)).addTo(lE);
  });
  lE.addTo(map);
  MAP_COB.ctrl.addOverlay(lE, '✔ Escaneos realizados');
  LEY.cob.push({ layer: lE, color: '#15925a', on: true, html: '<b>Escaneos realizados</b><br><span class="muted">' + COB_DATA.escaneos.length + ' registros del día</span>' });
  var nU = Object.keys(unicos).length;
  LEY.cob.unshift({ layer: L.layerGroup(), color: 'transparent', on: false, html: '<b>Resumen ' + esc(COB_DATA.fecha) + '</b><br><span class="muted">' + COB_DATA.mallas.length + ' mallas · ' + nU + ' puntos únicos cubiertos · ≈' + Math.round(nU * Math.PI * radio * radio).toLocaleString() + ' m² de cobertura</span>' });
  renderLeyenda('cob', '#cLeyenda');
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
}

/* ---------------- PUNTOS QR ---------------- */
async function cargarQRs() {
  try { QRS = await apiT('qrsListar', { distritoId: val('#qDist') }); renderQRs(); } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function renderQRs() {
  var b = val('#qBuscar').toLowerCase();
  var l = QRS.filter(function (q) { return !b || String(q.numero) === b || q.nombre.toLowerCase().indexOf(b) > -1; });
  $('#qTabla').innerHTML = tabla(['<input type="checkbox" onchange="$$(\'.qchk\').forEach(function(c){c.checked=this.checked}.bind(this))">', 'N°', 'Lugar', 'Coordenadas', 'Hora', 'Distrito', 'Acciones'], l.map(function (q) {
    return ['<input type="checkbox" class="qchk" value="' + q.id + '">', '<b style="font-size:16px">' + q.numero + '</b>', '<b>' + esc(q.nombre) + '</b><br><span class="small muted">' + esc(q.descripcion) + '</span>',
      '<a target="_blank" href="https://www.google.com/maps?q=' + q.lat + ',' + q.lng + '">' + q.lat.toFixed(6) + ', ' + q.lng.toFixed(6) + '</a>', esc(q.hora || '—'), esc(q.distritoNombre),
      '<div class="acciones"><button class="btn btn-sm" onclick="verQR(\'' + q.id + '\')">🔳 Ver QR</button><button class="btn btn-sm" onclick="formQR(\'' + q.id + '\')">✏️ Editar</button><button class="btn btn-sm btn-danger" onclick="eliminarQR(\'' + q.id + '\')">🗑</button></div>'];
  }), 'No hay puntos QR. Cree el primero con "+ Nuevo QR".');
}
function formQR(id) {
  var q = id ? QRS.find(function (x) { return x.id === id; }) : null;
  var dId = q ? q.distritoId : (val('#qDist') || distDefecto());
  var sig = 1 + QRS.filter(function (x) { return x.distritoId === dId; }).reduce(function (m, x) { return Math.max(m, x.numero); }, 0);
  q = q || { numero: sig, nombre: '', descripcion: '', lat: '', lng: '', hora: '', distritoId: dId };
  modal(id ? 'Editar QR N° ' + q.numero : 'Nuevo punto QR',
    '<div class="form-grid">' +
    '<div><label>N° de orden</label><input type="number" min="1" id="fqNum" value="' + q.numero + '"></div>' +
    '<div><label>Hora programada (opcional)</label><input type="time" id="fqHora" value="' + esc(q.hora) + '"></div>' +
    '<div class="full"><label>Nombre del lugar</label><input id="fqNom" value="' + esc(q.nombre) + '" placeholder="Ej: Parque Central"></div>' +
    '<div class="full"><label>Descripción / referencia</label><input id="fqDesc" value="' + esc(q.descripcion) + '"></div>' +
    (esSuper() ? '<div class="full"><label>Distrito / Servicio</label><select id="fqDist">' + opcionesDistrito(q.distritoId) + '</select></div>' : '') +
    '<div class="full"><label>Pegar coordenadas (ej: -2.170998, -79.922359 o enlace de Google Maps)</label><input id="fqPaste" oninput="pegarCoords(this.value)"></div>' +
    '<div><label>Latitud</label><input id="fqLat" value="' + q.lat + '" oninput="moverMarcadorQR()"></div>' +
    '<div><label>Longitud</label><input id="fqLng" value="' + q.lng + '" oninput="moverMarcadorQR()"></div>' +
    '<div class="full"><div class="row mb"><span class="muted small grow">Haga clic en el mapa o arrastre el marcador para ubicar el punto.</span><button class="btn btn-sm" onclick="miUbicacionQR(this)">📍 Usar mi ubicación</button></div><div id="fqMap" class="map map-sm"></div></div>' +
    '</div><div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="fqBtn" onclick="guardarQR(\'' + (id || '') + '\')">Guardar</button></div>');
  setTimeout(function () {
    if (!document.getElementById('fqMap')) return;
    var mm = crearMapa('fqMap');
    MF = { map: mm.map, marker: null };
    if (q.lat) { MF.marker = L.marker([q.lat, q.lng], { draggable: true }).addTo(mm.map); mm.map.setView([q.lat, q.lng], 18); bindDrag(); }
    else if (QRS.length) mm.map.setView([QRS[0].lat, QRS[0].lng], 15);
    mm.map.on('click', function (ev) { $('#fqLat').value = ev.latlng.lat.toFixed(7); $('#fqLng').value = ev.latlng.lng.toFixed(7); moverMarcadorQR(true); });
    mm.map.invalidateSize();
  }, 120);
}
function bindDrag() { MF.marker.on('dragend', function () { var p = MF.marker.getLatLng(); $('#fqLat').value = p.lat.toFixed(7); $('#fqLng').value = p.lng.toFixed(7); }); }
function moverMarcadorQR(noZoom) {
  var lat = Number(String(val('#fqLat')).replace(',', '.')), lng = Number(String(val('#fqLng')).replace(',', '.'));
  if (!MF || !MF.map || !isFinite(lat) || !isFinite(lng) || !lat || !lng) return;
  if (!MF.marker) { MF.marker = L.marker([lat, lng], { draggable: true }).addTo(MF.map); bindDrag(); } else MF.marker.setLatLng([lat, lng]);
  if (noZoom === true) return;
  MF.map.setView([lat, lng], Math.max(MF.map.getZoom(), 17));
}
function pegarCoords(s) { var c = parseCoords(s); if (c) { $('#fqLat').value = c.lat; $('#fqLng').value = c.lng; moverMarcadorQR(); } }
function miUbicacionQR(btn) {
  if (!navigator.geolocation) { toast('El navegador no permite geolocalización.', 'err'); return; }
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(function (p) {
    btn.disabled = false; $('#fqLat').value = p.coords.latitude.toFixed(7); $('#fqLng').value = p.coords.longitude.toFixed(7); moverMarcadorQR();
    toast('Ubicación obtenida (precisión ' + Math.round(p.coords.accuracy) + ' m)');
  }, function () { btn.disabled = false; toast('No se pudo obtener la ubicación.', 'err'); }, { enableHighAccuracy: true, timeout: 10000 });
}
async function guardarQR(id) {
  await run($('#fqBtn'), async function () {
    await apiT('qrGuardar', { id: id, numero: val('#fqNum'), nombre: val('#fqNom'), descripcion: val('#fqDesc'), lat: val('#fqLat'), lng: val('#fqLng'), hora: val('#fqHora'), distritoId: esSuper() ? val('#fqDist') : USER.distritoId });
    cerrarModal(); toast('QR guardado.', 'ok'); await cargarQRs();
  });
}
async function eliminarQR(id) {
  var q = QRS.find(function (x) { return x.id === id; });
  if (!await confirmar('¿Eliminar el QR N° ' + q.numero + ' (' + q.nombre + ')? El código impreso dejará de funcionar.', 'Eliminar')) return;
  try { toast(await apiT('qrEliminar', id), 'ok'); cargarQRs(); } catch (e) { toast(e.message, 'err'); }
}
async function regenerarQR(id) {
  if (!await confirmar('Se generará un código nuevo y el QR impreso actual dejará de funcionar. ¿Continuar?')) return;
  try { toast(await apiT('qrRegenerar', id), 'ok'); await cargarQRs(); verQR(id); } catch (e) { toast(e.message, 'err'); }
}
function verQR(id) {
  var q = QRS.find(function (x) { return x.id === id; });
  modal('QR N° ' + q.numero + ' · ' + q.nombre,
    '<div class="qr-card"><div class="qr-num">QR ' + q.numero + '</div><div class="qr-name">' + esc(q.nombre) + '</div><div class="muted small">' + esc(q.distritoNombre) + (q.hora ? ' · ' + q.hora : '') + '</div>' +
    '<div class="qr-box" id="qrBig"></div><div class="small muted" style="word-break:break-all">' + esc(urlQR(q)) + '</div></div>' +
    '<div class="modal-foot"><button class="btn btn-danger" onclick="regenerarQR(\'' + id + '\')">↻ Regenerar código</button><button class="btn" onclick="descargarQR(\'' + id + '\')">⬇ PNG</button><button class="btn" onclick="cerrarModal()">Cerrar</button><button class="btn btn-primary" onclick="imprimirQRs([\'' + id + '\'])">🖨️ Imprimir</button></div>');
  new QRCode($('#qrBig'), { text: urlQR(q), width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
}
/** Descarga el QR como imagen PNG con número y nombre del lugar */
function descargarQR(id) {
  var q = QRS.find(function (x) { return x.id === id; });
  var src = $('#qrBig canvas');
  if (!src) { toast('Genere primero el QR.', 'err'); return; }
  var W = 420, H = 540, c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#0b2e6b'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  g.fillStyle = '#0b2e6b'; g.textAlign = 'center';
  g.font = 'bold 40px Arial'; g.fillText('QR ' + q.numero, W / 2, 55);
  g.font = 'bold 22px Arial'; g.fillText(q.nombre.slice(0, 32), W / 2, 88);
  g.drawImage(src, 60, 110, 300, 300);
  g.fillStyle = '#444'; g.font = '16px Arial'; g.fillText(q.distritoNombre.slice(0, 40), W / 2, 445);
  g.font = '14px Arial'; g.fillText('Escanee con la cámara de su celular', W / 2, 475);
  g.fillText('Código: ' + q.token, W / 2, 500);
  var a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'QR_' + q.numero + '_' + q.nombre.replace(/[^\w]+/g, '_') + '.png';
  document.body.appendChild(a); a.click(); a.remove();
}
function imprimirSeleccionados() {
  var ids = $$('.qchk').filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  if (!ids.length) { toast('Seleccione al menos un QR.', 'err'); return; }
  imprimirQRs(ids);
}
function imprimirQRs(ids) {
  var pa = $('#printArea');
  var l = QRS.filter(function (q) { return ids.indexOf(q.id) > -1; });
  pa.innerHTML = '<div class="qr-grid">' + l.map(function (q) {
    return '<div class="qr-card"><div class="small muted">' + esc(CFG && USER ? (USER.distritoNombre || q.distritoNombre) : '') + '</div><div class="qr-num">QR ' + q.numero + '</div><div class="qr-name">' + esc(q.nombre) + '</div>' +
      '<div class="qr-box" id="pq_' + q.id + '"></div><div class="small">Punto de control de patrullaje · ' + esc(q.distritoNombre) + '</div><div class="small muted">Escanee con la cámara de su celular · Código: ' + esc(q.token) + '</div></div>';
  }).join('') + '</div>';
  l.forEach(function (q) { new QRCode(document.getElementById('pq_' + q.id), { text: urlQR(q), width: 250, height: 250, correctLevel: QRCode.CorrectLevel.M }); });
  document.body.classList.add('printing');
  var fin = function () { document.body.classList.remove('printing'); window.removeEventListener('afterprint', fin); };
  window.addEventListener('afterprint', fin);
  setTimeout(function () { window.print(); setTimeout(fin, 1500); }, 500);
}

/* ---------------- MALLA OPERATIVA ---------------- */
async function cargarMallas(btn) {
  await run(btn, async function () {
    MALLAS = await apiT('mallasListar', { desde: val('#maDesde'), hasta: val('#maHasta'), distritoId: val('#maDist') });
    $('#maTabla').innerHTML = tabla(['Fecha', 'Malla', 'Distrito', 'Ruta programada', 'Asignados', 'Cumplimiento', 'Acciones'], MALLAS.map(function (m) {
      return ['<b>' + esc(m.fecha) + '</b>', '<b>' + esc(m.nombre) + '</b><br><span class="badge">' + m.modo + '</span> <span class="small muted">±' + m.tolerancia + ' min</span>', esc(m.distritoNombre),
        '<span class="small">' + esc(m.resumen) + '</span>', '<span class="small">' + esc(m.asignados.join(', ')) + '</span>',
        '<div class="progress"><div style="width:' + m.pct + '%"></div></div><span class="small">' + m.hechos + '/' + m.total + ' (' + m.pct + '%)</span>',
        '<div class="acciones"><button class="btn btn-sm" onclick="verCumplimiento(\'' + m.id + '\')">📈 Cumplimiento</button><button class="btn btn-sm" onclick="formMalla(\'' + m.id + '\')">✏️</button>' +
        '<button class="btn btn-sm" title="Duplicar a otra fecha" onclick="duplicarMalla(\'' + m.id + '\')">⧉</button><button class="btn btn-sm" title="Reenviar correo" onclick="reenviarMalla(\'' + m.id + '\')">✉️</button>' +
        '<button class="btn btn-sm btn-danger" onclick="eliminarMalla(\'' + m.id + '\')">🗑</button></div>'];
    }), 'No hay mallas en el rango de fechas.');
  });
}

async function formMalla(id) {
  var base = { malla: { nombre: '', fecha: val('#maDesde') || hoy(), distritoId: val('#maDist') || distDefecto(), modo: 'INDIVIDUAL', tolerancia: CFG.tolerancia, observacion: '' }, puntos: [], asignados: [] };
  if (id) { try { base = await apiT('mallaObtener', id); } catch (e) { toast(e.message, 'err'); return; } }
  var m = base.malla;
  MF = { id: id || '', puntos: base.puntos.map(function (p) { return { qrId: p.qrId, hora: p.hora }; }), asignados: {}, qrs: [], pols: [], map: null };
  base.asignados.forEach(function (a) { MF.asignados[a.id] = true; });
  modal(id ? 'Editar malla operativa' : 'Nueva malla operativa',
    '<div class="form-grid">' +
    '<div class="full"><label>Nombre de la malla / red</label><input id="mfNom" value="' + esc(m.nombre) + '" placeholder="Ej: PATRULLA 1 - MAÑANA"></div>' +
    '<div><label>Fecha</label><input type="date" id="mfFecha" value="' + esc(m.fecha) + '"></div>' +
    (esSuper() ? '<div><label>Distrito / Servicio</label><select id="mfDist" onchange="cargarMFDistrito(this.value)">' + opcionesDistrito(m.distritoId) + '</select></div>' : '') +
    '<div><label>Modalidad</label><select id="mfModo"><option value="INDIVIDUAL"' + (m.modo === 'INDIVIDUAL' ? ' selected' : '') + '>Individual (cada uno escanea)</option><option value="GRUPAL"' + (m.modo === 'GRUPAL' ? ' selected' : '') + '>Grupal (basta uno del grupo)</option></select></div>' +
    '<div><label>Tolerancia (± min)</label><input type="number" min="0" id="mfTol" value="' + esc(m.tolerancia) + '"></div>' +
    '<div class="full"><label>Observación</label><input id="mfObs" value="' + esc(m.observacion) + '"></div>' +
    '</div>' +
    '<div class="form-grid mt" style="grid-template-columns:1fr 1.4fr">' +
    '<div><h3>1. Servidores asignados</h3><input id="mfBusPol" placeholder="Buscar..." oninput="renderMFPols()" class="mb"><div class="row mb"><button class="btn btn-sm" onclick="selTodosMF(true)">Todos</button><button class="btn btn-sm" onclick="selTodosMF(false)">Ninguno</button><span class="small muted" id="mfNSel"></span></div><div class="chk-list" id="mfPols">Cargando...</div></div>' +
    '<div><h3>2. Puntos QR en orden de escaneo</h3>' +
    '<div class="row mb"><select id="mfQr" class="grow" style="width:auto"></select><input type="time" id="mfHoraAdd" style="width:120px"><button class="btn btn-sm btn-primary" onclick="agregarPuntoMF()">+ Agregar</button></div>' +
    '<div class="row mb"><button class="btn btn-sm" onclick="agregarTodosMF()">Agregar todos los QR en orden</button><button class="btn btn-sm" onclick="MF.puntos=[];renderMFPuntos()">Vaciar</button></div>' +
    '<div class="pt-list" id="mfPuntos"></div></div></div>' +
    '<div class="mt"><div id="mfMap" class="map map-sm"></div></div>' +
    '<div class="modal-foot"><label style="margin:0 auto 0 0;display:flex;gap:6px;align-items:center;color:var(--texto)"><input type="checkbox" id="mfMail" checked> Enviar la red por correo a los asignados</label>' +
    '<button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="mfBtn" onclick="guardarMalla()">Guardar malla</button></div>', true);
  setTimeout(function () { if (!document.getElementById('mfMap')) return; MF.map = crearMapa('mfMap').map; cargarMFDistrito(esSuper() ? val('#mfDist') : USER.distritoId); }, 100);
}
async function cargarMFDistrito(dId) {
  try {
    var r = await Promise.all([apiT('qrsListar', { distritoId: dId }), apiT('usuariosListar', { distritoId: dId, rol: 'POLICIA', estado: 'ACTIVO' })]);
    MF.qrs = r[0]; MF.pols = r[1];
    var ids = MF.qrs.map(function (q) { return q.id; });
    MF.puntos = MF.puntos.filter(function (p) { return ids.indexOf(p.qrId) > -1; });
    $('#mfQr').innerHTML = MF.qrs.map(function (q) { return '<option value="' + q.id + '">QR ' + q.numero + ' · ' + esc(q.nombre) + (q.hora ? ' (' + q.hora + ')' : '') + '</option>'; }).join('') || '<option value="">No hay QR en este distrito</option>';
    $('#mfQr').onchange = function () { var q = MF.qrs.find(function (x) { return x.id === val('#mfQr'); }); $('#mfHoraAdd').value = q && q.hora ? q.hora : ''; };
    $('#mfQr').onchange();
    renderMFPols(); renderMFPuntos();
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function renderMFPols() {
  var b = val('#mfBusPol').toLowerCase();
  var l = MF.pols.filter(function (u) { return !b || (u.nombres + ' ' + u.cedula + ' ' + u.grado).toLowerCase().indexOf(b) > -1; });
  $('#mfPols').innerHTML = l.map(function (u) {
    return '<label><input type="checkbox" ' + (MF.asignados[u.id] ? 'checked' : '') + ' onchange="MF.asignados[\'' + u.id + '\']=this.checked;contarMF()"> <span><b>' + esc(u.grado) + '</b> ' + esc(u.nombres) + '<br><span class="small muted">' + esc(u.cedula) + '</span></span></label>';
  }).join('') || '<div class="muted small">No hay servidores activos en este distrito.</div>';
  contarMF();
}
function contarMF() { $('#mfNSel').textContent = Object.keys(MF.asignados).filter(function (k) { return MF.asignados[k]; }).length + ' seleccionados'; }
function selTodosMF(on) { MF.pols.forEach(function (u) { MF.asignados[u.id] = on; }); renderMFPols(); }
function agregarPuntoMF() { var id = val('#mfQr'); if (!id) return; MF.puntos.push({ qrId: id, hora: val('#mfHoraAdd') }); renderMFPuntos(); }
function agregarTodosMF() { MF.qrs.slice().sort(function (a, b) { return a.numero - b.numero; }).forEach(function (q) { MF.puntos.push({ qrId: q.id, hora: q.hora || '' }); }); renderMFPuntos(); }
function moverPuntoMF(i, d) { var j = i + d; if (j < 0 || j >= MF.puntos.length) return; var t = MF.puntos[i]; MF.puntos[i] = MF.puntos[j]; MF.puntos[j] = t; renderMFPuntos(); }
function quitarPuntoMF(i) { MF.puntos.splice(i, 1); renderMFPuntos(); }
function renderMFPuntos() {
  var qm = {}; MF.qrs.forEach(function (q) { qm[q.id] = q; });
  $('#mfPuntos').innerHTML = MF.puntos.map(function (p, i) {
    var q = qm[p.qrId] || { numero: '?', nombre: '(no disponible)' };
    return '<div class="pt"><span class="num-icon"><span style="background:var(--azul)">' + (i + 1) + '</span></span><div><b>QR ' + q.numero + '</b> ' + esc(q.nombre) + '</div>' +
      '<input type="time" value="' + esc(p.hora) + '" onchange="MF.puntos[' + i + '].hora=this.value">' +
      '<div class="acciones"><button class="btn btn-sm" onclick="moverPuntoMF(' + i + ',-1)">↑</button><button class="btn btn-sm" onclick="moverPuntoMF(' + i + ',1)">↓</button><button class="btn btn-sm btn-danger" onclick="quitarPuntoMF(' + i + ')">✕</button></div></div>';
  }).join('') || '<div class="muted small">Agregue los puntos en el orden en que deben escanearse.</div>';
  if (MF.map) {
    MF.map.eachLayer(function (l) { if (!(l instanceof L.TileLayer)) MF.map.removeLayer(l); });
    var line = [];
    MF.puntos.forEach(function (p, i) {
      var q = qm[p.qrId]; if (!q) return;
      line.push([q.lat, q.lng]);
      L.circle([q.lat, q.lng], { radius: CFG.radio, color: '#1a4fa3', weight: 1, fillOpacity: .25 }).addTo(MF.map);
      L.marker([q.lat, q.lng], { icon: numIcon(i + 1, '#0b2e6b') }).bindTooltip('QR ' + q.numero + ' ' + esc(q.nombre) + ' ' + (p.hora || '')).addTo(MF.map);
    });
    if (line.length > 1) L.polyline(line, { color: '#1a4fa3', weight: 3 }).addTo(MF.map);
    var all = line.length ? line : MF.qrs.map(function (q) { return [q.lat, q.lng]; });
    MF.map.invalidateSize();
    if (all.length) MF.map.fitBounds(all, { padding: [30, 30], maxZoom: 17 });
  }
}
async function guardarMalla() {
  var asig = Object.keys(MF.asignados).filter(function (k) { return MF.asignados[k]; });
  await run($('#mfBtn'), async function () {
    var r = await apiT('mallaGuardar', {
      id: MF.id, nombre: val('#mfNom'), fecha: val('#mfFecha'), distritoId: esSuper() ? val('#mfDist') : USER.distritoId,
      modo: val('#mfModo'), tolerancia: val('#mfTol'), observacion: val('#mfObs'), puntos: MF.puntos, asignados: asig, enviarCorreo: $('#mfMail').checked
    });
    cerrarModal();
    var msg = 'Malla guardada.';
    if (r.correo) msg += ' Correos enviados: ' + r.correo.enviados + (r.correo.fallidos.length ? ' · Fallidos: ' + r.correo.fallidos.join(', ') : '');
    toast(msg, r.correo && r.correo.fallidos.length ? 'err' : 'ok', 7000);
    cargarMallas();
  });
}
async function verCumplimiento(id) {
  try {
    var c = await apiT('mallaCumplimiento', id);
    var cols = ['Orden', 'Punto', 'Hora prog.'].concat(c.columnas.map(function (x) { return esc(x.nombre); }));
    var filas = c.filas.map(function (f) {
      return ['<b>' + f.orden + '</b>', '<b>QR ' + f.qrNumero + '</b> ' + esc(f.qrNombre), esc(f.hora || 'libre')].concat(c.columnas.map(function (col) {
        var s = f.celdas[col.id];
        if (!s) return '<span class="badge b-gray">Pendiente</span>';
        return '<b>' + s.hora + '</b> ' + badgeHora(s.estadoHora) + ' <span class="small muted">' + difTxt(s.minutosDif) + '</span>' +
          (s.ordenCorrecto === 'NO' ? '<br><span class="badge b-bad">Fuera de orden</span>' : '') + (s.alerta ? '<br><span class="badge b-bad">⚠ ' + esc(s.alerta) + '</span>' : '') +
          (col.id === 'GRUPO' ? '<br><span class="small">' + esc(s.grado + ' ' + s.nombres) + '</span>' : '');
      }));
    });
    modal('Cumplimiento · ' + c.malla.nombre,
      '<div class="row mb"><span class="badge">' + esc(c.malla.fecha) + '</span><span class="badge">' + esc(c.distritoNombre) + '</span><span class="badge">' + c.malla.modo + '</span><span class="badge">±' + c.malla.tolerancia + ' min</span></div>' +
      '<div class="stats"><div class="stat"><div class="n">' + c.pct + '%</div><div class="l">Cumplimiento</div></div><div class="stat"><div class="n">' + c.hechos + '/' + c.total + '</div><div class="l">Escaneos realizados</div></div><div class="stat"><div class="n">' + c.aTiempo + '</div><div class="l">A tiempo</div></div></div>' +
      tabla(cols, filas), true);
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function duplicarMalla(id) {
  modal('Duplicar malla a otra fecha', '<div class="field"><label>Nueva fecha</label><input type="date" id="dupF" value="' + hoy() + '"></div><label style="display:flex;gap:6px;color:var(--texto)"><input type="checkbox" id="dupM" checked> Enviar correo a los asignados</label>' +
    '<div class="modal-foot"><button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="dupBtn">Duplicar</button></div>');
  $('#dupBtn').onclick = function () {
    run($('#dupBtn'), async function () {
      var r = await apiT('mallaDuplicar', id, val('#dupF'), $('#dupM').checked);
      cerrarModal(); toast('Malla duplicada.' + (r.correo ? ' Correos: ' + r.correo.enviados : ''), 'ok'); cargarMallas();
    });
  };
}
async function reenviarMalla(id) {
  if (!await confirmar('¿Reenviar la red de patrullaje por correo a todos los asignados?', 'Enviar')) return;
  try { var r = await apiT('mallaReenviar', id); toast('Correos enviados: ' + r.enviados + (r.fallidos.length ? ' · Fallidos: ' + r.fallidos.join(', ') : ''), 'ok'); } catch (e) { toast(e.message, 'err'); }
}
async function eliminarMalla(id) {
  if (!await confirmar('¿Eliminar esta malla operativa?', 'Eliminar')) return;
  try { toast(await apiT('mallaEliminar', id), 'ok'); cargarMallas(); } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- USUARIOS ---------------- */
async function cargarUsuarios() {
  try { USUARIOS = await apiT('usuariosListar', { distritoId: val('#uDist'), rol: val('#uRol'), estado: val('#uEstado') }); renderUsuarios(); } catch (e) { if (!e.silent) toast(e.message, 'err'); }
}
function renderUsuarios() {
  var b = val('#uBuscar').toLowerCase(), bc = normCedula(b);
  var l = USUARIOS.filter(function (u) { return !b || (u.nombres + ' ' + u.email).toLowerCase().indexOf(b) > -1 || (bc && u.cedula.indexOf(bc) > -1) || u.cedula.indexOf(b) > -1; });
  $('#uTabla').innerHTML = tabla(['Cédula', 'Grado y nombres', 'Correo', 'Rol', 'Distrito', 'Estado', 'Último acceso', 'Acciones'], l.map(function (u) {
    var self = u.id === USER.id;
    return [esc(u.cedula), '<b>' + esc(u.grado) + '</b> ' + esc(u.nombres), esc(u.email) + (u.telefono ? '<br><span class="small muted">' + esc(u.telefono) + '</span>' : ''), '<span class="badge">' + u.rol + '</span>', esc(u.distritoNombre || '—'), badgeEstado(u.estado), '<span class="small">' + esc(u.ultimoAcceso || '—') + '</span>',
      '<div class="acciones">' + (u.estado === 'PENDIENTE' ? '<button class="btn btn-sm btn-ok" onclick="estadoUsr(\'' + u.id + '\',\'ACTIVO\')">✔ Aprobar</button>' : '') +
      '<button class="btn btn-sm" onclick="formUsuario(\'' + u.id + '\')">✏️</button>' +
      (self ? '' : '<button class="btn btn-sm" title="Enviar nueva clave" onclick="resetUsr(\'' + u.id + '\')">🔑</button>' +
        (u.estado === 'ACTIVO' ? '<button class="btn btn-sm btn-danger" onclick="estadoUsr(\'' + u.id + '\',\'INACTIVO\')">Desactivar</button>' : u.estado === 'INACTIVO' ? '<button class="btn btn-sm" onclick="estadoUsr(\'' + u.id + '\',\'ACTIVO\')">Activar</button>' : '')) + '</div>'];
  }), 'No hay usuarios.');
}
function formUsuario(id) {
  var u = id ? USUARIOS.find(function (x) { return x.id === id; }) : { cedula: '', nombres: '', grado: '', email: '', telefono: '', rol: 'POLICIA', distritoId: val('#uDist') || distDefecto() };
  var roles = esSuper() ? ['POLICIA', 'ADMIN', 'SUPERADMIN'] : ['POLICIA'];
  modal(id ? 'Editar usuario' : 'Nuevo usuario',
    '<div class="form-grid">' +
    '<div><label>Cédula (9 o 10 dígitos)</label><input id="fuCed" value="' + esc(u.cedula) + '" inputmode="numeric" maxlength="10" onblur="this.value=normCedula(this.value)"></div>' +
    '<div><label>Grado</label><select id="fuGrado"><option value="">—</option>' + GRADOS.map(function (g) { return '<option' + (g === u.grado ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></div>' +
    '<div class="full"><label>Apellidos y nombres</label><input id="fuNom" value="' + esc(u.nombres) + '"></div>' +
    '<div><label>Correo electrónico</label><input id="fuMail" type="email" value="' + esc(u.email) + '"></div>' +
    '<div><label>Teléfono</label><input id="fuTel" value="' + esc(u.telefono) + '"></div>' +
    '<div' + (esSuper() ? '' : ' hidden') + '><label>Rol</label><select id="fuRol">' + roles.map(function (r) { return '<option' + (r === u.rol ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></div>' +
    '<div' + (esSuper() ? '' : ' hidden') + '><label>Distrito / Servicio</label><select id="fuDist"><option value="">— (solo Super Admin) —</option>' + opcionesDistrito(u.distritoId) + '</select></div>' +
    '</div>' + (id ? '' : '<p class="small muted">Se enviará una clave temporal al correo. El usuario deberá cambiarla al ingresar.</p>') +
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
  if (!await confirmar('¿Generar y enviar una nueva clave temporal a este usuario?', 'Enviar')) return;
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
  ['#dDist', '#mDist', '#cDist', '#maDist', '#qDist', '#uDist', '#rDist'].forEach(function (s) { var v = val(s); $(s).innerHTML = opcionesDistrito(v, true); $(s).value = v; });
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
  var cols = ['fechaHora', 'qrNumero', 'qrNombre', 'lat', 'lng', 'cedula', 'grado', 'nombres', 'mallaNombre', 'ordenEsperado', 'horaEsperada', 'minutosDif', 'estadoHora', 'ordenCorrecto', 'distanciaM', 'alerta'];
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

/* =====================================================================
 *  APP POLICIAL - lógica del cliente
 * ===================================================================== */
var TOKEN = null, USER = null, SCANNER = null, MAPA = null, CATS = null, PROCESANDO = false, RADIO = 15;
var LS_KEY = 'rp_pol_token';

var QR_PENDIENTE = (new URLSearchParams(location.search).get('qr') || '').replace(/[^A-Za-z0-9]/g, '');
var EVENTO_INSTALAR = null;
alExpirar = function () { TOKEN = null; lsSet(LS_KEY, null); mostrarLogin(); };

/** Quita ?qr= de la barra de direcciones para que al recargar no se vuelva a registrar */
function limpiarUrl() { try { history.replaceState(null, '', location.pathname); } catch (e) { } }

/* ---------- instalación como app (PWA) ---------- */
if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); }); }
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); EVENTO_INSTALAR = e; var b = $('#instalarBox'); if (b) b.hidden = false; });
function instalarApp() { if (!EVENTO_INSTALAR) return; EVENTO_INSTALAR.prompt(); EVENTO_INSTALAR = null; $('#instalarBox').hidden = true; }

function mostrar(id) { ['vLogin', 'vRegistro', 'vCambio', 'vHome', 'vScan', 'vRes'].forEach(function (v) { $('#' + v).hidden = v !== id; }); window.scrollTo(0, 0); }
function mostrarLogin() { $('#lgBanner').hidden = !QR_PENDIENTE; mostrar('vLogin'); }
function badge(e) {
  var c = { 'A TIEMPO': 'b-ok', 'ADELANTADO': 'b-warn', 'ATRASADO': 'b-bad', 'SIN HORA': 'b-gray' }[e] || 'b-gray';
  return e ? '<span class="badge ' + c + '">' + esc(e) + '</span>' : '';
}

/* ---------- inicio ---------- */
document.addEventListener('DOMContentLoaded', async function () {
  TOKEN = lsGet(LS_KEY);
  if (TOKEN) {
    try { await despuesDeIngresar(); return; }
    catch (e) { TOKEN = null; lsSet(LS_KEY, null); }
  }
  mostrarLogin();
});

async function doLogin(ev) {
  ev.preventDefault();
  await run($('#lgBtn'), async function () {
    var r = await api('login', $('#lgUser').value.trim(), $('#lgPass').value, 'policia');
    TOKEN = r.token; USER = r.usuario; lsSet(LS_KEY, TOKEN); $('#lgPass').value = '';
    if (USER.debeCambiar) { mostrar('vCambio'); return; }
    await despuesDeIngresar();
  });
}
async function despuesDeIngresar() {
  await cargarHome(true);
  if (QR_PENDIENTE && USER && !USER.debeCambiar) procesar(QR_PENDIENTE);
}
async function doCambio(ev) {
  ev.preventDefault();
  if ($('#cbNew').value !== $('#cbNew2').value) { toast('Las claves no coinciden.', 'err'); return; }
  await run($('#cbBtn'), async function () {
    USER = await api('cambiarClave', TOKEN, $('#cbAct').value, $('#cbNew').value);
    toast('Clave creada correctamente.', 'ok');
    await despuesDeIngresar();
  });
}
async function doRecuperar() {
  var id = $('#lgUser').value.trim();
  if (!id) { toast('Escriba su cédula o correo en el campo de usuario.', 'err'); return; }
  try { toast(await api('recuperarClave', id), 'ok', 7000); } catch (e) { toast(e.message, 'err'); }
}
async function abrirRegistro() {
  mostrar('vRegistro');
  if (!CATS) {
    try {
      CATS = await api('polCatalogos');
      $('#rgGrado').innerHTML = '<option value="">Seleccione...</option>' + CATS.grados.map(function (g) { return '<option>' + g + '</option>'; }).join('');
      $('#rgDist').innerHTML = '<option value="">Seleccione...</option>' + CATS.distritos.map(function (d) { return '<option value="' + d.id + '">' + esc(d.nombre) + ' (' + esc(d.tipo) + ')</option>'; }).join('');
    } catch (e) { toast(e.message, 'err'); }
  }
}
async function doRegistro(ev) {
  ev.preventDefault();
  var ced = normCedula($('#rgCed').value);
  if (ced.length !== 10) { toast('La cédula debe tener 9 o 10 dígitos.', 'err'); return; }
  await run($('#rgBtn'), async function () {
    var msg = await api('polRegistro', { cedula: ced, grado: $('#rgGrado').value, nombres: $('#rgNom').value, email: $('#rgMail').value, telefono: $('#rgTel').value, distritoId: $('#rgDist').value });
    toast(msg, 'ok', 10000);
    $('#lgUser').value = ced;
    mostrarLogin();
  });
}
function salir() {
  if (TOKEN) api('logout', TOKEN).catch(function () { });
  TOKEN = null; USER = null; lsSet(LS_KEY, null); mostrarLogin();
}

/* ---------- home / ruta ---------- */
async function cargarHome(mostrarVista) {
  var r = await api('polInit', TOKEN);
  USER = r.usuario; RADIO = r.radio || 15;
  if (USER.debeCambiar) { mostrar('vCambio'); return; }
  $('#hNombre').textContent = USER.grado + ' ' + USER.nombres;
  $('#hDatos').textContent = 'CI ' + USER.cedula + ' · ' + (USER.distritoNombre || '');
  $('#hFecha').textContent = r.hoyLargo;
  renderRuta(r.ruta);
  $('#hEsc').innerHTML = r.escaneos.length ? r.escaneos.map(function (e) {
    return '<div class="kv"><span><b>' + e.hora + '</b> · QR ' + esc(e.qrNumero) + ' ' + esc(e.qrNombre) + '</span><span>' + badge(e.estadoHora) + '</span></div>';
  }).join('') : '<div class="muted small">Aún no registra escaneos hoy.</div>';
  if (mostrarVista !== false) mostrar('vHome');
  setTimeout(function () { dibujarMapa(r.ruta); }, 150);
}
function renderRuta(ruta) {
  if (!ruta.length) { $('#hRuta').innerHTML = '<div class="muted">No tiene una malla operativa asignada para hoy. Puede escanear los puntos QR de su distrito libremente.</div>'; return; }
  $('#hRuta').innerHTML = ruta.map(function (m) {
    var sig = m.puntos.find(function (p) { return !p.hecho; });
    var hechos = m.puntos.filter(function (p) { return p.hecho; }).length;
    return '<div class="mb"><div class="row"><b class="grow">' + esc(m.nombre) + '</b><span class="badge">' + hechos + '/' + m.puntos.length + '</span></div>' +
      '<div class="small muted">' + (m.modo === 'GRUPAL' ? 'Grupal' : 'Individual') + ' · tolerancia ±' + m.tolerancia + ' min' + (m.companeros.length ? ' · Con: ' + esc(m.companeros.join(', ')) : '') + '</div>' +
      (m.observacion ? '<div class="small">' + esc(m.observacion) + '</div>' : '') +
      m.puntos.map(function (p) {
        var cls = p.hecho ? 'ok' : (sig && sig.id === p.id ? 'next' : '');
        return '<div class="pt ' + cls + '"><div class="n">' + (p.hecho ? '✓' : p.orden) + '</div><div class="info"><b>QR ' + p.qrNumero + ' · ' + esc(p.qrNombre) + '</b>' +
          '<span class="small muted">' + (p.hora ? 'Programado ' + p.hora : 'Sin hora') + (p.hecho ? ' · escaneado ' + p.horaEscaneo + (p.por ? ' por ' + esc(p.por) : '') : '') + '</span> ' + (p.hecho ? badge(p.estadoHora) : '') + '</div>' +
          (!p.hecho ? '<a class="btn btn-sm" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '">Ir</a>' : '') + '</div>';
      }).join('') + '</div>';
  }).join('');
}
function dibujarMapa(ruta) {
  var pts = [];
  ruta.forEach(function (m) { m.puntos.forEach(function (p) { if (isFinite(p.lat) && p.lat) pts.push(p); }); });
  $('#hMapCard').hidden = !pts.length;
  if (!pts.length) return;
  if (MAPA) MAPA.remove();
  MAPA = L.map('hMap', { maxZoom: 21 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 21, maxNativeZoom: 20, attribution: '© OpenStreetMap © CARTO' }).addTo(MAPA);
  ruta.forEach(function (m) {
    var line = m.puntos.map(function (p) { return [p.lat, p.lng]; });
    if (line.length > 1) L.polyline(line, { color: '#1a4fa3', weight: 3, opacity: .8 }).addTo(MAPA);
    m.puntos.forEach(function (p) {
      var c = p.hecho ? '#15925a' : '#0b2e6b';
      L.circle([p.lat, p.lng], { radius: RADIO, color: c, weight: 1, fillOpacity: .25 }).addTo(MAPA);
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'num-icon', html: '<span style="background:' + c + '">' + (p.hecho ? '✓' : p.orden) + '</span>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindPopup('<b>QR ' + p.qrNumero + '</b> ' + esc(p.qrNombre) + '<br>' + (p.hora || 'Sin hora')).addTo(MAPA);
    });
  });
  MAPA.fitBounds(pts.map(function (p) { return [p.lat, p.lng]; }), { padding: [30, 30], maxZoom: 17 });
}
function irHome() { mostrar('vHome'); cargarHome().catch(function (e) { if (!e.silent) toast(e.message, 'err'); }); }

/* ---------- escáner ---------- */
async function abrirEscaner() {
  mostrar('vScan');
  $('#scanErr').hidden = true; $('#scManual').value = '';
  if (typeof Html5Qrcode === 'undefined') { errorCamara(); return; }
  try {
    SCANNER = new Html5Qrcode('reader');
    await SCANNER.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, function (txt) {
      cerrarEscaner(true); procesar(txt);
    }, function () { });
  } catch (e) { errorCamara(); }
}
function errorCamara() {
  $('#scanErr').hidden = false;
  $('#scanErr').innerHTML = 'No se pudo abrir la cámara. Verifique que dio <b>permiso de cámara</b> al navegador (candado junto a la dirección → Permisos).<br>También puede escanear con la cámara normal del celular o usar "Tomar foto del QR".';
}
async function cerrarEscaner(sinVolver) {
  if (SCANNER) { try { await SCANNER.stop(); } catch (e) { } try { SCANNER.clear(); } catch (e) { } SCANNER = null; }
  if (sinVolver !== true) mostrar('vHome');
}
async function escanearFoto(inp) {
  var f = inp.files && inp.files[0];
  if (!f) return;
  try {
    if (SCANNER) { try { await SCANNER.stop(); } catch (e) { } }
    var lector = SCANNER || new Html5Qrcode('reader');
    var txt = await lector.scanFile(f, false);
    try { lector.clear(); } catch (e) { }
    SCANNER = null;
    procesar(txt);
  } catch (e) { toast('No se detectó un código QR en la foto. Intente de nuevo más cerca y con buena luz.', 'err'); }
  inp.value = '';
}

/* ---------- registro del escaneo ---------- */
function obtenerGeo() {
  return new Promise(function (res) {
    if (!navigator.geolocation) return res(null);
    var hecho = false;
    var t = setTimeout(function () { if (!hecho) { hecho = true; res(null); } }, 8000);
    navigator.geolocation.getCurrentPosition(function (p) {
      if (hecho) return; hecho = true; clearTimeout(t);
      res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
    }, function () { if (!hecho) { hecho = true; clearTimeout(t); res(null); } }, { enableHighAccuracy: true, timeout: 7500, maximumAge: 30000 });
  });
}
async function procesar(codigo) {
  codigo = String(codigo || '').trim();
  if (!codigo || PROCESANDO) return;
  PROCESANDO = true;
  mostrar('vRes');
  $('#resBox').innerHTML = '<div class="res-ico">⏳</div><h2>Registrando punto...</h2><p class="muted">Obteniendo ubicación y enviando datos.</p>';
  try {
    var geo = await obtenerGeo();
    var r = await api('polEscanear', TOKEN, codigo, geo, navigator.userAgent);
    QR_PENDIENTE = ''; limpiarUrl();
    mostrarResultado(r);
  } catch (e) {
    if (!e.silent) $('#resBox').innerHTML = '<div class="res-ico">❌</div><h2>No se registró</h2><p>' + esc(e.message) + '</p>';
    QR_PENDIENTE = ''; limpiarUrl();
  } finally { PROCESANDO = false; }
}
function mostrarResultado(r) {
  var e = r.escaneo;
  var ico = r.duplicado ? 'ℹ️' : (e.alerta || e.ordenCorrecto === 'NO' || e.estadoHora === 'ATRASADO' || e.estadoHora === 'ADELANTADO') ? '⚠️' : '✅';
  var dif = e.minutosDif === '' || e.minutosDif == null ? '' : ' (' + (Number(e.minutosDif) > 0 ? '+' : '') + e.minutosDif + ' min)';
  var html = '<div class="res-ico">' + ico + '</div><h2>QR ' + esc(e.qrNumero) + ' · ' + esc(e.qrNombre) + '</h2><p class="muted">' + esc(r.mensaje) + '</p>' +
    '<div style="text-align:left">' +
    '<div class="kv"><span>Hora de registro</span><b>' + esc(e.hora) + '</b></div>' +
    '<div class="kv"><span>Hora programada</span><span>' + esc(e.horaEsperada || '—') + dif + ' ' + badge(e.estadoHora) + '</span></div>' +
    (e.mallaNombre ? '<div class="kv"><span>Malla</span><span>' + esc(e.mallaNombre) + ' · punto ' + esc(e.ordenEsperado) + '</span></div>' : '<div class="kv"><span>Malla</span><span>Escaneo libre</span></div>') +
    (e.ordenCorrecto ? '<div class="kv"><span>Orden</span>' + (e.ordenCorrecto === 'SI' ? '<span class="badge b-ok">Correcto</span>' : '<span class="badge b-bad">Fuera de orden</span>') + '</div>' : '') +
    (e.alerta ? '<div class="kv"><span>Alerta</span><span class="badge b-bad">' + esc(e.alerta) + '</span></div>' : '') +
    '</div>';
  if (r.siguiente) {
    html += '<div class="card mt" style="text-align:left;background:var(--azul3)"><b>Siguiente punto:</b><br>QR ' + r.siguiente.qrNumero + ' · ' + esc(r.siguiente.qrNombre) + (r.siguiente.hora ? ' a las <b>' + r.siguiente.hora + '</b>' : '') +
      '<br><a class="btn btn-sm mt" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=' + r.siguiente.lat + ',' + r.siguiente.lng + '">🧭 Cómo llegar</a></div>';
  } else if (e.mallaId) {
    html += '<div class="card mt b-ok" style="background:var(--verde2)"><b>🎉 Completó todos los puntos de su malla.</b></div>';
  }
  $('#resBox').innerHTML = html;
  if (navigator.vibrate) navigator.vibrate(ico === '✅' ? 120 : [80, 60, 80]);
}

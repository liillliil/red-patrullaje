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

function mostrar(id) { ['vLogin', 'vRegistro', 'vCambio', 'vHome', 'vScan', 'vGps', 'vFoto', 'vRes'].forEach(function (v) { $('#' + v).hidden = v !== id; }); window.scrollTo(0, 0); }
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
    var v = e.validez === 'VALIDO' ? badge(e.estadoHora) : '<span class="badge ' + (e.validez === 'PENDIENTE FOTO' ? 'b-warn' : 'b-bad') + '">' + esc(e.validez) + '</span>';
    return '<div class="kv"><span><b>' + e.hora + '</b> · QR ' + esc(e.qrNumero) + ' ' + esc(e.qrNombre) + '</span><span>' + v + '</span></div>';
  }).join('') : '<div class="muted small">Aún no registra escaneos hoy.</div>';
  if (mostrarVista !== false) mostrar('vHome');
  setTimeout(function () { dibujarMapa(r.ruta); }, 150);
}
function renderRuta(ruta) {
  if (!ruta.length) { $('#hRuta').innerHTML = '<div class="muted">No tiene una malla operativa asignada para hoy. Puede escanear los puntos QR de su distrito libremente.</div>'; return; }
  $('#hRuta').innerHTML = ruta.map(function (m) {
    var sig = m.puntos.find(function (p) { return !p.hecho && !p.noCumplido; });
    var hechos = m.puntos.filter(function (p) { return p.hecho; }).length;
    return '<div class="mb"><div class="row"><b class="grow">' + esc(m.nombre) + '</b><span class="badge">' + hechos + '/' + m.puntos.length + '</span></div>' +
      '<div class="small muted">' + (m.modo === 'GRUPAL' ? 'Grupal' : 'Individual') + ' · tolerancia ±' + m.tolerancia + ' min' + (m.companeros.length ? ' · Con: ' + esc(m.companeros.join(', ')) : '') + '</div>' +
      (m.observacion ? '<div class="small">' + esc(m.observacion) + '</div>' : '') +
      m.puntos.map(function (p) {
        var cls = p.hecho ? 'ok' : p.noCumplido ? 'mal' : (sig && sig.id === p.id ? 'next' : '');
        return '<div class="pt ' + cls + '"><div class="n">' + (p.hecho ? '✓' : p.noCumplido ? '✕' : p.orden) + '</div><div class="info"><b>' + esc(p.hora) + ' · QR ' + p.qrNumero + ' · ' + esc(p.qrNombre) + '</b>' +
          '<span class="small muted">Ventana ' + esc(p.desde) + '–' + esc(p.hasta) + (p.hecho ? ' · escaneado ' + p.horaEscaneo + (p.por ? ' por ' + esc(p.por) : '') : '') + '</span> ' +
          (p.hecho ? '<span class="badge b-ok">CUMPLIDO</span>' : p.noCumplido ? '<span class="badge" style="background:#cf3b3b;color:#fff">NO CUMPLIDO</span>' : '') + '</div>' +
          (!p.hecho && !p.noCumplido ? '<a class="btn btn-sm" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '">Ir</a>' : '') + '</div>';
      }).join('') + '</div>';
  }).join('');
}
var CAPA_RUTA = null;
async function dibujarMapa(ruta) {
  var pts = [];
  ruta.forEach(function (m) { m.puntos.forEach(function (p) { if (isFinite(p.lat) && p.lat) pts.push(p); }); });
  $('#hMapCard').hidden = !pts.length;
  if (!pts.length) return;
  try { if (!MAPA) MAPA = await gmMapa($('#hMap'), { streetViewControl: false }); }
  catch (e) { $('#hMapCard').hidden = true; return; }
  if (CAPA_RUTA) CAPA_RUTA.setMap(null);
  CAPA_RUTA = new Capa();
  ruta.forEach(function (m) {
    var line = m.puntos.map(function (p) { return [p.lat, p.lng]; });
    if (line.length > 1) CAPA_RUTA.add(gmLinea(line, '#1a4fa3', 3, false, true));
    m.puntos.forEach(function (p) {
      var c = p.hecho ? '#15925a' : '#0b2e6b';
      CAPA_RUTA.add(gmCirculo(p.lat, p.lng, RADIO, c, .25));
      CAPA_RUTA.add(gmNum(MAPA, p.lat, p.lng, p.hecho ? '✓' : p.orden, c,
        '<div class="pop"><b>QR ' + p.qrNumero + '</b> ' + esc(p.qrNombre) + '<br>' + (p.hora || 'Sin hora') +
        '<br><a target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '">Cómo llegar</a></div>', 'QR ' + p.qrNumero));
    });
  });
  CAPA_RUTA.setMap(MAPA);
  gmAjustar(MAPA, pts.map(function (p) { return [p.lat, p.lng]; }), 17);
}
function irHome() { mostrar('vHome'); cargarHome().catch(function (e) { if (!e.silent) toast(e.message, 'err'); }); }

/* ---------- escáner ---------- */
async function abrirEscaner() {
  mostrar('vScan');
  $('#scanErr').hidden = true;
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
  $('#scanErr').innerHTML = 'No se pudo abrir la cámara. Verifique que dio <b>permiso de cámara</b> al navegador (candado junto a la dirección → Permisos).<br>También puede escanear con la cámara normal del celular: se abrirá esta app.';
}
async function cerrarEscaner(sinVolver) {
  if (SCANNER) { try { await SCANNER.stop(); } catch (e) { } try { SCANNER.clear(); } catch (e) { } SCANNER = null; }
  if (sinVolver !== true) mostrar('vHome');
}
/* ---------- PASO 2: GPS obligatorio ---------- */
var CODIGO = '', RESP = null, RETOS = [], STREAM = null, CD_TIMER = null, LIMITE = 0, FOTO_DATA = null, GEO = null;

/** Lee varias posiciones durante unos segundos y se queda con la más precisa */
function obtenerGeoPreciso(onProgreso) {
  return new Promise(function (res, rej) {
    if (!navigator.geolocation) return rej(new Error('Este celular no permite obtener la ubicación.'));
    var mejor = null, fin = false, wid = null;
    function terminar(err) {
      if (fin) return; fin = true;
      if (wid !== null) navigator.geolocation.clearWatch(wid);
      clearTimeout(t);
      if (mejor) res(mejor); else rej(err || new Error('No se pudo obtener la ubicación.'));
    }
    var t = setTimeout(function () { terminar(); }, 12000);
    wid = navigator.geolocation.watchPosition(function (p) {
      var g = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      if (!mejor || g.acc < mejor.acc) mejor = g;
      if (onProgreso) onProgreso(mejor);
      if (mejor.acc <= 15) terminar();
    }, function (e) {
      if (e.code === 1) { fin = true; clearTimeout(t); if (wid !== null) navigator.geolocation.clearWatch(wid); rej(new Error('PERMISO')); }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
  });
}

/** PASO 1: al escanear se verifica de inmediato la malla y el horario (antes del GPS) */
async function procesar(codigo) {
  codigo = String(codigo || '').trim();
  if (!codigo || PROCESANDO) return;
  CODIGO = codigo; QR_PENDIENTE = ''; limpiarUrl();
  PROCESANDO = true;
  mostrar('vRes');
  $('#resBox').innerHTML = '<div class="res-ico">⏳</div><h2>Verificando su horario...</h2>';
  try {
    var v = await api('polVerificar', TOKEN, CODIGO, navigator.userAgent);
    PROCESANDO = false;
    if (v.tipo !== 'OK') { mostrarBloqueo(v); return; }
    $('#gpsIco').textContent = '📍'; $('#gpsTit').textContent = v.qr;
    $('#gpsTxt').innerHTML = (v.malla ? '<b>' + esc(v.malla) + '</b> · ' : '') + 'Programado <b>' + esc(v.horaProgramada) + '</b>' + (v.desde ? ' <span class="badge b-ok">Horario correcto (' + esc(v.desde) + '–' + esc(v.hasta) + ')</span>' : '') +
      '<br>Presione el botón para activar su GPS y confirmar que está en el lugar.';
    $('#gpsBtn').disabled = false; $('#gpsBtn').innerHTML = '📍 ACTIVAR GPS'; $('#gpsBtn').onclick = activarGps; $('#gpsInfo').textContent = '';
    mostrar('vGps');
  } catch (e) {
    PROCESANDO = false;
    if (!e.silent) $('#resBox').innerHTML = '<div class="res-ico">❌</div><h2>No se registró</h2><p>' + esc(e.message) + '</p>';
  }
}

/** Pantallas de horario adelantado / postergado / fuera de malla */
function mostrarBloqueo(b) {
  mostrar('vRes');
  var cfg = {
    ADELANTADO: { ico: '⏰', col: '#c98a00', fondo: '#fff3c4', grande: 'Retorne a las ' + b.horaProgramada },
    POSTERGADO: { ico: '⌛', col: '#cf3b3b', fondo: '#fde2e2', grande: 'Debió estar aquí a las ' + b.horaProgramada },
    FUERA_MALLA: { ico: '🚫', col: '#cf3b3b', fondo: '#fde2e2', grande: '' },
    HECHO: { ico: 'ℹ️', col: '#1a4fa3', fondo: '#e8eef9', grande: '' }
  }[b.tipo] || { ico: 'ℹ️', col: '#1a4fa3', fondo: '#e8eef9', grande: '' };
  $('#resBox').innerHTML = '<div class="res-ico">' + cfg.ico + '</div>' +
    '<h2 style="color:' + cfg.col + '">' + esc(b.titulo) + '</h2><p class="muted">' + esc(b.qr || '') + (b.malla ? ' · ' + esc(b.malla) : '') + '</p>' +
    '<div style="background:' + cfg.fondo + ';border:2px solid ' + cfg.col + ';border-radius:14px;padding:16px;margin-top:10px">' +
    (cfg.grande ? '<div style="font-size:26px;font-weight:800;color:' + cfg.col + '">' + esc(cfg.grande) + '</div>' : '') +
    '<div style="margin-top:6px">' + esc(b.texto) + '</div>' + (b.proximo ? '<div class="small mt">' + esc(b.proximo) + '</div>' : '') + '</div>';
  if (navigator.vibrate) navigator.vibrate(b.tipo === 'ADELANTADO' ? [100, 60, 100] : [200, 100, 200]);
}
function cancelarRegistro() { detenerCamara(); CODIGO = ''; irHome(); }

async function activarGps() {
  if (PROCESANDO) return;
  PROCESANDO = true;
  var btn = $('#gpsBtn'); btn.disabled = true; btn.innerHTML = '⏳ Obteniendo ubicación...';
  $('#gpsIco').textContent = '🛰️';
  try {
    GEO = await obtenerGeoPreciso(function (g) { $('#gpsInfo').textContent = 'Precisión actual: ±' + Math.round(g.acc) + ' m'; });
    $('#gpsInfo').textContent = 'Ubicación obtenida (±' + Math.round(GEO.acc) + ' m). Verificando el punto...';
    btn.innerHTML = '⏳ Verificando...';
    RESP = await api('polEscanear', TOKEN, CODIGO, GEO, navigator.userAgent);
    PROCESANDO = false;
    if (RESP.bloqueo) { mostrarBloqueo(RESP.bloqueo); return; }
    siguientePaso();
  } catch (e) {
    PROCESANDO = false;
    if (e.silent) return;
    var m = e.message || '';
    btn.disabled = false; btn.innerHTML = '📍 REINTENTAR GPS';
    if (m === 'PERMISO') {
      $('#gpsIco').textContent = '🚫'; $('#gpsTit').textContent = 'Permiso de ubicación denegado';
      $('#gpsTxt').innerHTML = 'Active la ubicación del celular y permita el acceso: toque el <b>candado 🔒</b> junto a la dirección → <b>Permisos → Ubicación → Permitir</b>. Luego presione reintentar.';
    } else if (m.indexOf('GPS_IMPRECISO') === 0 || m.indexOf('GPS_REQUERIDO') === 0) {
      $('#gpsIco').textContent = '📡'; $('#gpsTit').textContent = 'Señal GPS insuficiente';
      $('#gpsTxt').textContent = m.replace(/^GPS_\w+:\s*/, '');
    } else {
      $('#gpsIco').textContent = '❌'; $('#gpsTit').textContent = 'No se registró';
      $('#gpsTxt').textContent = m;
      if (/QR no válido|no pertenece/.test(m)) { btn.innerHTML = 'Volver'; btn.onclick = function () { btn.onclick = activarGps; irHome(); }; }
    }
  }
}

function siguientePaso() {
  if (RESP && RESP.retos && RESP.retos.length) { RETOS = RESP.retos.slice(); abrirReto(); }
  else mostrarResultado(RESP);
}

/* ---------- PASO 3: foto EN VIVO (sin galería) ---------- */
async function abrirReto() {
  var r = RETOS[0];
  mostrar('vFoto');
  $('#retoN').textContent = RESP.totalRetos > 1 ? '(' + (r.indice + 1) + ' de ' + RESP.totalRetos + ')' : '';
  $('#retoTit').textContent = { FRENTE: 'HACIA ADELANTE', DERECHA: 'HACIA SU DERECHA', IZQUIERDA: 'HACIA SU IZQUIERDA', ATRAS: 'HACIA ATRÁS' }[r.codigo] || r.codigo;
  $('#retoTxt').textContent = r.texto;
  $('#camErr').hidden = true; $('#camPrev').hidden = true; $('#camBtns').hidden = false;
  $('#camCan').hidden = true; $('#camVid').hidden = false; $('#camLive').hidden = false; FOTO_DATA = null;
  iniciarCuenta(RESP.segundosRestantes || 120);
  try {
    detenerCamara();
    STREAM = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: r.camara || 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
    var v = $('#camVid'); v.srcObject = STREAM; await v.play();
  } catch (e) {
    $('#camErr').hidden = false;
    $('#camErr').innerHTML = 'No se pudo abrir la cámara. Permita el acceso: candado 🔒 junto a la dirección → <b>Permisos → Cámara → Permitir</b> y vuelva a escanear el QR.';
    $('#camBtns').hidden = true;
  }
}
function iniciarCuenta(seg) {
  clearInterval(CD_TIMER);
  LIMITE = Date.now() + seg * 1000;
  var tick = function () {
    var s = Math.max(0, Math.round((LIMITE - Date.now()) / 1000));
    $('#camCd').textContent = '⏱ ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    if (s <= 0) {
      clearInterval(CD_TIMER); detenerCamara();
      $('#camBtns').hidden = true; $('#camPrev').hidden = true;
      $('#camErr').hidden = false; $('#camErr').innerHTML = '⏱ Se agotó el tiempo para la foto. El punto quedó <b>SIN FOTO</b>. Vuelva a escanear el QR para intentarlo de nuevo.<br><button class="btn btn-sm mt" onclick="irHome()">Volver</button>';
    }
  };
  tick(); CD_TIMER = setInterval(tick, 500);
}
function detenerCamara() { if (STREAM) { STREAM.getTracks().forEach(function (t) { t.stop(); }); STREAM = null; } }

function capturar() {
  var v = $('#camVid');
  if (!v.videoWidth) { toast('La cámara aún no está lista.', 'err'); return; }
  var W = Math.min(1280, v.videoWidth), H = Math.round(v.videoHeight * W / v.videoWidth);
  var c = $('#camCan'); c.width = W; c.height = H;
  var g = c.getContext('2d'); g.drawImage(v, 0, 0, W, H);
  // Sello de agua con los datos del registro (no se puede editar después)
  var e = RESP.escaneo, r = RETOS[0], fs = Math.max(16, Math.round(W / 42));
  var lineas = ['QR ' + e.qrNumero + ' · ' + e.qrNombre + ' · Reto: ' + r.codigo,
    new Date().toLocaleString('es-EC') + ' · ' + (USER.grado + ' ' + USER.nombres),
    'GPS ' + Number(GEO.lat).toFixed(6) + ', ' + Number(GEO.lng).toFixed(6) + ' (±' + Math.round(GEO.acc) + ' m) · a ' + e.distanciaM + ' m del QR'];
  var bh = fs * 1.45 * lineas.length + fs;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - bh, W, bh);
  g.fillStyle = '#fff'; g.font = '600 ' + fs + 'px system-ui,Arial';
  lineas.forEach(function (l, i) { g.fillText(l, fs * .6, H - bh + fs * 1.3 + i * fs * 1.45); });
  FOTO_DATA = c.toDataURL('image/jpeg', 0.78);
  v.hidden = true; c.hidden = false; $('#camLive').hidden = true;
  $('#camBtns').hidden = true; $('#camPrev').hidden = false;
}
function repetirFoto() {
  FOTO_DATA = null; $('#camCan').hidden = true; $('#camVid').hidden = false; $('#camLive').hidden = false;
  $('#camBtns').hidden = false; $('#camPrev').hidden = true;
}
async function enviarFoto() {
  if (!FOTO_DATA) return;
  await run($('#btnEnviarFoto'), async function () {
    var r = await api('polSubirFoto', TOKEN, RESP.escaneo.id, RETOS[0].codigo, FOTO_DATA);
    RESP = r; FOTO_DATA = null;
    if (r.retos && r.retos.length) { RETOS = r.retos.slice(); abrirReto(); }
    else { clearInterval(CD_TIMER); detenerCamara(); mostrarResultado(r); }
  });
}

/* ---------- resultado ---------- */
function mostrarResultado(r) {
  var e = r.escaneo;
  mostrar('vRes');
  if (e.validez === 'NO VALIDO') {
    $('#resBox').innerHTML = '<div class="res-ico">❌</div><h2>Escaneo NO VÁLIDO</h2><p class="muted">QR ' + esc(e.qrNumero) + ' · ' + esc(e.qrNombre) + '</p>' +
      '<div class="banner" style="background:var(--rojo2);border-color:#f3b6b6;color:#8a1f1f;text-align:left">' + esc(e.motivo) +
      '<br>El intento quedó registrado con su ubicación real. Para que el punto cuente debe escanear <b>estando en el lugar</b>.</div>';
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    return;
  }
  var ok = e.validez === 'VALIDO';
  var aviso = e.ordenCorrecto === 'NO' || e.estadoHora === 'ATRASADO' || e.estadoHora === 'ADELANTADO';
  var ico = r.duplicado ? 'ℹ️' : (ok ? (aviso ? '⚠️' : '✅') : '⏳');
  var dif = e.minutosDif === '' || e.minutosDif == null ? '' : ' (' + (Number(e.minutosDif) > 0 ? '+' : '') + e.minutosDif + ' min)';
  var html = '<div class="res-ico">' + ico + '</div><h2>QR ' + esc(e.qrNumero) + ' · ' + esc(e.qrNombre) + '</h2><p class="muted">' + esc(r.mensaje) + '</p>' +
    '<div style="text-align:left">' +
    '<div class="kv"><span>Estado</span>' + (ok ? '<span class="badge b-ok">VÁLIDO</span>' : '<span class="badge b-warn">' + esc(e.validez) + '</span>') + '</div>' +
    '<div class="kv"><span>Hora de registro</span><b>' + esc(e.hora) + '</b></div>' +
    '<div class="kv"><span>Hora programada</span><span>' + esc(e.horaEsperada || '—') + dif + ' ' + badge(e.estadoHora) + '</span></div>' +
    '<div class="kv"><span>Ubicación</span><span>a ' + esc(e.distanciaM) + ' m del QR ✔</span></div>' +
    (e.nFotos ? '<div class="kv"><span>Foto de evidencia</span><span class="badge b-ok">Recibida</span></div>' : '') +
    (e.mallaNombre ? '<div class="kv"><span>Malla</span><span>' + esc(e.mallaNombre) + ' · punto ' + esc(e.ordenEsperado) + '</span></div>' : '<div class="kv"><span>Malla</span><span>Escaneo libre</span></div>') +
    (e.ordenCorrecto ? '<div class="kv"><span>Orden</span>' + (e.ordenCorrecto === 'SI' ? '<span class="badge b-ok">Correcto</span>' : '<span class="badge b-bad">Fuera de orden</span>') + '</div>' : '') +
    '</div>';
  if (ok && r.siguiente) {
    html += '<div class="card mt" style="text-align:left;background:var(--azul3)"><b>Siguiente punto:</b><br>QR ' + r.siguiente.qrNumero + ' · ' + esc(r.siguiente.qrNombre) + (r.siguiente.hora ? ' a las <b>' + r.siguiente.hora + '</b>' : '') +
      '<br><a class="btn btn-sm mt" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=' + r.siguiente.lat + ',' + r.siguiente.lng + '">🧭 Cómo llegar</a></div>';
  } else if (ok && e.mallaId) {
    html += '<div class="card mt" style="background:var(--verde2)"><b>🎉 Completó todos los puntos de su malla.</b></div>';
  }
  $('#resBox').innerHTML = html;
  if (navigator.vibrate) navigator.vibrate(ico === '✅' ? 120 : [80, 60, 80]);
}

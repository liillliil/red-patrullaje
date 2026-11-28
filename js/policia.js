/* =====================================================================
 *  APP POLICIAL · MONEDAS DE PATRULLAJE
 *  Mapa de monedas → acercarse (radar) → cámara (moneda en dirección al azar) → atrapada
 * ===================================================================== */
var TOKEN = null, USER = null, CATS = null, LS_KEY = 'rp_pol_token';
var RUTA = [], MONEDAS = [], OFFSET = 0, SEL = null, GEO = null, WATCH = null, MAPA = null, CAPA = null, YO_MK = null;
var RESP = null, RETO = null, STREAM = null, CD_TIMER = null, LIMITE = 0, ORIENT = null, H0 = null, HEAD = null, SIN_BRUJULA = false, OCUPADO = false, TARDE_ENVIADA = {};
var EVENTO_INSTALAR = null;
alExpirar = function () { TOKEN = null; lsSet(LS_KEY, null); mostrarLogin(); };

/* ---------- instalación como app (PWA) ---------- */
if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); }); }
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); EVENTO_INSTALAR = e; var b = $('#instalarBox'); if (b) b.hidden = false; });
function instalarApp() { if (!EVENTO_INSTALAR) return; EVENTO_INSTALAR.prompt(); EVENTO_INSTALAR = null; $('#instalarBox').hidden = true; }

function mostrar(id) {
  ['vLogin', 'vRegistro', 'vCambio', 'vHome', 'vMoneda', 'vAR', 'vRes'].forEach(function (v) { $('#' + v).hidden = v !== id; });
  window.scrollTo(0, 0);
}
function mostrarLogin() { detenerGps(); mostrar('vLogin'); }
function ahora() { return Date.now() + OFFSET; }
function hhmm(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function fmtDist(m) { return m == null ? '—' : m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
function distM(a, b) {
  var R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ---------- inicio y sesión ---------- */
document.addEventListener('DOMContentLoaded', async function () {
  try { history.replaceState(null, '', location.pathname); } catch (e) { }
  TOKEN = lsGet(LS_KEY);
  if (TOKEN) {
    try { await cargarHome(true); return; }
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
    await cargarHome(true);
  });
}
async function doCambio(ev) {
  ev.preventDefault();
  if ($('#cbNew').value !== $('#cbNew2').value) { toast('Las claves no coinciden.', 'err'); return; }
  await run($('#cbBtn'), async function () {
    USER = await api('cambiarClave', TOKEN, $('#cbAct').value, $('#cbNew').value);
    toast('Clave creada correctamente.', 'ok');
    await cargarHome(true);
  });
}
async function doRecuperar() {
  var id = $('#lgUser').value.trim();
  if (!id) { toast('Escriba su cédula en el campo de usuario.', 'err'); return; }
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

/* ---------- GPS en vivo ---------- */
function iniciarGps() {
  if (WATCH !== null || !navigator.geolocation) return;
  WATCH = navigator.geolocation.watchPosition(function (p) {
    GEO = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    actualizarDistancias();
  }, function (e) {
    if (e.code === 1) toast('Active la ubicación y permita el acceso (candado 🔒 → Permisos → Ubicación).', 'err', 8000);
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
}
function detenerGps() { if (WATCH !== null) { navigator.geolocation.clearWatch(WATCH); WATCH = null; } }

/* ---------- monedas del día ---------- */
function nombreMoneda() { return { grado: USER.grado, nombres: USER.nombres }; }
function estadoActual(p) {
  if (p.estado === 'ATRAPADA' || p.estado === 'PENDIENTE FOTO') return p.estado;
  var t = ahora();
  if (t > p.finMs) return 'NO CUMPLIDO';
  if (t >= p.iniMs) return 'ACTIVA';
  return 'PROXIMA';
}
async function cargarHome(mostrarVista) {
  var r = await api('polInit', TOKEN);
  USER = r.usuario; RUTA = r.ruta; OFFSET = (r.ahoraMs || Date.now()) - Date.now();
  if (USER.debeCambiar) { mostrar('vCambio'); return; }
  MONEDAS = [];
  RUTA.forEach(function (m) { m.puntos.forEach(function (p) { p.mallaNombre = m.nombre; p.modo = m.modo; MONEDAS.push(p); }); });
  MONEDAS.sort(function (a, b) { return a.iniMs - b.iniMs; });
  $('#hNombre').textContent = USER.grado + ' ' + USER.nombres;
  $('#hDatos').textContent = 'CI ' + USER.cedula + ' · ' + (USER.distritoNombre || '');
  $('#hFecha').textContent = r.hoyLargo + (RUTA.length ? ' · ' + RUTA.map(function (m) { return m.nombre; }).join(', ') : '');
  if (mostrarVista !== false) mostrar('vHome');
  iniciarGps();
  renderLista(); renderProxima();
  setTimeout(dibujarMapa, 100);
}
function irHome() { detenerCamara(); mostrar('vHome'); cargarHome(false).catch(function (e) { if (!e.silent) toast(e.message, 'err'); }); }

var ETQ = { ACTIVA: 'ACTIVA', PROXIMA: 'PRÓXIMA', ATRAPADA: 'ATRAPADA ✓', 'NO CUMPLIDO': 'NO CUMPLIDO', 'PENDIENTE FOTO': 'SIN TERMINAR' };
function renderLista() {
  if (!MONEDAS.length) { $('#hLista').innerHTML = '<div class="muted">No tiene monedas asignadas para hoy.</div>'; return; }
  $('#hLista').innerHTML = MONEDAS.map(function (p, i) {
    var est = estadoActual(p), apag = est === 'PROXIMA' || est === 'NO CUMPLIDO';
    return '<button class="mrow" onclick="abrirMoneda(' + i + ')"><div class="mini' + (apag ? ' apagada' : '') + '">' + coinSVG(Object.assign(nombreMoneda(), { punto: p.qrNombre, hora: p.hora })) + '</div>' +
      '<div style="flex:1;min-width:0"><b style="display:block">' + esc(p.hora) + ' · ' + esc(p.qrNombre) + '</b><span class="small muted">Ventana ' + esc(p.desde) + '–' + esc(p.hasta) +
      (p.horaEscaneo ? ' · atrapada ' + esc(p.horaEscaneo) + (p.por ? ' por ' + esc(p.por) : '') : '') + '</span></div>' +
      '<span class="est ' + est.replace(' ', '-') + '">' + ETQ[est] + '</span></button>';
  }).join('');
}
function proximaMoneda() {
  return MONEDAS.find(function (p) { var e = estadoActual(p); return e === 'ACTIVA' || e === 'PENDIENTE FOTO'; }) ||
    MONEDAS.find(function (p) { return estadoActual(p) === 'PROXIMA'; }) || null;
}
function renderProxima() {
  var p = proximaMoneda(), c = $('#proxCard');
  if (!p) { c.innerHTML = '<div class="center"><b>' + (MONEDAS.length ? 'No le quedan monedas por atrapar hoy.' : 'Sin monedas asignadas hoy.') + '</b></div>'; return; }
  var est = estadoActual(p), d = GEO ? distM(GEO, p) : null;
  var sub = est === 'PROXIMA' ? 'Disponible desde las ' + p.desde + ' · vuelva a la hora indicada' : 'Ventana ' + p.desde + ' – ' + p.hasta;
  c.innerHTML = '<div style="display:flex;gap:12px;align-items:center"><div class="mini' + (est === 'PROXIMA' ? ' apagada' : '') + '" style="width:58px;height:58px">' + coinSVG(Object.assign(nombreMoneda(), { punto: p.qrNombre, hora: p.hora })) + '</div>' +
    '<div style="flex:1"><div class="small" style="font-weight:700;color:var(--gris)">PRÓXIMA MONEDA</div><div style="font-size:18px;font-weight:800;color:var(--azul)">' + esc(p.qrNombre) + ' · ' + esc(p.hora) + '</div><div class="small muted">' + esc(sub) + '</div></div>' +
    '<div class="right"><div id="proxDist" style="font-size:21px;font-weight:800;color:var(--azul2)">' + fmtDist(d) + '</div></div></div>' +
    '<button class="big-btn" style="background:var(--azul);color:#fff" onclick="abrirMoneda(' + MONEDAS.indexOf(p) + ')">Ir a la moneda</button>';
}

/* ---------- mapa de monedas (Google Maps) ---------- */
async function dibujarMapa() {
  if (!MONEDAS.length && !GEO) { $('#hMap').hidden = true; return; }
  $('#hMap').hidden = false;
  try { if (!MAPA) MAPA = await gmMapa($('#hMap'), { streetViewControl: false, mapTypeControl: false, fullscreenControl: false }); }
  catch (e) { $('#hMap').hidden = true; return; }
  if (CAPA) CAPA.setMap(null);
  CAPA = new Capa();
  MONEDAS.forEach(function (p, i) {
    var est = estadoActual(p), d = document.createElement('div');
    d.className = 'coin-mk ' + est.toLowerCase().replace(' ', '-');
    d.innerHTML = coinSVG(Object.assign(nombreMoneda(), { punto: p.qrNombre, hora: p.hora })) +
      '<span class="tag" style="background:' + ({ ACTIVA: '#c98a00', PROXIMA: '#6b7690', ATRAPADA: '#15925a', 'NO CUMPLIDO': '#cf3b3b', 'PENDIENTE FOTO': '#c98a00' }[est]) + '">' + esc(p.hora) + '</span>';
    var mk = new google.maps.marker.AdvancedMarkerElement({ position: { lat: p.lat, lng: p.lng }, content: d, title: p.hora + ' · ' + p.qrNombre });
    mk.addListener('click', function () { abrirMoneda(i); });
    CAPA.add(mk);
    CAPA.add(gmCirculo(p.lat, p.lng, p.radio || 30, est === 'ACTIVA' ? '#c98a00' : '#1a4fa3', .12));
  });
  CAPA.setMap(MAPA);
  pintarYo();
  var pts = MONEDAS.map(function (p) { return [p.lat, p.lng]; });
  if (GEO) pts.push([GEO.lat, GEO.lng]);
  gmAjustar(MAPA, pts, 17);
}
function pintarYo() {
  if (!MAPA || !GEO || !window.google) return;
  if (!YO_MK) { var d = document.createElement('div'); d.className = 'yo'; YO_MK = new google.maps.marker.AdvancedMarkerElement({ position: GEO, content: d, title: 'Usted' }); }
  YO_MK.position = { lat: GEO.lat, lng: GEO.lng }; YO_MK.map = MAPA;
}
function actualizarDistancias() {
  pintarYo();
  var p = proximaMoneda(), el = $('#proxDist');
  if (el && p && GEO) el.textContent = fmtDist(distM(GEO, p));
  if (!$('#vMoneda').hidden) renderMoneda();
}
setInterval(function () { if (!$('#vHome').hidden) { renderLista(); renderProxima(); } else if (!$('#vMoneda').hidden) renderMoneda(); }, 15000);

/* ---------- acercarse a la moneda ---------- */
function abrirMoneda(i) {
  SEL = MONEDAS[i];
  if (!SEL) return;
  $('#mTit').textContent = SEL.qrNombre + ' · ' + SEL.hora;
  $('#mSub').textContent = SEL.mallaNombre + ' · ventana ' + SEL.desde + ' – ' + SEL.hasta;
  $('#mCoin').innerHTML = coinSVG(Object.assign(nombreMoneda(), { punto: SEL.qrNombre, hora: SEL.hora }));
  $('#mIr').href = 'https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=' + SEL.lat + ',' + SEL.lng;
  mostrar('vMoneda');
  iniciarGps();
  renderMoneda();
}
function renderMoneda() {
  if (!SEL) return;
  var est = estadoActual(SEL), d = GEO ? distM(GEO, SEL) : null, radio = SEL.radio || 30;
  var cerca = d !== null && d <= radio + Math.min(GEO.acc || 0, 20);
  $('#mDist').textContent = fmtDist(d);
  $('#mDist').style.color = cerca ? '#3ddc84' : '#fff';
  $('#mGps').textContent = GEO ? 'GPS ±' + Math.round(GEO.acc) + ' m · radio para atrapar: ' + radio + ' m' : 'Obteniendo su ubicación...';
  $('#mCoin').className = 'coin' + (est === 'PROXIMA' || est === 'NO CUMPLIDO' ? ' apagada' : '');
  var msg = $('#mMsg'), btn = $('#mBtn');
  btn.disabled = true; btn.textContent = 'Abrir cámara y atrapar';
  if (est === 'ATRAPADA') { msg.className = 'msg ok'; msg.textContent = '✓ Moneda atrapada a las ' + (SEL.horaEscaneo || '') + (SEL.por ? ' por ' + SEL.por : '') + '.'; btn.textContent = 'Moneda atrapada'; return; }
  if (est === 'PROXIMA') {
    var falta = Math.max(0, Math.round((SEL.iniMs - ahora()) / 60000));
    msg.className = 'msg wait'; msg.innerHTML = '<b>Vuelva a la hora indicada: ' + esc(SEL.hora) + '</b><br>La moneda se activa a las ' + esc(SEL.desde) + ' (en ' + (falta >= 60 ? Math.floor(falta / 60) + ' h ' : '') + (falta % 60) + ' min). Aunque esté junto a ella, todavía no se puede atrapar.';
    btn.textContent = 'Disponible a las ' + SEL.desde; return;
  }
  if (est === 'NO CUMPLIDO') {
    msg.className = 'msg bad'; msg.textContent = '❌ NO CUMPLIDO · Debió estar aquí a las ' + SEL.hora + ' (plazo hasta las ' + SEL.hasta + ').';
    btn.textContent = 'Plazo vencido';
    if (cerca && !SEL.llegoTarde && !TARDE_ENVIADA[SEL.id]) {   // deja constancia de la llegada tardía
      TARDE_ENVIADA[SEL.id] = 1;
      api('polAtrapar', TOKEN, SEL.id, GEO, navigator.userAgent).then(function (r) { if (r.bloqueo) toast('Llegada tardía registrada como NO CUMPLIDO.', 'err', 6000); }).catch(function () { });
    }
    return;
  }
  if (est === 'PENDIENTE FOTO') { msg.className = 'msg wait'; msg.textContent = 'Tiene una moneda sin terminar. Ábrala para atraparla.'; btn.disabled = false; btn.textContent = 'Terminar de atrapar'; return; }
  // ACTIVA
  if (!GEO) { msg.className = 'msg wait'; msg.textContent = 'Active el GPS para saber a qué distancia está.'; return; }
  if (!cerca) { msg.className = 'msg wait'; msg.innerHTML = '<b>Acérquese a la moneda</b><br>Está a ' + fmtDist(d) + '. Debe estar a menos de ' + radio + ' m.'; btn.textContent = 'Acérquese a la moneda'; return; }
  msg.className = 'msg ok'; msg.innerHTML = '<b>¡Moneda activa!</b> Está dentro del radio y en su horario.';
  btn.disabled = false;
}

/* ---------- atrapar: valida en el servidor y abre la cámara ---------- */
async function pedirBrujula() {
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      var r = await DeviceOrientationEvent.requestPermission();
      if (r === 'denied') toast('Sin permiso de brújula: la moneda aparecerá sin seguir el giro.', 'err', 6000);
    }
  } catch (e) { }
}
async function atrapar() {
  if (OCUPADO || !SEL) return;
  OCUPADO = true;
  var btn = $('#mBtn'); btn.disabled = true; btn.textContent = '⏳ Verificando...';
  await pedirBrujula();   // iOS pide permiso desde un toque del usuario
  try {
    if (!GEO || Date.now() - GEO.t > 15000) throw new Error('Esperando una ubicación actualizada del GPS. Intente en unos segundos.');
    RESP = await api('polAtrapar', TOKEN, SEL.id, GEO, navigator.userAgent);
    OCUPADO = false;
    if (RESP.bloqueo) { mostrarBloqueo(RESP.bloqueo); return; }
    if (RESP.escaneo && RESP.escaneo.validez === 'NO VALIDO') { mostrarResultado(RESP); return; }
    if (RESP.retos && RESP.retos.length) { RETO = RESP.retos[0]; abrirAR(); return; }
    mostrarResultado(RESP);
  } catch (e) {
    OCUPADO = false;
    if (!e.silent) toast(String(e.message).replace(/^GPS_\w+:\s*/, ''), 'err', 7000);
    renderMoneda();
  }
}

/* ---------- cámara: la moneda aparece en una dirección al azar ---------- */
async function abrirAR() {
  mostrar('vAR');
  var dir = { DERECHA: 'HACIA SU DERECHA', IZQUIERDA: 'HACIA SU IZQUIERDA', ATRAS: 'DETRÁS DE USTED' }[RETO.codigo] || RETO.codigo;
  $('#arTit').textContent = 'La moneda está ' + dir;
  $('#arTxt').textContent = 'Gire con el celular hasta tenerla en el centro y tóquela.';
  $('#arCoinIn').innerHTML = coinSVG(Object.assign(nombreMoneda(), { punto: SEL.qrNombre, hora: SEL.hora }));
  H0 = null; HEAD = null; SIN_BRUJULA = false;
  iniciarCuenta(RESP.segundosRestantes || 120);
  try {
    detenerCamara();
    STREAM = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
    $('#arVid').srcObject = STREAM; await $('#arVid').play();
  } catch (e) {
    $('#arEstado').innerHTML = '<b>No se pudo abrir la cámara.</b> Permita el acceso (candado 🔒 → Permisos → Cámara) y vuelva a intentar.';
    return;
  }
  ORIENT = function (ev) {
    var h = null;
    if (typeof ev.webkitCompassHeading === 'number') h = ev.webkitCompassHeading;          // iPhone
    else if (ev.absolute !== false && typeof ev.alpha === 'number') h = (360 - ev.alpha) % 360; // Android
    if (h === null) return;
    HEAD = h;
    if (H0 === null) H0 = h;
  };
  window.addEventListener('deviceorientationabsolute', ORIENT);
  window.addEventListener('deviceorientation', ORIENT);
  setTimeout(function () { if (HEAD === null) SIN_BRUJULA = true; }, 2000);
  requestAnimationFrame(cuadroAR);
}
function difAng(a) { return ((a + 540) % 360) - 180; }
function cuadroAR() {
  if ($('#vAR').hidden) return;
  var coin = $('#arCoin'), fl = $('#arFlecha'), W = window.innerWidth, listo = false;
  if (SIN_BRUJULA) {
    // sin brújula: la moneda aparece al centro (queda anotado en el dispositivo)
    coin.style.left = (W / 2) + 'px'; coin.style.opacity = 1; fl.hidden = true; listo = true;
    $('#arEstado').textContent = 'Gire ' + ($('#arTit').textContent.replace('La moneda está ', '').toLowerCase()) + ' y toque la moneda.';
  } else if (HEAD !== null && H0 !== null) {
    var objetivo = (H0 + (RETO.angulo || 90) + 360) % 360;
    var d = difAng(objetivo - HEAD);             // >0: la moneda está a la derecha
    var x = W / 2 + (d / 30) * (W / 2);           // ~60° de campo visual
    coin.style.left = x + 'px';
    coin.style.opacity = Math.abs(d) < 40 ? 1 : 0;
    listo = Math.abs(d) < 14;
    fl.hidden = Math.abs(d) < 40;
    fl.textContent = d > 0 ? '➜' : '⬅';
    fl.style.left = d > 0 ? 'auto' : '18px'; fl.style.right = d > 0 ? '18px' : 'auto';
    $('#arEstado').textContent = listo ? '¡La tiene en el centro! Tóquela para atraparla.' : 'Siga girando ' + (d > 0 ? 'a la derecha' : 'a la izquierda') + '...';
  } else {
    coin.style.opacity = 0; $('#arEstado').textContent = 'Calibrando la brújula... mueva el celular en forma de 8.';
  }
  coin.className = listo ? 'listo' : '';
  coin.dataset.listo = listo ? '1' : '';
  requestAnimationFrame(cuadroAR);
}
function iniciarCuenta(seg) {
  clearInterval(CD_TIMER);
  LIMITE = Date.now() + seg * 1000;
  var tick = function () {
    var s = Math.max(0, Math.round((LIMITE - Date.now()) / 1000));
    $('#arCd').textContent = '⏱ ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    if (s <= 0) { clearInterval(CD_TIMER); detenerCamara(); mostrarBloqueo({ tipo: 'TIEMPO', titulo: 'Se agotó el tiempo', punto: SEL.qrNombre, texto: 'No atrapó la moneda a tiempo. Vuelva a intentarlo mientras esté en su horario.' }); }
  };
  tick(); CD_TIMER = setInterval(tick, 500);
}
function detenerCamara() {
  clearInterval(CD_TIMER);
  if (ORIENT) { window.removeEventListener('deviceorientationabsolute', ORIENT); window.removeEventListener('deviceorientation', ORIENT); ORIENT = null; }
  if (STREAM) { STREAM.getTracks().forEach(function (t) { t.stop(); }); STREAM = null; }
}
function cancelarAR() { detenerCamara(); abrirMoneda(MONEDAS.indexOf(SEL)); }

/** Al tocar la moneda se toma la foto de evidencia (cámara en vivo, sin galería) */
async function tocarMoneda() {
  if (OCUPADO) return;
  if ($('#arCoin').dataset.listo !== '1') { toast('Gire hasta tener la moneda en el centro.', 'err'); return; }
  var v = $('#arVid');
  if (!v.videoWidth) { toast('La cámara aún no está lista.', 'err'); return; }
  OCUPADO = true;
  $('#arFlash').style.opacity = 1; setTimeout(function () { $('#arFlash').style.opacity = 0; }, 250);
  var W = Math.min(1280, v.videoWidth), H = Math.round(v.videoHeight * W / v.videoWidth);
  var c = $('#arCan'); c.width = W; c.height = H;
  var g = c.getContext('2d'); g.drawImage(v, 0, 0, W, H);
  var e = RESP.escaneo, fs = Math.max(16, Math.round(W / 42));
  var lineas = ['Moneda: ' + e.qrNombre + ' ' + (e.horaEsperada || '') + ' · Dirección: ' + RETO.codigo + (SIN_BRUJULA ? ' (sin brújula)' : ''),
    new Date().toLocaleString('es-EC') + ' · ' + USER.grado + ' ' + USER.nombres,
    'GPS ' + Number(GEO.lat).toFixed(6) + ', ' + Number(GEO.lng).toFixed(6) + ' (±' + Math.round(GEO.acc) + ' m) · a ' + e.distanciaM + ' m de la moneda'];
  var bh = fs * 1.45 * lineas.length + fs;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - bh, W, bh);
  g.fillStyle = '#fff'; g.font = '600 ' + fs + 'px system-ui,Arial';
  lineas.forEach(function (l, i) { g.fillText(l, fs * .6, H - bh + fs * 1.3 + i * fs * 1.45); });
  try {
    var r = await api('polSubirFoto', TOKEN, e.id, RETO.codigo, c.toDataURL('image/jpeg', 0.78));
    OCUPADO = false;
    if (r.retos && r.retos.length) { RESP = r; RETO = r.retos[0]; abrirAR(); return; }
    detenerCamara(); mostrarResultado(r);
  } catch (err) { OCUPADO = false; if (!err.silent) toast(err.message, 'err', 7000); }
}

/* ---------- pantallas de resultado ---------- */
function mostrarBloqueo(b) {
  detenerCamara(); mostrar('vRes');
  var cfg = {
    ADELANTADO: { ico: '⏰', col: '#c98a00', fondo: '#fff3c4', grande: 'Vuelva a las ' + b.horaProgramada },
    POSTERGADO: { ico: '⌛', col: '#cf3b3b', fondo: '#fde2e2', grande: 'Debió estar aquí a las ' + b.horaProgramada },
    FUERA_MALLA: { ico: '🚫', col: '#cf3b3b', fondo: '#fde2e2', grande: '' },
    TIEMPO: { ico: '⏱', col: '#c98a00', fondo: '#fff3c4', grande: '' }
  }[b.tipo] || { ico: 'ℹ️', col: '#1a4fa3', fondo: '#e8eef9', grande: '' };
  $('#resBox').innerHTML = '<div class="res-ico">' + cfg.ico + '</div><h2 style="color:' + cfg.col + '">' + esc(b.titulo) + '</h2><p class="muted">' + esc(b.punto || '') + (b.malla ? ' · ' + esc(b.malla) : '') + '</p>' +
    '<div style="background:' + cfg.fondo + ';border:2px solid ' + cfg.col + ';border-radius:14px;padding:16px;margin-top:10px">' +
    (cfg.grande ? '<div style="font-size:26px;font-weight:800;color:' + cfg.col + '">' + esc(cfg.grande) + '</div>' : '') +
    '<div style="margin-top:6px">' + esc(b.texto) + '</div></div>';
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
}
function mostrarResultado(r) {
  var e = r.escaneo;
  mostrar('vRes');
  if (e.validez === 'NO VALIDO') {
    $('#resBox').innerHTML = '<div class="res-ico">❌</div><h2>NO VÁLIDO</h2><p class="muted">' + esc(e.qrNombre) + '</p>' +
      '<div class="banner" style="background:var(--rojo2);border-color:#f3b6b6;color:#8a1f1f;text-align:left">' + esc(e.motivo) + '<br>Quedó registrado con su ubicación real. Para atrapar la moneda debe estar junto a ella.</div>';
    return;
  }
  var ok = e.validez === 'VALIDO', dif = e.minutosDif === '' || e.minutosDif == null ? '' : ' (' + (Number(e.minutosDif) > 0 ? '+' : '') + e.minutosDif + ' min)';
  var html = '<div style="width:150px;height:150px;margin:0 auto">' + coinSVG(Object.assign(nombreMoneda(), { punto: e.qrNombre, hora: e.horaEsperada })) + '</div>' +
    '<h2>' + (ok ? '¡Moneda atrapada!' : 'Moneda pendiente') + '</h2><p class="muted">' + esc(r.mensaje || '') + '</p><div style="text-align:left">' +
    '<div class="kv"><span>Estado</span>' + (ok ? '<span class="badge b-ok">VÁLIDO</span>' : '<span class="badge b-warn">' + esc(e.validez) + '</span>') + '</div>' +
    '<div class="kv"><span>Hora</span><b>' + esc(e.hora) + '</b></div>' +
    '<div class="kv"><span>Programado</span><span><b>' + esc(e.horaEsperada) + '</b>' + dif + ' <span class="badge b-ok">A TIEMPO</span></span></div>' +
    '<div class="kv"><span>Ubicación</span><span>a ' + esc(e.distanciaM) + ' m de la moneda ✓</span></div>' +
    (e.nFotos ? '<div class="kv"><span>Foto de evidencia</span><span class="badge b-ok">Tomada (' + esc(RETO ? RETO.codigo : '') + ')</span></div>' : '') +
    (e.ordenCorrecto === 'NO' ? '<div class="kv"><span>Orden</span><span class="badge b-bad">Fuera de orden</span></div>' : '') + '</div>';
  if (ok && r.siguiente) html += '<div class="card mt" style="text-align:left;background:var(--azul3)"><b>Siguiente moneda:</b><br>' + esc(r.siguiente.qrNombre) + ' a las <b>' + esc(r.siguiente.hora) + '</b></div>';
  else if (ok) html += '<div class="card mt" style="background:var(--verde2)"><b>Completó sus monedas de esta malla.</b></div>';
  $('#resBox').innerHTML = html;
  if (navigator.vibrate) navigator.vibrate(ok ? 160 : [80, 60, 80]);
}

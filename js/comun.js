/* =====================================================================
 *  Funciones comunes (panel y app policial)
 * ===================================================================== */
function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
function val(s) { var e = $(s); return e ? e.value : ''; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } }
function normCedula(v) { var s = String(v || '').replace(/\D/g, ''); if (s.length === 9) s = '0' + s; return s; }

/** URL base donde está publicado el frontend (carpeta de GitHub Pages) */
function baseUrl() { return location.origin + location.pathname.replace(/[^\/]*$/, ''); }

/** Se asigna en cada página: qué hacer cuando la sesión expira */
var alExpirar = null;

/**
 * Llama a una función del backend de Apps Script.
 * Se usa Content-Type text/plain para evitar el "preflight" CORS (Apps Script no lo soporta).
 */
async function api(fn) {
  var args = [].slice.call(arguments, 1);
  if (!API_URL || API_URL.indexOf('PEGUE_AQUI') > -1) throw new Error('Configure API_URL en js/config.js');
  var resp, j;
  try {
    resp = await fetch(API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args })
    });
  } catch (e) {
    throw new Error('Sin conexión con el servidor. Verifique su internet e intente de nuevo.');
  }
  try { j = await resp.json(); }
  catch (e) { throw new Error('Respuesta inválida del servidor. Revise API_URL y que el Web App tenga acceso "Cualquier persona".'); }
  if (!j.ok) {
    var err = new Error(j.error || 'Error desconocido');
    if (String(j.error).indexOf('SESION_EXPIRADA') > -1) {
      err.silent = true;
      toast('Su sesión expiró. Ingrese nuevamente.', 'err');
      if (typeof alExpirar === 'function') alExpirar();
    }
    throw err;
  }
  return j.data;
}

function toast(msg, tipo, ms) {
  var d = document.createElement('div');
  d.className = 'toast ' + (tipo || '');
  d.textContent = msg;
  var cont = $('#toast');
  while (cont.children.length >= 3) cont.removeChild(cont.firstChild);
  cont.appendChild(d);
  setTimeout(function () { d.remove(); }, ms || (tipo === 'err' ? 6000 : 3500));
}

async function run(btn, fn) {
  var txt;
  try {
    if (btn && btn.tagName) { btn.disabled = true; txt = btn.innerHTML; btn.innerHTML = '⏳ ' + txt; }
    return await fn();
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
  finally { if (btn && btn.tagName) { btn.disabled = false; btn.innerHTML = txt; } }
}

/** Pone el nombre de la app/institución en los elementos marcados */
document.addEventListener('DOMContentLoaded', function () {
  $$('[data-app-nombre]').forEach(function (e) { e.textContent = APP_NOMBRE; });
  $$('[data-institucion]').forEach(function (e) { e.textContent = INSTITUCION; });
});

/* =====================================================================
 *  GOOGLE MAPS - carga y ayudas para dibujar
 * ===================================================================== */
var _gmCarga = null;

function cargarGoogleMaps() {
  if (window.google && google.maps && google.maps.marker) return Promise.resolve();
  if (_gmCarga) return _gmCarga;
  _gmCarga = new Promise(function (res, rej) {
    if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_KEY.indexOf('PEGUE_AQUI') > -1) { _gmCarga = null; rej(new Error('Configure GOOGLE_MAPS_KEY en js/config.js')); return; }
    window.__gmListo = function () { res(); };
    window.gm_authFailure = function () {
      toast('Google Maps rechazó la clave. Revise: clave correcta, "Maps JavaScript API" habilitada, facturación activa y que la restricción de sitios incluya esta dirección.', 'err', 15000);
    };
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_KEY) +
      '&v=weekly&libraries=marker&language=es&region=EC&loading=async&callback=__gmListo';
    s.async = true;
    s.onerror = function () { _gmCarga = null; rej(new Error('No se pudo cargar Google Maps. Verifique su conexión.')); };
    document.head.appendChild(s);
  });
  return _gmCarga;
}

/** Crea un mapa de Google en el elemento (calles, satélite, híbrido, relieve y Street View) */
async function gmMapa(el, opciones) {
  await cargarGoogleMaps();
  var m = new google.maps.Map(el, Object.assign({
    center: { lat: -1.83, lng: -78.18 }, zoom: 7,
    mapId: GOOGLE_MAP_ID || 'DEMO_MAP_ID',
    mapTypeId: 'roadmap',
    mapTypeControl: true,
    mapTypeControlOptions: { mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'], style: google.maps.MapTypeControlStyle.DROPDOWN_MENU },
    streetViewControl: true, fullscreenControl: true, scaleControl: true,
    gestureHandling: 'greedy', clickableIcons: false
  }, opciones || {}));
  m.__info = new google.maps.InfoWindow();
  return m;
}

/** Grupo de elementos que se muestran/ocultan juntos (una "capa") */
function Capa() { this.items = []; this.map = null; }
Capa.prototype.add = function (o) { this.items.push(o); if (this.map) gmSetMap(o, this.map); return o; };
Capa.prototype.setMap = function (m) { var self = this; this.map = m; this.items.forEach(function (o) { gmSetMap(o, m); }); return self; };
function gmSetMap(o, m) { if (typeof o.setMap === 'function') o.setMap(m); else o.map = m; }

function gmPopup(map, marker, html) {
  if (!html) return;
  marker.addListener('click', function () { map.__info.setContent(html); map.__info.open({ map: map, anchor: marker }); });
}

/** Marcador redondo con número (orden) */
function gmNum(map, lat, lng, n, color, html, titulo) {
  var d = document.createElement('div');
  d.className = 'gm-num'; d.style.background = color; d.textContent = n;
  var mk = new google.maps.marker.AdvancedMarkerElement({ position: { lat: Number(lat), lng: Number(lng) }, content: d, title: titulo || '' });
  gmPopup(map, mk, html);
  return mk;
}

/** Punto pequeño */
function gmPunto(map, lat, lng, relleno, tam, titulo, html, borde) {
  var d = document.createElement('div');
  d.className = 'gm-dot';
  d.style.width = d.style.height = tam + 'px';
  d.style.background = relleno; d.style.borderColor = borde || '#fff';
  var mk = new google.maps.marker.AdvancedMarkerElement({ position: { lat: Number(lat), lng: Number(lng) }, content: d, title: titulo || '' });
  gmPopup(map, mk, html);
  return mk;
}

/** Círculo de cobertura (radio en metros) */
function gmCirculo(lat, lng, radio, color, opacidad) {
  return new google.maps.Circle({
    center: { lat: Number(lat), lng: Number(lng) }, radius: Number(radio), clickable: false,
    strokeColor: color, strokeOpacity: .9, strokeWeight: 1.5, fillColor: color, fillOpacity: opacidad == null ? .3 : opacidad
  });
}

/** Línea de ruta; opcionalmente punteada y con flechas de dirección */
function gmLinea(path, color, peso, punteada, flechas) {
  var icons = [];
  if (punteada) icons.push({ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, scale: peso }, offset: '0', repeat: (peso * 5) + 'px' });
  if (flechas) icons.push({ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: color, fillColor: color, fillOpacity: 1 }, offset: '50%', repeat: '140px' });
  return new google.maps.Polyline({
    path: path.map(function (p) { return { lat: Number(p[0]), lng: Number(p[1]) }; }),
    strokeColor: color, strokeOpacity: punteada ? 0 : .85, strokeWeight: peso, icons: icons, clickable: false
  });
}

/** Encuadra el mapa en los puntos [[lat,lng],...] */
function gmAjustar(map, pts, maxZoom) {
  maxZoom = maxZoom || 18;
  if (!pts.length) return;
  if (pts.length === 1) { map.setCenter({ lat: Number(pts[0][0]), lng: Number(pts[0][1]) }); map.setZoom(maxZoom); return; }
  var b = new google.maps.LatLngBounds();
  pts.forEach(function (p) { b.extend({ lat: Number(p[0]), lng: Number(p[1]) }); });
  map.fitBounds(b, 50);
  google.maps.event.addListenerOnce(map, 'idle', function () { if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
}

/** Lee lat/lng de una posición de Google (LatLng o literal) */
function gmLatLng(p) { return { lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng }; }

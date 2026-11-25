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
  $('#toast').appendChild(d);
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

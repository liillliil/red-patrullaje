/* =====================================================================
 *  MONEDA DE PATRULLAJE (SVG)
 *  Contorno: grado y nombres del policía · Centro: JD · Abajo: punto y hora
 *  coinSVG({ grado, nombres, punto, hora }) -> texto SVG (viewBox 0 0 400 400)
 * ===================================================================== */
var _coinN = 0;
function coinSVG(o) {
  o = o || {};
  var id = 'mc' + (++_coinN);
  var top = ((o.grado ? o.grado + ' ' : '') + (o.nombres || '')).toUpperCase();
  var bot = (o.punto || '').toUpperCase() + (o.hora ? '  ·  ' + o.hora : '');
  // tamaño de letra según largo (arco superior ~ 380px útiles)
  // tamaño según el largo del texto para que siempre quepa en el arco
  var fsTop = Math.max(10, Math.min(21, 330 / (Math.max(8, top.length) * 0.74)));
  var fsBot = Math.max(9, Math.min(17, 300 / (Math.max(8, bot.length) * 0.72)));
  function arc(r, a1, a2, sweep) { // grados, 0 = derecha, sentido horario
    var p = function (a) { var t = a * Math.PI / 180; return (200 + r * Math.cos(t)).toFixed(2) + ' ' + (200 + r * Math.sin(t)).toFixed(2); };
    var large = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return 'M ' + p(a1) + ' A ' + r + ' ' + r + ' 0 ' + large + ' ' + sweep + ' ' + p(a2);
  }
  function star(cx, cy, r) {
    var s = ''; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; s += (cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1) + ' '; }
    return '<polygon points="' + s + '" fill="url(#' + id + 'g2)" stroke="#7a5a12" stroke-width=".8"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%" role="img" aria-label="Moneda de ' + esc_(top) + '">' +
  '<defs>' +
  '<linearGradient id="' + id + 'g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".25" stop-color="#e9c55a"/><stop offset=".5" stop-color="#a87b18"/><stop offset=".75" stop-color="#f2d675"/><stop offset="1" stop-color="#8a6210"/></linearGradient>' +
  '<linearGradient id="' + id + 'g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".5" stop-color="#d9ad3c"/><stop offset="1" stop-color="#9c7016"/></linearGradient>' +
  '<radialGradient id="' + id + 'g3" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fbeaa5"/><stop offset=".45" stop-color="#d8b04a"/><stop offset=".8" stop-color="#b08a2c"/><stop offset="1" stop-color="#8d6a17"/></radialGradient>' +
  '<radialGradient id="' + id + 'gs" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#e9edf2"/><stop offset=".6" stop-color="#a9b0b8"/><stop offset="1" stop-color="#7d858e"/></radialGradient>' +
  '<filter id="' + id + 'em" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b"/><feOffset dx="2" dy="3" result="o"/><feFlood flood-color="#4a3206" flood-opacity=".75"/><feComposite in2="o" operator="in" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
  '<filter id="' + id + 'sh"><feDropShadow dx="0" dy="1.2" stdDeviation=".6" flood-color="#000" flood-opacity=".55"/></filter>' +
  '<path id="' + id + 'pt" d="' + arc(129, 180, 360, 1) + '"/>' +
  '<path id="' + id + 'pb" d="' + arc(145, 176, 4, 0) + '"/>' +
  // texturas de cepillado del centro
  '<pattern id="' + id + 'br" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-opacity=".08" stroke-width="2"/></pattern>' +
  '</defs>' +
  // canto
  '<circle cx="200" cy="200" r="198" fill="url(#' + id + 'g1)"/>' +
  '<circle cx="200" cy="200" r="190" fill="none" stroke="#7a5a12" stroke-width="1.5" opacity=".6"/>' +
  // anillo tricolor
  '<circle cx="200" cy="200" r="172" fill="#0b3d91"/>' +
  '<path d="' + arc(172, 180, 360, 1) + ' L 200 200 Z" fill="#ffd100"/>' +
  '<path d="' + arc(172, 56, 124, 1) + ' L 200 200 Z" fill="#d52b1e"/>' +
  '<circle cx="200" cy="200" r="160" fill="#0b3d91"/>' +
  '<path d="' + arc(160, 180, 360, 1) + ' L 200 200 Z" fill="#ffd100"/>' +
  '<circle cx="200" cy="200" r="172" fill="none" stroke="url(#' + id + 'g2)" stroke-width="3"/>' +
  // banda plateada con el nombre
  '<circle cx="200" cy="200" r="150" fill="url(#' + id + 'gs)"/>' +
  '<path d="' + arc(150, 0, 180, 1) + ' L 200 200 Z" fill="#0b3d91"/>' +
  '<circle cx="200" cy="200" r="150" fill="none" stroke="url(#' + id + 'g2)" stroke-width="3"/>' +
  '<circle cx="200" cy="200" r="122" fill="none" stroke="url(#' + id + 'g2)" stroke-width="4"/>' +
  '<text font-family="Georgia,\'Times New Roman\',serif" font-weight="700" font-size="' + fsTop.toFixed(1) + '" fill="url(#' + id + 'g2)" stroke="#5c430c" stroke-width=".5" letter-spacing="1.2" filter="url(#' + id + 'sh)"><textPath href="#' + id + 'pt" startOffset="50%" text-anchor="middle">' + esc_(top) + '</textPath></text>' +
  '<text font-family="Georgia,\'Times New Roman\',serif" font-weight="700" font-size="' + fsBot.toFixed(1) + '" fill="url(#' + id + 'g2)" stroke="#5c430c" stroke-width=".4" letter-spacing="1" filter="url(#' + id + 'sh)"><textPath href="#' + id + 'pb" startOffset="50%" text-anchor="middle">' + esc_(bot) + '</textPath></text>' +
  star(64, 200, 11) + star(336, 200, 11) +
  // centro dorado con JD
  '<circle cx="200" cy="200" r="120" fill="url(#' + id + 'g3)"/>' +
  '<circle cx="200" cy="200" r="120" fill="url(#' + id + 'br)"/>' +
  '<circle cx="200" cy="200" r="104" fill="none" stroke="#8d6a17" stroke-width="1.2" stroke-dasharray="2 4" opacity=".7"/>' +
  '<g filter="url(#' + id + 'em)"><text x="200" y="242" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-weight="900" font-size="118" fill="url(#' + id + 'g2)" stroke="#6b4b0b" stroke-width="2.5" letter-spacing="-4">JD</text></g>' +
  '<text x="200" y="272" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="11" fill="#6b4b0b" letter-spacing="3">RED DE PATRULLAJE</text>' +
  // brillo
  '<ellipse cx="150" cy="110" rx="120" ry="60" fill="#fff" opacity=".10" transform="rotate(-30 150 110)"/>' +
  '</svg>';
}
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

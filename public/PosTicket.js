// ---------------------------------------------------------------------------
// El ticket de venta con su QR (Punto Venta › Ventas): se dibuja en la ventana «Ver ticket» y se imprime desde ahí. El diseño sigue el ticket de referencia de Daniel (marca arriba, datos del negocio y de la venta,
// conceptos, subtotal / IVA / total, pago y cambio, «Factura en línea · Tu opinión nos importa», el QR con su código y hasta cuándo vale). Papel térmico de 80 mm; el texto es del negocio y de su cliente final, así que va siempre en español.
// El servidor arma los datos (GET /api/business/pos-sales/:id/ticket); aquí solo se pintan. El QR es una dirección fija que no cambia nunca.
// ---------------------------------------------------------------------------
(function () {
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n) => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 });

// El QR como un solo trazo (un cuadrito por módulo) con su margen blanco: se ve igual en pantalla y al imprimir.
function qrSvg(rows) {
    const n = rows.length;
    let path = '';
    rows.forEach((row, y) => { for (let x = 0; x < n; x += 1) if (row[x] === '1') path += `M${x} ${y}h1v1h-1z`; });
    return `<svg class="tk-qr" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="Código QR del ticket"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
const row = (label, value, cls) => `<div class="tk-row${cls ? ` ${cls}` : ''}"><span class="tk-d">${esc(label)}</span><span class="tk-cur">$</span><span class="tk-n">${money(value)}</span></div>`;

function html(tk) {
    const brandLine = [tk.brand, tk.branch].filter(Boolean).join(' ');
    const head = [brandLine, tk.legalName, tk.rfc, ...(tk.addressLines || [])].filter(Boolean).map((line) => `<div>${esc(line)}</div>`).join('');
    const metas = [
        ['FECHA:', tk.when], tk.servedBy ? ['ATENDIÓ:', tk.servedBy] : null, tk.place ? ['MESA/CAJA:', tk.place] : null,
    ].filter(Boolean).map(([k, v]) => `<div class="tk-m"><span>${esc(k)}</span> ${esc(v)}</div>`).join('');
    const items = (tk.lines || []).map((l) => `<div class="tk-row"><span class="tk-d">${esc(l.concept)}</span><span class="tk-cur">$</span><span class="tk-n">${money(l.total)}</span></div>${Number(l.quantity) !== 1 ? `<div class="tk-qty">${esc(qtyText(l.quantity))} x ${money(l.price)}</div>` : ''}`).join('');
    const pay = tk.payment || tk.received != null
        ? `<div class="tk-sep" aria-hidden="true"></div><div class="tk-tot">${tk.payment ? row(tk.payment, tk.received != null ? tk.received : tk.total) : ''}${tk.change != null ? row('CAMBIO', tk.change) : ''}</div>`
        : '';
    const logo = tk.hasLogo ? `<img class="tk-logo" src="${esc(tk.logoUrl)}" alt="">` : '';
    return `<article class="tk" aria-label="Ticket ${esc(tk.folio)}">
  <header class="tk-brand">${logo}<div class="tk-wordmark">${esc(tk.brand)}</div></header>
  <div class="tk-head">${head}</div>
  <div class="tk-metas">${metas}<div class="tk-no">TICKET # ${esc(tk.folio)}</div></div>
  <div class="tk-sep" aria-hidden="true"></div>
  <div class="tk-items">${items}</div>
  <div class="tk-sep" aria-hidden="true"></div>
  <div class="tk-tot">${row('SUBTOTAL', tk.subtotal)}${row(`IVA${tk.taxLabel ? ` ${tk.taxLabel}` : ''}`, tk.tax)}${row('TOTAL', tk.total, 'tk-big')}</div>
  ${pay}
  <div class="tk-pieces">${esc(qtyText(tk.items))} ARTÍCULOS</div>
  <div class="tk-sep" aria-hidden="true"></div>
  <div class="tk-cta"><b>FACTURA EN LÍNEA</b><div>¡TU OPINIÓN NOS IMPORTA!</div><div>ESCANEA EL CÓDIGO QR</div></div>
  <div class="tk-qrbox">${qrSvg(tk.qrRows || [])}</div>
  <div class="tk-code">CÓDIGO ${esc(tk.code)}</div>
  <div class="tk-until">VIGENTE HASTA ${esc(tk.validUntil)}</div>
  <footer class="tk-foot"><div>${esc(tk.host)}</div><div class="tk-ver">SGN by GEIPSA</div></footer>
</article>`;
}

// Imprime SOLO el ticket: se arma una copia aparte, el resto de la página se esconde al imprimir y el papel se pide de 80 mm de ancho (la regla de la página se pone solo mientras se imprime, para no tocar las demás impresiones).
function print(tk) {
    const root = document.createElement('div');
    root.className = 'tk-print-root';
    root.innerHTML = html(tk);
    const pageStyle = document.createElement('style');
    pageStyle.textContent = '@page { size: 80mm auto; margin: 0; }';
    document.head.appendChild(pageStyle);
    document.body.appendChild(root);
    document.body.classList.add('tk-printing');
    const done = () => {
        document.body.classList.remove('tk-printing');
        root.remove();
        pageStyle.remove();
        window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    const waits = [...root.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; })));
    Promise.all(waits).then(() => window.print());
}

window.PosTicket = { html, print };
})();

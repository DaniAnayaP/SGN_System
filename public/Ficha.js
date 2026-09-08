// ---------------------------------------------------------------------------
// Ficha pública de un artículo (Alta Nuestros Artículos) — what a "Código
// QR" scan opens. No login, no Dashboard.js: this page is meant for an
// external visitor (customer/distributor) reading a printed catalog, not
// someone with an SGN account. Reads GET /api/public/ficha/:token (see
// server.js), a route scoped ONLY by that random token, never by client_id
// or a session — there simply isn't one here.
// ---------------------------------------------------------------------------

const ARTICLE_TYPE_LABELS = {
    'articulo-terminado': 'Artículo Terminado',
    'materia-prima': 'Materia Prima',
};

function initials(name) {
    return (name || '').trim().slice(0, 2).toUpperCase() || '··';
}

function specRow(label, value) {
    if (!value) return '';
    const row = document.createElement('div');
    row.className = 'spec';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    return row;
}

function render(data) {
    const wrap = document.getElementById('wrap');
    wrap.innerHTML = '';

    const brand = document.createElement('div');
    brand.className = 'brand';
    const mark = document.createElement('span');
    mark.className = 'brand-mark';
    mark.textContent = initials(data.companyName);
    const name = document.createElement('span');
    name.className = 'brand-name';
    name.textContent = data.companyName || '';
    brand.append(mark, name);
    wrap.appendChild(brand);

    const photosEl = document.createElement('div');
    photosEl.className = 'photos';
    const order = ['front', 'back', 'left', 'right', 'top', 'bottom'];
    const byLabel = new Map((data.photos || []).map((p) => [p.label, p.url]));
    order.forEach((label, i) => {
        const cell = document.createElement('div');
        cell.className = i === 0 ? 'photo main' : 'photo';
        const url = byLabel.get(label);
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.loading = 'lazy';
            cell.appendChild(img);
        } else {
            cell.classList.add('empty');
            cell.textContent = '—';
        }
        photosEl.appendChild(cell);
    });
    wrap.appendChild(photosEl);

    const info = document.createElement('div');
    info.className = 'info';
    const h1 = document.createElement('h1');
    h1.textContent = data.uniqueDescription || data.knownDescription || data.customDescription || 'Artículo';
    const sub = document.createElement('p');
    sub.className = 'sub';
    const subParts = [data.knownDescription, data.customDescription].filter((v) => v && v !== h1.textContent);
    sub.textContent = subParts.join(' · ');
    info.append(h1, sub);

    const dims = [data.height, data.length, data.width].filter((v) => v);
    const dimsText = dims.length === 3 ? `${data.height} × ${data.length} × ${data.width} cm` : '';

    [
        specRow('Unidad de Medida', data.mainUom),
        specRow('Tipo de Artículo', ARTICLE_TYPE_LABELS[data.articleType] || data.articleType),
        specRow('Dimensiones (Alto × Largo × Ancho)', dimsText),
        specRow('Peso del Artículo', data.articleWeight ? `${data.articleWeight} kg` : ''),
        specRow('Peso del Empaque', data.packageWeight ? `${data.packageWeight} kg` : ''),
    ].forEach((row) => { if (row) info.appendChild(row); });
    wrap.appendChild(info);

    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.textContent = 'Ficha generada por SGN';
    wrap.appendChild(footer);
}

function renderState(message) {
    document.getElementById('wrap').innerHTML = `<div class="state">${message}</div>`;
}

(async function init() {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { renderState('Ficha no encontrada.'); return; }
    try {
        const res = await fetch(`/api/public/ficha/${encodeURIComponent(token)}`);
        if (!res.ok) { renderState('Ficha no encontrada.'); return; }
        const data = await res.json();
        render(data);
    } catch (err) {
        console.error('Ficha: failed to load', err);
        renderState('No se pudo cargar la ficha. Intenta de nuevo.');
    }
})();

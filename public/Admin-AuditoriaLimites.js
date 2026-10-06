// ---------------------------------------------------------------------------
// "Auditoría de Límites" (Configuración SaaS): mide, por cliente, cuántos permisos efectivos de sus usuarios incumplirían la regla
// "ningún nivel da más de lo que le deja el de arriba" (módulo contratado, Estatus visible, contrato del plan). Es solo lectura: no
// bloquea ni cambia nada; sirve para saber qué se vería afectado antes de activar un guardia que sí bloquee. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------
(function () {
    const t = (key, params) => Dashboard.t(key, params);
    const tableBody = document.getElementById('limits-audit-body');
    const summaryEl = document.getElementById('limits-audit-summary');
    const errorEl = document.getElementById('limits-audit-error');
    const emptyEl = document.getElementById('limits-audit-empty');
    const refreshBtn = document.getElementById('limits-audit-refresh');
    let rows = [];
    const expanded = new Set();

    function numberCell(value, strong) {
        const td = document.createElement('td');
        td.className = 'limits-audit-num';
        td.textContent = String(value);
        if (strong && value > 0) td.classList.add('limits-audit-bad');
        return td;
    }
    function textCell(value) {
        const td = document.createElement('td');
        td.textContent = value || '—';
        return td;
    }
    function samplesRow(client) {
        const tr = document.createElement('tr');
        tr.className = 'limits-audit-samples-row';
        const td = document.createElement('td');
        td.colSpan = 9;
        const list = document.createElement('ul');
        list.className = 'limits-audit-samples';
        client.samples.forEach((s) => {
            const li = document.createElement('li');
            const reasons = s.kinds.map((k) => t(`admin.limitsAuditKind_${k}`)).join(', ');
            li.textContent = `${s.user} · ${s.node} · ${reasons}`;
            list.appendChild(li);
        });
        td.appendChild(list);
        tr.appendChild(td);
        return tr;
    }
    function render() {
        tableBody.innerHTML = '';
        emptyEl.hidden = rows.length > 0;
        const total = rows.reduce((acc, r) => ({ grants: acc.grants + r.affectedGrants, users: acc.users + r.usersAffected, clients: acc.clients + (r.affectedGrants ? 1 : 0) }), { grants: 0, users: 0, clients: 0 });
        summaryEl.textContent = rows.length ? t('admin.limitsAuditSummary', { grants: total.grants, users: total.users, clients: total.clients }) : '';
        rows.forEach((client) => {
            const tr = document.createElement('tr');
            tr.appendChild(textCell(client.name));
            tr.appendChild(textCell(client.hasPlan ? client.plan : t('admin.limitsAuditNoPlan')));
            tr.appendChild(numberCell(client.users, false));
            tr.appendChild(numberCell(client.grantsChecked, false));
            tr.appendChild(numberCell(client.usersAffected, true));
            tr.appendChild(numberCell(client.module, true));
            tr.appendChild(numberCell(client.status, true));
            tr.appendChild(numberCell(client.contract, true));
            const actions = document.createElement('td');
            if (client.samples.length) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn btn-secondary limits-audit-toggle';
                btn.setAttribute('data-help-key', 'limitsAuditSamples');
                btn.textContent = t(expanded.has(client.clientId) ? 'admin.limitsAuditHideSamples' : 'admin.limitsAuditShowSamples');
                btn.addEventListener('click', () => {
                    if (expanded.has(client.clientId)) expanded.delete(client.clientId); else expanded.add(client.clientId);
                    render();
                });
                actions.appendChild(btn);
            } else {
                actions.textContent = '—';
            }
            tr.appendChild(actions);
            tableBody.appendChild(tr);
            if (client.samples.length && expanded.has(client.clientId)) tableBody.appendChild(samplesRow(client));
        });
    }
    async function load() {
        errorEl.hidden = true;
        refreshBtn.disabled = true;
        try {
            const res = await fetch('/api/admin/limits-audit', { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            const data = await res.json();
            rows = data.clients || [];
            render();
        } catch {
            errorEl.textContent = t('admin.loadError');
            errorEl.hidden = false;
        } finally {
            refreshBtn.disabled = false;
        }
    }
    refreshBtn.addEventListener('click', load);
    document.addEventListener('dashboard:language-changed', render);

    (async function init() {
        try {
            const role = await Dashboard.initDashboard({ activePage: 'admin-limits-audit' });
            if (!role) return;
            if (role !== 'admin') { window.location.replace('Inicio-en.html'); return; }
            await load();
        } catch (err) {
            console.error('Auditoría de Límites failed to initialize:', err);
        }
    })();
})();

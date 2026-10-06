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
    // Nombres que se leen: el departamento por su etiqueta y el nodo del Árbol Maestro como «Departamento › área › pantalla».
    const SECTION_LABELS = {
        main: 'menu.mainSection', finance: 'menu.finance', accounting: 'menu.accounting', 'human-resources': 'menu.humanResources', marketing: 'menu.marketing',
        commercial: 'menu.commercial', purchasing: 'menu.purchasing', 'supply-chain': 'menu.supplyChain', 'management-control': 'menu.managementControl',
        'general-management': 'menu.generalManagement', 'steering-committee': 'menu.steeringCommittee', certifications: 'menu.certifications',
    };
    const STATUS_LABELS = {
        habilitado: 'admin.masterTreeStatusHabilitadoMed', inhabilitado: 'admin.masterTreeStatusInhabilitado',
        construccion: 'admin.masterTreeStatusConstruccion', mejoras: 'admin.masterTreeStatusMejoras',
    };
    const sectionLabel = (id) => (SECTION_LABELS[id] ? t(SECTION_LABELS[id]) : id);
    const statusLabel = (id) => (STATUS_LABELS[id] ? t(STATUS_LABELS[id]) : id);
    const nodeLabel = (section, item, submenu) => [sectionLabel(section), item, submenu].filter(Boolean).join(' › ');

    function line(text, cls) {
        const li = document.createElement('li');
        li.textContent = text;
        if (cls) li.className = cls;
        return li;
    }
    // Las razones de UN usuario, con cuántos permisos rompe cada una y la causa más probable.
    function userReasons(u) {
        const items = [];
        u.status.groups.forEach((g) => {
            items.push(line(t('admin.limitsAuditReasonStatus', { count: g.count, node: g.nodeKey ? nodeLabel(g.section, g.item, g.submenu) : t('admin.limitsAuditAnyNode'), status: statusLabel(g.nodeStatus) })));
        });
        if (u.status.groupsOmitted) items.push(line(t('admin.limitsAuditMore', { n: u.status.groupsOmitted })));
        if (u.status.total) {
            const lacksHabilitado = !u.visibleStatuses.includes('habilitado');
            const top = u.status.groups[0];
            if (lacksHabilitado) items.push(line(t('admin.limitsAuditCauseUserStatus'), 'limits-audit-cause'));
            else if (top && top.nodeKey) items.push(line(t('admin.limitsAuditCauseTree', { node: nodeLabel(top.section, top.item, top.submenu), status: statusLabel(top.nodeStatus) }), 'limits-audit-cause'));
        }
        u.module.groups.forEach((g) => items.push(line(t('admin.limitsAuditReasonModule', { count: g.count, department: sectionLabel(g.section) }))));
        if (u.module.groupsOmitted) items.push(line(t('admin.limitsAuditMore', { n: u.module.groupsOmitted })));
        u.contract.groups.forEach((g) => items.push(line(t('admin.limitsAuditReasonContract', { count: g.count, node: nodeLabel(g.section, g.item) }))));
        if (u.contract.groupsOmitted) items.push(line(t('admin.limitsAuditMore', { n: u.contract.groupsOmitted })));
        return items;
    }
    function samplesRow(client) {
        const tr = document.createElement('tr');
        tr.className = 'limits-audit-samples-row';
        const td = document.createElement('td');
        td.colSpan = 9;
        const list = document.createElement('ul');
        list.className = 'limits-audit-samples';
        (client.userDetails || []).forEach((u) => {
            const li = document.createElement('li');
            li.className = 'limits-audit-user';
            const head = document.createElement('p');
            head.className = 'limits-audit-user-head';
            const strong = document.createElement('strong');
            strong.textContent = u.user;
            const meta = document.createElement('span');
            meta.textContent = ` (${u.username}) · ${t('admin.limitsAuditUserSees', { statuses: u.visibleStatuses.map(statusLabel).join(', ') })} · ${t('admin.limitsAuditUserCount', { affected: u.affectedGrants, checked: u.grantsChecked })}`;
            head.append(strong, meta);
            const reasons = document.createElement('ul');
            reasons.className = 'limits-audit-reasons';
            userReasons(u).forEach((item) => reasons.appendChild(item));
            li.append(head, reasons);
            list.appendChild(li);
        });
        if (client.userDetailsOmitted) list.appendChild(line(t('admin.limitsAuditMore', { n: client.userDetailsOmitted })));
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

// ---------------------------------------------------------------------------
// "Reinicio del Sistema" (Configuración SaaS): deja el sistema como si nunca se hubiera usado (sin clientes, sin usuarios de clientes, sin
// capturas ni historiales) y conserva la configuración. Tres pasos que sí van en orden: 1) respaldo, 2) ver qué se borra, 3) borrar con la
// frase escrita. Solo admin_saas. El servidor (server.js, /api/admin/system-reset/*) vuelve a exigir cada seguro: respaldo de la última
// hora, frase y la variable ALLOW_SYSTEM_RESET. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------
(function () {
    const t = (key, params) => Dashboard.t(key, params);
    const $ = (id) => document.getElementById(id);
    const el = {
        disabled: $('system-reset-disabled'),
        missing: $('system-reset-missing'),
        unclassified: $('system-reset-unclassified'),
        backupBtn: $('system-reset-backup-btn'),
        downloadBtn: $('system-reset-download-btn'),
        backupStatus: $('system-reset-backup-status'),
        backupDetail: $('system-reset-backup-detail'),
        deleteBody: $('system-reset-delete-body'),
        keepBody: $('system-reset-keep-body'),
        filesLine: $('system-reset-files'),
        detailBody: $('system-reset-detail-body'),
        phraseLabel: $('system-reset-phrase-label'),
        phrase: $('system-reset-phrase'),
        runBtn: $('system-reset-run-btn'),
        result: $('system-reset-result'),
        loginBtn: $('system-reset-login-btn'),
        error: $('system-reset-error'),
    };
    let status = null;
    let running = false;

    const num = (n) => Number(n || 0).toLocaleString();
    const rowsLabel = (n) => t(n === 1 ? 'admin.systemResetRowOne' : 'admin.systemResetRows', { n: num(n) });
    function sizeLabel(bytes) {
        if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    function minutesSince(iso) {
        return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    }
    function showError(message) {
        el.error.textContent = message;
        el.error.hidden = !message;
    }
    function row(label, value, strong) {
        const tr = document.createElement('tr');
        const a = document.createElement('td');
        a.textContent = label;
        const b = document.createElement('td');
        b.className = 'system-reset-num';
        b.textContent = value;
        if (strong) b.classList.add('system-reset-strong');
        tr.append(a, b);
        return tr;
    }

    function groupTotals(rows, groups, field) {
        return groups.map((group) => ({ group, total: rows.filter((r) => r.group === group).reduce((sum, r) => sum + r[field], 0) }));
    }

    function renderBackup() {
        const last = status.lastBackup;
        if (!last) {
            el.backupStatus.textContent = t('admin.systemResetBackupNone');
            el.backupStatus.className = 'system-reset-chip';
            el.backupDetail.textContent = '';
            el.downloadBtn.hidden = true;
            return;
        }
        const minutes = minutesSince(last.createdAt);
        el.backupStatus.textContent = t(status.backupFresh ? 'admin.systemResetBackupFresh' : 'admin.systemResetBackupStale', { minutes });
        el.backupStatus.className = `system-reset-chip ${status.backupFresh ? 'system-reset-chip-ok' : 'system-reset-chip-warn'}`;
        el.backupDetail.textContent = t('admin.systemResetBackupDetail', { file: last.file, size: sizeLabel(last.size), date: new Date(last.createdAt).toLocaleString() });
        el.downloadBtn.hidden = false;
    }

    function renderPreview() {
        const pv = status.preview;
        el.unclassified.hidden = pv.ok;
        el.unclassified.textContent = pv.ok ? '' : t('admin.systemResetUnclassified', { tables: pv.unclassified.join(', ') });
        el.deleteBody.innerHTML = '';
        el.keepBody.innerHTML = '';
        el.detailBody.innerHTML = '';
        if (!pv.ok) return;
        groupTotals(pv.rows, status.groups.delete, 'toDelete').forEach(({ group, total }) => {
            el.deleteBody.appendChild(row(t(`admin.systemResetGroup_${group}`), rowsLabel(total), total > 0));
        });
        el.filesLine.textContent = status.files.configured
            ? (status.files.error ? t('admin.systemResetFilesCountError', { error: status.files.error }) : `${t('admin.systemResetFiles')}: ${num(status.files.count)}`)
            : t('admin.systemResetFilesNone');
        groupTotals(pv.rows, status.groups.keep, 'total').forEach(({ group, total }) => {
            el.keepBody.appendChild(row(t(`admin.systemResetGroup_${group}`), rowsLabel(total), false));
        });
        pv.rows.filter((r) => r.action !== 'keep' || r.total > 0).forEach((r) => {
            const tr = document.createElement('tr');
            [r.table, t(`admin.systemResetAction_${r.action}`), num(r.total), num(r.toDelete)].forEach((value, i) => {
                const td = document.createElement('td');
                td.textContent = value;
                if (i >= 2) td.className = 'system-reset-num';
                tr.appendChild(td);
            });
            el.detailBody.appendChild(tr);
        });
    }

    // Lo que todavía impide borrar, en palabras: el botón gris dice qué le falta.
    function missingItems() {
        if (!status) return [];
        const items = [];
        if (!status.enabled) items.push(t('admin.systemResetMissingVariable'));
        if (!status.backupFresh) items.push(t('admin.systemResetMissingBackup'));
        if (!status.preview.ok) items.push(t('admin.systemResetMissingClassify'));
        if (el.phrase.value !== status.phrase) items.push(t('admin.systemResetMissingPhrase'));
        return items;
    }

    function updateRunButton() {
        const missing = missingItems();
        el.runBtn.disabled = !(!!status && missing.length === 0 && !running);
        const showHint = !!status && missing.length > 0 && !el.runBtn.hidden;
        el.missing.hidden = !showHint;
        el.missing.textContent = showHint ? t('admin.systemResetMissing', { items: missing.join(' · ') }) : '';
    }

    function render() {
        if (!status) return;
        el.disabled.hidden = status.enabled;
        el.phraseLabel.textContent = t('admin.systemResetPhraseLabel', { phrase: status.phrase });
        renderBackup();
        renderPreview();
        updateRunButton();
    }

    async function load() {
        showError('');
        try {
            const res = await fetch('/api/admin/system-reset/status', { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            status = await res.json();
            render();
        } catch {
            showError(t('admin.loadError'));
        }
    }

    async function createBackup() {
        showError('');
        el.backupBtn.disabled = true;
        try {
            const res = await fetch('/api/admin/system-reset/backup', { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error('backup failed');
            Dashboard.showToast(t('admin.systemResetBackupDone'), 'success');
            await load();
        } catch {
            showError(t('admin.systemResetErrBackup'));
        } finally {
            el.backupBtn.disabled = false;
        }
    }

    async function runReset() {
        if (!status || running) return;
        const deleting = status.preview.rows.reduce((sum, r) => sum + r.toDelete, 0);
        const confirmed = await Dashboard.confirm(t('admin.systemResetConfirm', { rows: num(deleting), files: num(status.files.count) }));
        if (!confirmed) return;
        running = true;
        showError('');
        updateRunButton();
        try {
            const res = await fetch('/api/admin/system-reset/run', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phrase: el.phrase.value }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                const known = { 'phrase-mismatch': 'admin.systemResetErrPhrase', 'backup-required': 'admin.systemResetErrBackup', 'reset-disabled': 'admin.systemResetDisabled' }[body.code];
                showError(known ? t(known) : (body.message || t('admin.saveError')));
                return;
            }
            el.result.textContent = body.files && body.files.error
                ? `${t('admin.systemResetDone', { rows: num(body.totalRows), files: num(body.files.deleted) })} ${t('admin.systemResetFilesError', { error: body.files.error })}`
                : t('admin.systemResetDone', { rows: num(body.totalRows), files: num(body.files ? body.files.deleted : 0) });
            el.result.hidden = false;
            el.loginBtn.hidden = false;
            el.phrase.value = '';
            el.phrase.disabled = true;
            el.runBtn.hidden = true;
        } catch {
            showError(t('admin.saveError'));
        } finally {
            running = false;
            updateRunButton();
        }
    }

    el.backupBtn.addEventListener('click', createBackup);
    el.downloadBtn.addEventListener('click', () => {
        if (status && status.lastBackup) window.location.href = `/api/admin/system-reset/backups/${encodeURIComponent(status.lastBackup.id)}/download`;
    });
    el.phrase.addEventListener('input', updateRunButton);
    el.runBtn.addEventListener('click', runReset);
    el.loginBtn.addEventListener('click', () => { window.location.href = '/'; });
    document.addEventListener('dashboard:language-changed', render);

    (async function init() {
        try {
            const role = await Dashboard.initDashboard({ activePage: 'admin-system-reset' });
            if (!role) return;
            if (role !== 'admin') { window.location.replace('Inicio-en.html'); return; }
            await load();
        } catch (err) {
            console.error('Reinicio del Sistema failed to initialize:', err);
        }
    })();
})();

// ---------------------------------------------------------------------------
// "Panel" — a per-área control panel: Catálogos/Operaciones/Admin/Gestión/
// Reportes/Material Apoyo as one row of tabs, each opening a second row
// right underneath it with that categoría's own real pantallas (Dashboard.
// getPanelCategories() does all the resolution — same areaOverrides +
// hasScreenGrant logic the left sidebar itself uses, see Dashboard.js).
// No title/heading of its own on purpose — "Panel" already shows in the
// breadcrumb/top-bar welcome-text like every other screen, confirmed with
// the user. Reacts to dashboard:area-changed (dept/área picker, "defaults"
// modal, etc.) without a page reload, same as dashboard:language-changed.
// ---------------------------------------------------------------------------

const tabsFrame = document.getElementById('panel-tabs-frame');
const tabsEl = document.getElementById('panel-tabs');
const subTabsEl = document.getElementById('panel-subtabs');
const emptyMsg = document.getElementById('panel-empty');

let activeCategoryId = null;

function buildTab(item, { active, isCategory }) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = isCategory ? 'panel-tab' : 'panel-subtab';
    el.classList.toggle('active', active);
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(active));
    if (item.icon) {
        const icon = document.createElement('i');
        icon.className = `bx ${item.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        el.appendChild(icon);
    }
    const full = document.createElement('span');
    full.className = 'full';
    full.textContent = Dashboard.t(item.labelKey, item.labelParams || {});
    el.appendChild(full);
    if (isCategory) {
        const short = document.createElement('span');
        short.className = 'short';
        short.textContent = Dashboard.t(item.abbrKey || item.labelKey, item.labelParams || {});
        el.appendChild(short);
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = String((item.submenu || []).length);
        el.appendChild(badge);
    }
    el.title = Dashboard.t(item.labelKey, item.labelParams || {});
    return el;
}

function renderSubTabs(category) {
    subTabsEl.innerHTML = '';
    const screens = category?.submenu || [];
    if (!screens.length) {
        subTabsEl.hidden = true;
        const empty = document.createElement('p');
        empty.className = 'panel-subtabs-empty';
        empty.textContent = Dashboard.t('main.panelEmptyCategory');
        subTabsEl.after(empty);
        subTabsEl.dataset.hasEmptyNote = '1';
        return;
    }
    subTabsEl.hidden = false;
    screens.forEach((screen) => {
        const tab = buildTab(screen, { active: false, isCategory: false });
        tab.addEventListener('click', () => {
            window.location.href = screen.href;
        });
        subTabsEl.appendChild(tab);
    });
}

function clearSubTabsEmptyNote() {
    if (subTabsEl.dataset.hasEmptyNote) {
        subTabsEl.nextElementSibling?.remove();
        delete subTabsEl.dataset.hasEmptyNote;
    }
}

function selectCategory(categories, categoryId) {
    clearSubTabsEmptyNote();
    activeCategoryId = categoryId;
    const active = categories.find((c) => c.id === categoryId);
    Array.from(tabsEl.children).forEach((tab, i) => {
        tab.classList.toggle('active', categories[i]?.id === categoryId);
        tab.setAttribute('aria-selected', String(categories[i]?.id === categoryId));
    });
    renderSubTabs(active);
}

function renderPanel() {
    const categories = Dashboard.getPanelCategories();
    if (!Dashboard.selectedArea || !categories.length) {
        tabsFrame.hidden = true;
        emptyMsg.hidden = false;
        return;
    }
    tabsFrame.hidden = false;
    emptyMsg.hidden = true;
    clearSubTabsEmptyNote();
    tabsEl.innerHTML = '';

    // Keep the previously active category selected across a re-render
    // (language switch, cost-center picker, etc.) when it still exists for
    // this área; otherwise fall back to the first categoría with real
    // pantallas, or just the first one if every categoría is still empty.
    const stillValid = categories.some((c) => c.id === activeCategoryId);
    const defaultId = (categories.find((c) => c.submenu.length > 0) || categories[0]).id;
    const targetId = stillValid ? activeCategoryId : defaultId;

    categories.forEach((cat) => {
        const tab = buildTab(cat, { active: cat.id === targetId, isCategory: true });
        tab.addEventListener('click', () => selectCategory(categories, cat.id));
        tabsEl.appendChild(tab);
    });
    selectCategory(categories, targetId);
}

document.addEventListener('dashboard:area-changed', renderPanel);
document.addEventListener('dashboard:language-changed', renderPanel);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'panel' });
        if (!role) return;
        renderPanel();
    } catch (err) {
        console.error('Panel failed to initialize:', err);
    }
})();

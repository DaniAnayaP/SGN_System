// ---------------------------------------------------------------------------
// "Modo ayuda" for the mobile app -- same SAP-style click-for-help idea as
// public/Dashboard.js's own setHelpModeActive/findHelpModeContent/
// showHelpModeTooltip, ported into one small shared module instead of
// copy-pasted per screen (unlike this app's own t()/loadLanguage(), which
// IS hand-copied everywhere -- this logic is self-contained enough, and
// small enough, that a single <script src="HelpMode.js"> plus one
// HelpMode.init(t) call per page is simpler to keep in sync).
//
// Why a shared module at all, given every other mobile screen is an
// independent full-page load with its own t(): because state (on/off) has
// to survive those full-page navigations (see AppInicio.js's own
// getStoredStyle()/localStorage.getItem('style') for the same problem,
// solved the same way here) -- a plain in-memory flag like
// categoryReorderMode would reset on every screen change.
// ---------------------------------------------------------------------------

(function () {
    var STORAGE_KEY = 'sgn-help-mode-active';
    var active = false;
    var tooltipEl = null;
    var tFn = function (key) { return key; };

    function isActive() { return active; }

    // Same walk-up-the-DOM shape as Dashboard.js's own findHelpModeContent,
    // minus the data-col/<th> header-name override -- mobile tables don't
    // use that generic "Clic para editar" convention the same way desktop's
    // Dashboard.attachInlineEdit does, so there's no generic name to rescue.
    function findHelpModeContent(startEl) {
        var node = startEl;
        while (node && node.nodeType === 1 && node !== document.body) {
            var helpKey = node.getAttribute('data-help-key');
            if (helpKey) {
                var name = node.getAttribute('aria-label') || node.getAttribute('title')
                    || (node.textContent || '').trim() || node.getAttribute('placeholder');
                if (name) {
                    return { name: name, what: tFn('help.' + helpKey + '.what'), example: tFn('help.' + helpKey + '.example') };
                }
            }
            var plainName = node.getAttribute('aria-label') || node.getAttribute('title');
            if (plainName) return { name: plainName, what: null, example: null };
            node = node.parentElement;
        }
        return null;
    }

    function closeTooltip() {
        if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    }

    function showTooltip(content, x, y) {
        closeTooltip();
        var tip = document.createElement('div');
        tip.className = 'help-mode-tooltip';
        var nameEl = document.createElement('div');
        nameEl.className = 'help-mode-tooltip-name';
        nameEl.textContent = content.name;
        tip.appendChild(nameEl);
        if (content.what) {
            var whatEl = document.createElement('div');
            whatEl.className = 'help-mode-tooltip-what';
            whatEl.textContent = content.what;
            tip.appendChild(whatEl);
        }
        if (content.example) {
            var exampleEl = document.createElement('div');
            exampleEl.className = 'help-mode-tooltip-example';
            var label = document.createElement('b');
            label.textContent = tFn('main.helpExampleLabel');
            exampleEl.appendChild(label);
            exampleEl.append(' ' + content.example);
            tip.appendChild(exampleEl);
        }
        document.body.appendChild(tip);
        var rect = tip.getBoundingClientRect();
        var left = Math.min(x + 14, window.innerWidth - rect.width - 8);
        var top = Math.min(y + 14, window.innerHeight - rect.height - 8);
        tip.style.left = Math.max(8, left) + 'px';
        tip.style.top = Math.max(8, top) + 'px';
        tooltipEl = tip;
    }

    function syncToggleButtons() {
        var buttons = document.querySelectorAll('[data-help-mode-toggle]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('active', active);
            buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    function setActive(next) {
        active = !!next;
        document.body.classList.toggle('help-mode-active', active);
        try { localStorage.setItem(STORAGE_KEY, active ? '1' : '0'); } catch (e) { /* private mode, etc. */ }
        if (!active) closeTooltip();
        syncToggleButtons();
    }

    // Capture phase, same reasoning as Dashboard.js's own listener: has to
    // run and stopPropagation BEFORE the clicked control's real handler, or
    // "just tell me what this does" would also do it.
    document.addEventListener('click', function (event) {
        if (!active) return;
        if (event.target.closest('[data-help-mode-toggle]')) return;
        var content = findHelpModeContent(event.target);
        event.preventDefault();
        event.stopPropagation();
        if (content) showTooltip(content, event.clientX, event.clientY);
        else closeTooltip();
    }, true);

    // init(t) -- call once a screen's own dict has loaded, passing its own
    // t(key) function (every mobile screen already has one, see e.g.
    // AppInicio.js's own t()). Restores the on/off state from localStorage
    // so it survives the full-page navigation into/out of this screen.
    function init(t) {
        tFn = typeof t === 'function' ? t : tFn;
        var stored = false;
        try { stored = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* private mode, etc. */ }
        active = stored;
        document.body.classList.toggle('help-mode-active', active);
        var buttons = document.querySelectorAll('[data-help-mode-toggle]');
        for (var i = 0; i < buttons.length; i++) {
            // No stopPropagation here on purpose -- some hosts close their
            // own menu/dropdown on a generic document-level click listener
            // (see AppInicio.js's own closeHamburgerMenu wiring), same as
            // every other menu item in that dropdown; the capture-phase
            // listener above already ignores this button by itself
            // (event.target.closest('[data-help-mode-toggle]')), so nothing
            // here needs to block bubbling.
            buttons[i].addEventListener('click', function (event) {
                event.preventDefault();
                setActive(!active);
            });
        }
        syncToggleButtons();
    }

    // setT -- for a screen that reloads its dict after a live language
    // switch without a full page reload (if any ever do); most mobile
    // screens just re-fetch and re-render on 'dashboard:language-changed'-
    // style events, so this is here for parity, not currently required.
    function setT(t) {
        if (typeof t === 'function') tFn = t;
    }

    window.HelpMode = { init: init, setActive: setActive, isActive: isActive, setT: setT };
})();

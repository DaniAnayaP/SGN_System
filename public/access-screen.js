// ---------------------------------------------------------------------------
// Native-app-only "Acceder" screen: splash-style icon/title + a loading
// spinner, then an Acceder button that offers Face ID/fingerprint (or
// password) to enter. Always shown when running inside the Capacitor app
// (window.Capacitor only exists there — a plain browser tab always skips
// straight to the normal login form, same as before this existed).
//
// Face ID/fingerprint only ever RESUMES an already-valid session — it's a
// local "confirm it's really the phone's owner" gate, not a replacement for
// the real password login, and it never talks to the server on its own. If
// there's no existing session (first run, or a previous one expired/logged
// out), Face ID has nothing to resume, so tapping it goes straight to the
// password form instead of pretending to authenticate.
// ---------------------------------------------------------------------------

// window.Capacitor is injected by the native bridge, but there's no
// guarantee it exists the instant a deferred script starts running —
// checking exactly once, immediately, meant this whole screen worked or
// silently fell back to the plain login form depending on pure timing luck
// (confirmed live: worked once, then didn't after nothing in this file
// actually changed the outcome). Poll briefly instead of a single check.
function waitForCapacitor(timeoutMs = 800, intervalMs = 50) {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        (function poll() {
            if (window.Capacitor) return resolve(window.Capacitor);
            if (Date.now() >= deadline) return resolve(null);
            setTimeout(poll, intervalMs);
        })();
    });
}

(async function initAccessScreen() {
    const Capacitor = await waitForCapacitor();
    const hideNativeSplash = () => Capacitor?.Plugins?.SplashScreen?.hide();

    if (!Capacitor) {
        hideNativeSplash(); // no-op, kept for symmetry/clarity
        return;
    }

    const screen = document.getElementById('access-screen');
    const spinner = document.getElementById('access-spinner');
    const accessBtn = document.getElementById('access-btn');
    const peek = document.getElementById('access-peek');
    const sheet = document.getElementById('access-sheet');
    const biometricBtn = document.getElementById('access-biometric-btn');
    const biometricLabel = document.getElementById('access-biometric-label');
    const passwordBtn = document.getElementById('access-password-btn');
    if (!screen) { hideNativeSplash(); return; }

    screen.hidden = false;
    hideNativeSplash(); // our overlay is already up — seamless handoff from the native splash

    const [sessionResult, biometryResult] = await Promise.allSettled([
        fetch('/api/me', { credentials: 'include' }),
        Capacitor.Plugins?.BiometricAuthNative?.checkBiometry?.() ?? Promise.reject(),
    ]);
    const hasSession = sessionResult.status === 'fulfilled' && sessionResult.value.ok;
    const biometry = biometryResult.status === 'fulfilled' ? biometryResult.value : null;
    const BiometricAuth = Capacitor.Plugins?.BiometricAuthNative;

    // Face ID needs BOTH device support AND a session to resume — offering
    // it with neither would just be a dead end that always falls back.
    const hasBiometry = !!biometry?.isAvailable && hasSession;
    if (hasBiometry && biometricLabel) {
        // BiometryType: 3 = fingerprint, 4 = face, 5 = iris (see the plugin's
        // definitions) — everything else falls back to the generic Face ID
        // label, close enough for whatever the device actually offers.
        const t = window.t || ((key, fallback) => fallback);
        biometricLabel.textContent = biometry.biometryType === 3
            ? t('login.accessFingerprint', 'Huella digital')
            : t('login.accessFaceId', 'Face ID');
    }

    spinner.classList.add('hidden');
    accessBtn.hidden = false;

    function showPasswordForm() {
        screen.hidden = true;
    }

    async function attemptBiometric() {
        if (!hasBiometry) {
            showPasswordForm();
            return;
        }
        try {
            await BiometricAuth.authenticate({
                reason: (window.t && window.t('login.accessBiometricReason')) || 'Access SGN',
                allowDeviceCredential: true,
                cancelTitle: (window.t && window.t('login.accessWithPassword')) || 'Username and password',
            });
            // Session cookie is already valid (confirmed above) — biometric
            // success alone is enough to enter, no extra server round-trip.
            window.location.href = '/Inicio-en.html';
        } catch {
            showPasswordForm();
        }
    }

    accessBtn.addEventListener('click', () => {
        accessBtn.hidden = true;
        if (hasBiometry) {
            // A small bouncing "pull up" handle first, per request — the
            // actual Face ID/password choices only reveal once THAT is
            // tapped, instead of appearing immediately.
            peek.hidden = false;
        } else {
            // Nothing to choose between — go straight to the password form.
            showPasswordForm();
        }
    });
    peek?.addEventListener('click', () => {
        peek.hidden = true;
        sheet.hidden = false;
    });
    biometricBtn?.addEventListener('click', attemptBiometric);
    passwordBtn?.addEventListener('click', showPasswordForm);
})();

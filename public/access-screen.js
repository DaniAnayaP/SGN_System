// ---------------------------------------------------------------------------
// Native-app-only "unlock" screen: Face ID/fingerprint (or password as a
// fallback) to resume an ALREADY-VALID session, not a replacement for the
// real password login. It only ever appears when both are true:
//   1. window.Capacitor exists — remote mode injects the native bridge into
//      every page it loads, this one included; a plain browser tab never
//      has it, so this whole file is a no-op there.
//   2. GET /api/me (the session-cookie-gated route already used elsewhere)
//      succeeds — there IS a session to unlock. With no valid session,
//      biometrics have nothing to confirm, so the plain login form (already
//      in the page) is what shows, same as in a browser.
// Biometric success never talks to the server on its own — it just
// re-confirms locally that the phone's owner is the one holding it, then
// lets the existing session (the same cookie /api/me just checked) carry
// the user straight into the app.
// ---------------------------------------------------------------------------

(async function initAccessScreen() {
    const Capacitor = window.Capacitor;
    const hideNativeSplash = () => Capacitor?.Plugins?.SplashScreen?.hide();

    if (!Capacitor) {
        hideNativeSplash(); // no-op, kept for symmetry/clarity
        return;
    }

    let hasSession = false;
    try {
        const res = await fetch('/api/me', { credentials: 'include' });
        hasSession = res.ok;
    } catch {
        hasSession = false;
    }

    if (!hasSession) {
        hideNativeSplash();
        return;
    }

    const screen = document.getElementById('access-screen');
    const spinner = document.getElementById('access-spinner');
    const accessBtn = document.getElementById('access-btn');
    const sheet = document.getElementById('access-sheet');
    const biometricBtn = document.getElementById('access-biometric-btn');
    const biometricLabel = document.getElementById('access-biometric-label');
    const passwordBtn = document.getElementById('access-password-btn');
    if (!screen) { hideNativeSplash(); return; }

    screen.hidden = false;
    hideNativeSplash(); // our overlay is already up — seamless handoff from the native splash

    const BiometricAuth = Capacitor.Plugins?.BiometricAuthNative;
    let biometry = null;
    if (BiometricAuth) {
        try {
            biometry = await BiometricAuth.checkBiometry();
        } catch {
            biometry = null;
        }
    }

    const hasBiometry = !!biometry?.isAvailable;
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
            sheet.hidden = false;
        } else {
            // Nothing to choose between — go straight to the password form.
            showPasswordForm();
        }
    });
    biometricBtn?.addEventListener('click', attemptBiometric);
    passwordBtn?.addEventListener('click', showPasswordForm);
})();

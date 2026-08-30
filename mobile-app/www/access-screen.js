// ---------------------------------------------------------------------------
// Native-app-only "Acceder" screen: splash-style icon/title + a loading
// spinner, then a bouncing arrow that reveals how to enter — Face ID/
// fingerprint (native prompt, with a branded "Mirando tu rostro..." screen
// around it) or an app-branded Username/Password form. Always shown when
// running inside the Capacitor app (window.Capacitor only exists there — a
// plain browser tab always skips straight to the normal login form, same as
// before this existed).
//
// Face ID/fingerprint only ever RESUMES an already-valid session — it's a
// local "confirm it's really the phone's owner" gate, not a replacement for
// the real password login, and it never talks to the server on its own, nor
// captures/stores anything: the actual scan is 100% handled by the phone's
// own OS sensor. If there's no existing session (first run, or a previous
// one expired/logged out), Face ID has nothing to resume, so tapping it (or
// a failed attempt) falls straight to the password form instead of
// pretending to authenticate.
// ---------------------------------------------------------------------------

// Plain localStorage marker (not the httpOnly session cookie itself) used
// only to remember "we confirmed a real session last time we had network" --
// see its one read site below for why.
const HAD_SESSION_KEY = 'sgnHadSession';

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
    const peek = document.getElementById('access-peek');
    const sheet = document.getElementById('access-sheet');
    const biometricBtn = document.getElementById('access-biometric-btn');
    const biometricLabel = document.getElementById('access-biometric-label');
    const passwordBtn = document.getElementById('access-password-btn');
    const scanScreen = document.getElementById('access-scan-screen');
    const scanSub = document.getElementById('access-scan-sub');
    const pwScreen = document.getElementById('access-password-screen');
    const pwBackBtn = document.getElementById('access-pw-back');
    const pwForm = document.getElementById('access-password-form');
    const pwUsername = document.getElementById('access-pw-username');
    const pwPassword = document.getElementById('access-pw-password');
    const pwToggle = document.getElementById('access-pw-toggle');
    const pwError = document.getElementById('access-pw-error');
    const pwSubmitBtn = document.getElementById('access-pw-submit');
    if (!screen) { hideNativeSplash(); return; }

    screen.hidden = false;
    hideNativeSplash(); // our overlay is already up — seamless handoff from the native splash

    const t = (key, fallback, params) => (window.t ? window.t(key, params) : fallback) || fallback || key;

    const [sessionResult, biometryResult] = await Promise.allSettled([
        fetch(apiUrl('/api/me'), { credentials: 'include' }),
        Capacitor.Plugins?.BiometricAuthNative?.checkBiometry?.() ?? Promise.reject(),
    ]);
    // sessionResult REJECTS only when the fetch itself never reached the
    // server (no signal) -- a real answer from the server (even a 401)
    // always FULFILLS, just with .ok false. Treating "no network" the same
    // as "not logged in" is exactly the bug reported live: closing the app
    // with a perfectly valid session, losing signal, and reopening it
    // dumped the user back on a password form that can't submit without a
    // network either -- a dead end. HAD_SESSION_KEY is a plain (non-
    // httpOnly) local marker set right after a real login/session
    // confirmation, so this one spot can fall back to "was logged in last
    // time we could actually check" instead of hard-failing when offline.
    // It's advisory only: every real API call still lives or dies by the
    // actual session cookie, so a truly expired session just starts
    // failing those calls for real the moment one is attempted online.
    let hasSession;
    if (sessionResult.status === 'fulfilled') {
        hasSession = sessionResult.value.ok;
        if (hasSession) localStorage.setItem(HAD_SESSION_KEY, '1');
        else localStorage.removeItem(HAD_SESSION_KEY);
    } else {
        hasSession = localStorage.getItem(HAD_SESSION_KEY) === '1';
    }
    // No network AND we're trusting a remembered session: there's nothing
    // left to confirm (biometric still needs the OS prompt, password still
    // needs the server) and no point making the user tap through either --
    // go straight in, same destination biometric success already uses.
    if (hasSession && sessionResult.status === 'rejected') {
        window.location.href = 'AppInicio.html';
        return;
    }
    const biometry = biometryResult.status === 'fulfilled' ? biometryResult.value : null;
    const BiometricAuth = Capacitor.Plugins?.BiometricAuthNative;

    // Face ID needs BOTH device support AND a session to resume — offering
    // it with neither would just be a dead end that always falls back.
    const hasBiometry = !!biometry?.isAvailable && hasSession;
    if (hasBiometry && biometricLabel) {
        // BiometryType: 3 = fingerprint, 4 = face, 5 = iris (see the plugin's
        // definitions) — everything else falls back to the generic Face ID
        // label, close enough for whatever the device actually offers.
        const isFingerprint = biometry.biometryType === 3;
        biometricLabel.textContent = t(isFingerprint ? 'login.accessFingerprint' : 'login.accessFaceId', isFingerprint ? 'Huella digital' : 'Face ID');
        // Static markup already says "Face ID de tu celular" by default —
        // only override it for the fingerprint case.
        if (scanSub && isFingerprint) scanSub.textContent = t('login.accessScanningSubFingerprint', 'Huella digital de tu celular');
    }

    spinner.classList.add('hidden');
    // No intermediate "Acceder" button anymore — the arrow is the whole
    // affordance once loading finishes.
    peek.hidden = false;

    function showSheet() {
        peek.hidden = true;
        scanScreen.hidden = true;
        pwScreen.hidden = true;
        sheet.hidden = false;
    }

    function showPasswordScreen() {
        sheet.hidden = true;
        scanScreen.hidden = true;
        pwScreen.hidden = false;
        pwUsername.focus();
    }

    async function attemptBiometric() {
        if (!hasBiometry) {
            showToast(t('login.accessNoSessionForBiometric', "Sign in with your username and password first. Next time you'll be able to use Face ID."));
            showPasswordScreen();
            return;
        }
        sheet.hidden = true;
        scanScreen.hidden = false;
        try {
            await BiometricAuth.authenticate({
                reason: t('login.accessBiometricReason', 'Access SGN'),
                allowDeviceCredential: true,
                cancelTitle: t('login.accessWithPassword', 'Username and password'),
            });
            // Session cookie is already valid (confirmed above) — biometric
            // success alone is enough to enter, no extra server round-trip.
            window.location.href = 'AppInicio.html';
        } catch {
            scanScreen.hidden = true;
            showToast(t('login.accessBiometricFailed', "We couldn't verify your identity. Sign in with your username and password."));
            showPasswordScreen();
        }
    }

    peek.addEventListener('click', showSheet);
    biometricBtn?.addEventListener('click', attemptBiometric);
    passwordBtn?.addEventListener('click', showPasswordScreen);
    pwBackBtn?.addEventListener('click', showSheet);

    pwToggle?.addEventListener('click', () => {
        const isHidden = pwPassword.type === 'password';
        pwPassword.type = isHidden ? 'text' : 'password';
        pwToggle.querySelector('i').className = isHidden ? 'bx bx-show' : 'bx bx-hide';
    });

    function showPwError(message) {
        pwError.textContent = message;
        pwError.hidden = false;
    }

    pwForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        pwError.hidden = true;
        const username = pwUsername.value.trim();
        const password = pwPassword.value;
        if (!username || !password) {
            showPwError(t('login.fieldRequired', 'This field is required.'));
            return;
        }
        pwSubmitBtn.disabled = true;
        try {
            const res = await fetch(apiUrl('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                const body = res.status === 403 ? await res.json().catch(() => ({})) : {};
                if (body.operationalStatus === 'inactive') {
                    showPwError(t('login.operationalInactive', 'You cannot access the system due to a contract termination.'));
                } else if (body.operationalStatus === 'suspended') {
                    showPwError(t('login.operationalSuspended', 'Your account is temporarily suspended.'));
                } else if (res.status === 401) {
                    showPwError(t('login.invalidCredentials', 'Incorrect username or password.'));
                } else {
                    showPwError(t('login.genericError', 'Something went wrong. Please try again.'));
                }
                return;
            }
            sessionStorage.setItem('applyLoginDefaults', '1');
            localStorage.setItem(HAD_SESSION_KEY, '1');
            window.location.href = 'AppInicio.html';
        } catch {
            showPwError(t('login.genericError', 'Something went wrong. Please try again.'));
        } finally {
            pwSubmitBtn.disabled = false;
        }
    });
})();

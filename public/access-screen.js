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
    // network either -- a dead end, since password login itself always
    // needs the server. HAD_SESSION_KEY is a plain (non-httpOnly) local
    // marker set right after a real login/session confirmation, so this one
    // spot can fall back to "was logged in last time we could actually
    // check" instead of hard-failing when offline -- this alone does NOT
    // let anyone in; it only feeds hasSession below, which is what makes
    // Face ID/fingerprint available as an option (a real, local re-
    // confirmation the OS itself performs, no network needed) instead of
    // leaving password as the only -- offline-impossible -- way in. A
    // device with no biometric enrolled still can't get past this screen
    // offline, by design: something has to actually confirm it's the same
    // person, and password can't do that without a connection.
    //
    // Only ever SET here, never cleared on a 401 -- confirmed live on a
    // spotty connection (WiFi hanging on under "airplane mode") that a
    // single flaky request can come back a real, fulfilled 401 (session
    // momentarily unconfirmable, not actually logged out) and wiping the
    // flag right then locked the user out exactly like the no-network case
    // this was built to fix. Logging out (AppInicio.js) is the only place
    // that should ever clear it.
    // A fulfilled-but-not-ok response is normally a trustworthy "really not
    // logged in" -- except confirmed live on this exact kind of spotty
    // connection (the OS reporting "offline" while WiFi is still half-
    // attached) that a single request can round-trip a real 401 instead of
    // rejecting, moments after a fully valid login. Falling straight to
    // "no session" right then re-creates the original lock-out, just
    // dressed as a 401 instead of a network error -- so a remembered
    // session still counts here too, and only an explicit logout
    // (AppInicio.js) removes it. The real authorization boundary hasn't
    // moved: AppInicio.js's own fresh /api/me check still bounces back to
    // Login.html the moment the server gives a genuine, reliable 401.
    let hasSession = localStorage.getItem(HAD_SESSION_KEY) === '1';
    if (sessionResult.status === 'fulfilled' && sessionResult.value.ok) {
        hasSession = true;
        localStorage.setItem(HAD_SESSION_KEY, '1');
    }
    const biometry = biometryResult.status === 'fulfilled' ? biometryResult.value : null;

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
        // Re-checked fresh right here instead of trusting hasBiometry from
        // page load -- confirmed live that tapping this button could still
        // fall through to "sign in with password" even with a valid
        // remembered session and working fingerprint hardware, because
        // hasSession/hasBiometry are computed ONCE, early in
        // initAccessScreen, and never revisited. Whatever caused that one
        // early check to land on false (a slow/flaky first read) stuck for
        // the rest of the screen's life; checking again at the actual
        // moment of the tap is what makes this reliable regardless of why
        // the first pass got it wrong.
        const currentHasSession = localStorage.getItem(HAD_SESSION_KEY) === '1';
        let currentBiometry = null;
        try {
            currentBiometry = await Capacitor.Plugins?.BiometricAuthNative?.checkBiometry?.();
        } catch { /* treated as unavailable below */ }
        const currentHasBiometry = !!currentBiometry?.isAvailable && currentHasSession;
        if (!currentHasBiometry) {
            showToast(t('login.accessNoSessionForBiometric', "Sign in with your username and password first. Next time you'll be able to use Face ID."));
            showPasswordScreen();
            return;
        }
        sheet.hidden = true;
        scanScreen.hidden = false;
        try {
            // Same staleness bug as the availability check just above, one
            // line further down: this used to call the OUTER `BiometricAuth`
            // captured once at page load (a few lines above initAccessScreen
            // in the old version of this file) instead of the plugin
            // reference confirmed available a moment ago. Confirmed live:
            // when that outer reference happened to be undefined, calling
            // .authenticate() on it threw immediately -- no native
            // fingerprint prompt ever appeared, straight to "No se pudo
            // verificar tu identidad" -- which looks identical to a real
            // failed scan but isn't one. Re-resolving it fresh here removes
            // the same class of bug from this second call site too.
            await Capacitor.Plugins.BiometricAuthNative.authenticate({
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

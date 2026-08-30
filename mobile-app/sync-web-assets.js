// Copies the exact set of files the native app actually uses from ../public
// into ./www, which Capacitor then bundles straight into the .apk (see
// capacitor.config.json -- no more "server.url" pointing at the live site,
// so this www folder is now the only thing the app opens with). Run this
// any time one of these files changes on the web side, then `npx cap sync
// android` to push the refreshed www/ into the Android project, then
// rebuild the app in Android Studio.
//
// This list is intentionally NOT "everything in public/" -- the native app
// only ever opens Login.html and the App*.html screens, never the desktop
// Admin-*/Business-*/Dashboard.js pages, so there's no reason to bloat the
// .apk with web-only code that can't be reached from inside it.
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const WWW_DIR = path.join(__dirname, 'www');

const FILES = [
    'Login.html', 'Login.css', 'login.js', 'access-screen.js',
    'AppConfig.js', 'ColorPalette.js', 'AppOfflineSync.js', 'PermissionTree.js',
    'AppInicio.html', 'AppInicio.css', 'AppInicio.js',
    'AppCargaCombustible.html', 'AppCargaCombustible.js',
    'AppTiposUnidad.html', 'AppTiposUnidad.js',
    'AppNuestrasUnidades.html', 'AppNuestrasUnidades.js',
    'AppRoles.html', 'AppRoles.js', 'Admin.css',
    'manifest.json', 'sw.js',
    path.join('icons', 'icon-512.png'),
    path.join('data', 'menu.json'),
    path.join('i18n', 'en.json'),
    path.join('i18n', 'es.json'),
];

for (const rel of FILES) {
    const src = path.join(PUBLIC_DIR, rel);
    const dest = path.join(WWW_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log('copied', rel);
}
console.log(`\nDone -- ${FILES.length} files copied into mobile-app/www.`);
console.log('Next: npx cap sync android, then rebuild the app in Android Studio.');

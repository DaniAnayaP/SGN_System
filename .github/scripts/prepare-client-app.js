#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Prepara la app PROPIA de un cliente (Apps Nuestros Clientes, pieza 6 «Mi App en tiendas»).
//
// Se corre en la nube (.github/workflows/build-client-apk.yml) sobre la copia de mobile-app/ del repositorio, DESPUÉS de
// `node mobile-app/sync-web-assets.js` y de `npm install` en mobile-app, y ANTES de `npx cap sync android` y de gradle.
// Nunca toca el repositorio de verdad: lo que cambia solo vive en el equipo que arma.
//
// Qué hace (todo sale de GET <servidor>/api/public/client-app-build/<clave>, que solo da marca pública):
//   1. Cambia el identificador de la app (com.geipsa.sgn.<clave>) y su nombre abreviado (capacitor.config.json, build.gradle, strings.xml).
//      El «namespace» de Android NO se cambia (es el paquete del código de la app); solo el applicationId, que es lo que ven las tiendas.
//   2. Cambia el ícono (el mismo PNG de 512 que el cliente publica en «Mi App», con su nombre de color y la banda «by SGN») en todos los tamaños
//      de Android: el ícono normal, el redondo y las dos capas del adaptable (fondo del color del ícono + el ícono).
//   3. Escribe la clave de la empresa en www/AppClientBrand.js (el renglón PRESET_COMPANY): así la app no pide código de empresa
//      y se queda con la marca de esa empresa.
//
// Uso:  node .github/scripts/prepare-client-app.js --slug <clave> [--server <https://…>] [--mobile-app <carpeta>] [--version-code <n>] [--modules <node_modules con sharp>]
// Falla con un mensaje claro (y sin dejar a medias lo ya cambiado de forma que pase como bueno) si algo no cuadra.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_SERVER = 'https://sgnsystem-production.up.railway.app';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BUNDLE_RE = /^com\.geipsa\.sgn\.[a-z][a-z0-9_]{0,60}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// densidad → [lado del ícono normal/redondo, lado de cada capa del adaptable] (en píxeles)
const DENSITIES = { ldpi: [36, 81], mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };

function fail(message) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
}
function readArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i += 1) {
        if (!argv[i].startsWith('--')) fail(`Argumento no válido: ${argv[i]}`);
        out[argv[i].slice(2)] = argv[i + 1];
        i += 1;
    }
    return out;
}
const xmlEscape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, "\\'");
// Android: en strings.xml el apóstrofo va con barra; las comillas dobles ya van escapadas como entidad. «@» y «?» al inicio se leen como referencias, se antepone barra.
const androidText = (text) => xmlEscape(text).replace(/^([@?])/, '\\$1');

function replaceOnce(source, pattern, replacement, label) {
    const matches = source.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));
    if (!matches || matches.length !== 1) fail(`No se encontró (o aparece más de una vez) «${label}». ¿Cambió el archivo?`);
    return source.replace(pattern, () => replacement);
}
function editFile(file, edits) {
    let text = fs.readFileSync(file, 'utf8');
    for (const [pattern, replacement, label] of edits) text = replaceOnce(text, pattern, replacement, label);
    fs.writeFileSync(file, text);
}

async function getJson(url) {
    let res;
    try { res = await fetch(url, { headers: { Accept: 'application/json' } }); } catch (err) { fail(`No se pudo conectar con ${new URL(url).origin}: ${err.message}`); }
    if (res.status === 404) fail('El servidor no tiene datos de armado para esa clave. La app tiene que estar pedida (estado «Pedida» o «En preparación» en Apps Nuestros Clientes) y la compañía no estar inactiva.');
    if (res.status === 429) fail('El servidor pidió esperar (demasiadas consultas). Intenta de nuevo en unos minutos.');
    if (!res.ok) fail(`El servidor respondió ${res.status}.`);
    return res.json();
}
async function getPng(url) {
    let res;
    try { res = await fetch(url); } catch (err) { fail(`No se pudo bajar el ícono: ${err.message}`); }
    if (!res.ok) fail(`No se pudo bajar el ícono (${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(16) !== 512 || buf.readUInt32BE(20) !== 512) fail('El ícono que dio el servidor no es un PNG de 512×512.');
    return buf;
}

(async () => {
    const args = readArgs(process.argv.slice(2));
    const slug = String(args.slug || '').trim();
    if (slug.length < 3 || slug.length > 40 || !SLUG_RE.test(slug)) fail('Falta la clave del cliente (--slug): de 3 a 40 letras minúsculas sin acentos, números y guiones.');
    const server = String(args.server || DEFAULT_SERVER).replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s/]+$/.test(server)) fail('La dirección del servidor (--server) debe verse como https://dominio, sin ruta.');
    const mobileApp = path.resolve(args['mobile-app'] || 'mobile-app');
    if (!fs.existsSync(path.join(mobileApp, 'capacitor.config.json'))) fail(`No encuentro capacitor.config.json en ${mobileApp}.`);
    const versionCode = Number(args['version-code'] || process.env.GITHUB_RUN_NUMBER || 1);
    if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2000000000) fail('--version-code debe ser un entero positivo.');

    let sharp;
    try { sharp = require(require.resolve('sharp', { paths: [args.modules, path.join(mobileApp, 'node_modules'), process.cwd()].filter(Boolean) })); } catch { fail('Falta «sharp» (viene con @capacitor/assets): corre `npm install` en mobile-app antes.'); }

    // ---- 1. los datos de armado del cliente
    const info = await getJson(`${server}/api/public/client-app-build/${encodeURIComponent(slug)}`);
    if (info.slug !== slug) fail('El servidor contestó por otra clave.');
    if (!BUNDLE_RE.test(String(info.bundleId || ''))) fail(`Identificador de app no válido: ${info.bundleId}`);
    const appName = String(info.appName || '').trim();
    if (!appName || appName.length > 30) fail('El nombre abreviado de la app viene vacío o es muy largo.');
    if (!COLOR_RE.test(String(info.iconColor || ''))) fail(`Color del ícono no válido: ${info.iconColor}`);
    if (!info.hasIcon || !info.iconUrl) fail('Este cliente todavía no tiene ícono publicado. Que se publique su inicio (Apps Nuestros Clientes o «Mi App») y se vuelve a armar.');
    const versionName = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,19}$/.test(String(info.version || '')) ? info.version : '1.0';
    const icon = await getPng(new URL(info.iconUrl, `${server}/`).toString());

    const res = path.join(mobileApp, 'android', 'app', 'src', 'main', 'res');
    const gradle = path.join(mobileApp, 'android', 'app', 'build.gradle');
    const strings = path.join(res, 'values', 'strings.xml');
    const iconBackgroundXml = path.join(res, 'values', 'ic_launcher_background.xml');
    const brandJs = path.join(mobileApp, 'www', 'AppClientBrand.js');
    for (const file of [gradle, strings, iconBackgroundXml, brandJs]) if (!fs.existsSync(file)) fail(`No encuentro ${path.relative(mobileApp, file)}.`);

    // ---- 2. los textos y el identificador (todo se revisa ANTES de escribir: si algo no cuadra, no se cambia nada)
    const configFile = path.join(mobileApp, 'capacitor.config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (config.appId !== 'com.geipsa.sgn') fail(`capacitor.config.json ya trae otro appId (${config.appId}): esta copia ya se preparó o no es la del repositorio.`);
    config.appId = info.bundleId;
    config.appName = appName;
    const stringsText = fs.readFileSync(strings, 'utf8');
    const stringsNext = [
        [/<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${androidText(appName)}</string>`, 'app_name'],
        [/<string name="title_activity_main">[^<]*<\/string>/, `<string name="title_activity_main">${androidText(appName)}</string>`, 'title_activity_main'],
        [/<string name="package_name">[^<]*<\/string>/, `<string name="package_name">${info.bundleId}</string>`, 'package_name'],
        [/<string name="custom_url_scheme">[^<]*<\/string>/, `<string name="custom_url_scheme">${info.bundleId}</string>`, 'custom_url_scheme'],
    ];
    const gradleEdits = [
        [/applicationId "com\.geipsa\.sgn"/, `applicationId "${info.bundleId}"`, 'applicationId'],
        [/versionCode \d+/, `versionCode ${versionCode}`, 'versionCode'],
        [/versionName "[^"]*"/, `versionName "${versionName}"`, 'versionName'],
    ];
    const brandEdits = [[/const PRESET_COMPANY = '';/, `const PRESET_COMPANY = '${slug}';`, 'PRESET_COMPANY en AppClientBrand.js']];
    // ensayo en memoria
    let probe = stringsText; stringsNext.forEach(([p, r, l]) => { probe = replaceOnce(probe, p, r, l); });
    probe = fs.readFileSync(gradle, 'utf8'); gradleEdits.forEach(([p, r, l]) => { probe = replaceOnce(probe, p, r, l); });
    probe = fs.readFileSync(brandJs, 'utf8'); brandEdits.forEach(([p, r, l]) => { probe = replaceOnce(probe, p, r, l); });

    // ---- 3. los íconos
    const color = info.iconColor.toLowerCase();
    const iconSharp = () => sharp(icon);
    const mask = (size, radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
    const written = [];
    for (const [density, [legacy, layer]] of Object.entries(DENSITIES)) {
        const dir = path.join(res, `mipmap-${density}`);
        if (!fs.existsSync(path.join(dir, 'ic_launcher.png'))) continue; // solo las densidades que la app ya trae
        const square = await iconSharp().resize(legacy, legacy).composite([{ input: mask(legacy, Math.round(legacy * 0.22)), blend: 'dest-in' }]).png().toBuffer();
        const round = await iconSharp().resize(legacy, legacy).composite([{ input: mask(legacy, legacy / 2), blend: 'dest-in' }]).png().toBuffer();
        const foreground = await iconSharp().resize(layer, layer).png().toBuffer();
        const background = await sharp({ create: { width: layer, height: layer, channels: 4, background: color } }).png().toBuffer();
        for (const [name, data] of [['ic_launcher.png', square], ['ic_launcher_round.png', round], ['ic_launcher_foreground.png', foreground], ['ic_launcher_background.png', background]]) {
            fs.writeFileSync(path.join(dir, name), data);
        }
        written.push(density);
    }
    if (!written.length) fail('No encontré las carpetas de íconos mipmap-* de la app.');
    fs.writeFileSync(iconBackgroundXml, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n</resources>\n`);

    // ---- 4. se escribe lo demás (ya probado arriba)
    fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    editFile(strings, stringsNext);
    editFile(gradle, gradleEdits);
    editFile(brandJs, brandEdits);

    console.log(JSON.stringify({ ok: true, slug, bundleId: info.bundleId, appName, iconColor: color, versionName, versionCode, densities: written }, null, 2));
})().catch((err) => fail(err && err.stack ? err.stack : String(err)));

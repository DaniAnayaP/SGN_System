// ---------------------------------------------------------------------------
// Grabar la pantalla (Soporte por niveles): el botón «Grabar pantalla» de cualquier solicitud de soporte. La persona repite el error mientras se graba lo que hace en la pantalla y eso se sube como evidencia real (en
// vez de tener que adivinar qué pasó con una captura). Dura hasta 2 minutos, sin audio, y pesa poco (video WebM de baja tasa). Funciona donde el navegador sabe compartir pantalla (computadoras); en un celular no está.
//   SupportRecorder.canRecord()                          → true si este navegador puede grabar la pantalla
//   const rec = await SupportRecorder.start({ onTick })  → pide elegir qué pantalla grabar y empieza; onTick(segundos)
//   const { blob, seconds } = await rec.stop()           → termina y devuelve el video (también termina solo a los 2 minutos o cuando se deja de compartir; rec.done es la misma promesa)
//   SupportRecorder.recordStream(stream, opts)           → lo mismo con un stream ya listo (lo usa start y las pruebas)
// ---------------------------------------------------------------------------
(function () {
const MAX_SECONDS = 120;
const BITS_PER_SECOND = 600000;
const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
function pickMime() {
    const list = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
}
function recordStream(stream, { maxSeconds = MAX_SECONDS, onTick } = {}) {
    const chunks = [];
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: BITS_PER_SECOND });
    const startedAt = Date.now();
    let timer = null;
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
        clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        finish({ blob: new Blob(chunks, { type: 'video/webm' }), seconds: Math.round((Date.now() - startedAt) / 1000) });
    };
    // si la persona toca «Dejar de compartir» del navegador, la grabación termina
    stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => { if (recorder.state !== 'inactive') recorder.stop(); }));
    recorder.start(1000);
    timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        if (onTick) onTick(seconds);
        if (seconds >= maxSeconds && recorder.state !== 'inactive') recorder.stop();
    }, 250);
    return { done, stop: () => { if (recorder.state !== 'inactive') recorder.stop(); return done; } };
}
async function start(opts = {}) {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
    return recordStream(stream, opts);
}
window.SupportRecorder = { canRecord, start, recordStream, MAX_SECONDS };
})();

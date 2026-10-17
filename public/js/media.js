'use strict';
/* media.js — Archivos multimedia: detecta el contenido de cada archivo antes de
   subirlo (portada de imagen/video, y en música el título, artista, álbum y
   carátula desde las etiquetas MP3/ID3, M4A/MP4 y FLAC), dibuja el "banner"
   de cada archivo, reproduce música y video, y sube muchos archivos a la vez
   (cola en paralelo con progreso). Lo usan Archivos y los proyectos. */

(function () {
  /* ───────────── Tipo de archivo ───────────── */
  const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|aiff?|alac|amr|mid|midi)$/i;
  const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|wmv)$/i;
  const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif|ico)$/i;

  function mediaKind(mime, name) {
    mime = mime || ''; name = name || '';
    if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
    if (mime.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio';
    if (mime.startsWith('video/') || VIDEO_EXT.test(name)) return 'video';
    if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
    if (/(zip|rar|7z|tar|gzip|compressed)/.test(mime) || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'archive';
    if (mime.startsWith('text/') || /(word|document|sheet|excel|presentation|powerpoint|json|xml)/.test(mime) || /\.(docx?|xlsx?|pptx?|txt|csv|md|json|rtf|odt)$/i.test(name)) return 'doc';
    return 'other';
  }
  const KIND_LABEL = { image: 'Imagen', audio: 'Música', video: 'Video', pdf: 'PDF', archive: 'Comprimido', doc: 'Documento', other: 'Archivo' };
  const KIND_ICON = {
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="15" height="14" rx="2"/><polygon points="22 7 17 11 17 13 22 17 22 7"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>';

  function fmtDuration(s) {
    s = Math.round(Number(s) || 0);
    if (!s) return '';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  function extLabel(name) { const m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toUpperCase() : ''; }

  /* ───────────── Lectura de etiquetas de música ───────────── */
  const td = (enc) => { try { return new TextDecoder(enc); } catch (e) { return new TextDecoder('utf-8'); } };
  function clean(s) { return String(s || '').replace(/\u0000/g, '').trim(); }
  function readSlice(file, start, end) { return file.slice(start, end).arrayBuffer(); }

  // ID3v2.2 / 2.3 / 2.4 (MP3): TIT2 TPE1 TALB APIC.
  async function readID3(file) {
    const head = new Uint8Array(await readSlice(file, 0, 10));
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
    const ver = head[3], flags = head[5];
    const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    const b = new Uint8Array(await readSlice(file, 0, Math.min(10 + size, 16 * 1024 * 1024)));
    const out = {};
    let i = 10;
    if (flags & 0x40) i += ver === 4 ? ((b[10] << 21) | (b[11] << 14) | (b[12] << 7) | b[13]) : (((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4);
    const v2 = ver === 2, hdr = v2 ? 6 : 10;
    const decodeText = (enc, bytes) => clean(td(enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'iso-8859-1').decode(bytes));
    while (i + hdr <= b.length) {
      const id = String.fromCharCode.apply(null, b.subarray(i, i + (v2 ? 3 : 4)));
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const fs = v2 ? ((b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5])
        : ver === 4 ? ((b[i + 4] << 21) | (b[i + 5] << 14) | (b[i + 6] << 7) | b[i + 7])
        : ((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]);
      if (fs <= 0 || i + hdr + fs > b.length) break;
      const d = b.subarray(i + hdr, i + hdr + fs);
      const key = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album' }[id];
      if (key && !out[key]) out[key] = decodeText(d[0], d.subarray(1)).split('\u0000')[0];
      if ((id === 'APIC' || id === 'PIC') && !out.picture) {
        const enc = d[0];
        let j = 1, mime;
        if (v2) { mime = 'image/' + String.fromCharCode(d[1], d[2], d[3]).toLowerCase().replace('jpg', 'jpeg'); j = 4; }
        else { const z = d.indexOf(0, 1); mime = td('iso-8859-1').decode(d.subarray(1, z)) || 'image/jpeg'; j = z + 1; }
        j += 1; // tipo de imagen
        if (enc === 1 || enc === 2) { while (j + 1 < d.length && !(d[j] === 0 && d[j + 1] === 0)) j += 2; j += 2; }
        else { while (j < d.length && d[j] !== 0) j++; j += 1; }
        if (j < d.length) out.picture = new Blob([d.slice(j)], { type: mime.indexOf('/') > 0 ? mime : 'image/jpeg' });
      }
      i += hdr + fs;
    }
    return out;
  }

  // FLAC: VORBIS_COMMENT (título, artista, álbum) y PICTURE.
  async function readFLAC(file) {
    const b = new Uint8Array(await readSlice(file, 0, Math.min(file.size, 16 * 1024 * 1024)));
    if (td('ascii').decode(b.subarray(0, 4)) !== 'fLaC') return null;
    const dv = new DataView(b.buffer);
    const out = {};
    let i = 4, last = false;
    while (!last && i + 4 <= b.length) {
      last = !!(b[i] & 0x80);
      const type = b[i] & 0x7f, len = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
      const s = i + 4;
      if (s + len > b.length) break;
      if (type === 4) {
        let p = s + 4 + dv.getUint32(s, true);
        const n = dv.getUint32(p, true); p += 4;
        for (let k = 0; k < n && p + 4 <= s + len; k++) {
          const l = dv.getUint32(p, true); p += 4;
          const kv = td('utf-8').decode(b.subarray(p, p + l)); p += l;
          const eq = kv.indexOf('=');
          const key = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album' }[kv.slice(0, eq).toUpperCase()];
          if (key && !out[key]) out[key] = clean(kv.slice(eq + 1));
        }
      } else if (type === 6 && !out.picture) {
        let p = s + 4;
        const ml = dv.getUint32(p); p += 4;
        const mime = td('ascii').decode(b.subarray(p, p + ml)); p += ml;
        p += 4 + dv.getUint32(p) + 16;
        const dl = dv.getUint32(p); p += 4;
        out.picture = new Blob([b.slice(p, p + dl)], { type: mime || 'image/jpeg' });
      }
      i = s + len;
    }
    return out;
  }

  // M4A / MP4: moov > udta > meta > ilst (©nam ©ART ©alb covr).
  async function readMP4(file) {
    const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
    let off = 0, moov = null;
    for (let n = 0; n < 64 && off + 8 <= file.size; n++) {
      const h = new Uint8Array(await readSlice(file, off, off + 16));
      let size = u32(h, 0);
      const type = td('ascii').decode(h.subarray(4, 8));
      if (n === 0 && type !== 'ftyp') return null;
      if (size === 1) size = u32(h, 8) * 4294967296 + u32(h, 12);
      else if (size === 0) size = file.size - off;
      if (size < 8) return null;
      if (type === 'moov') { if (size > 32 * 1024 * 1024) return null; moov = new Uint8Array(await readSlice(file, off, off + size)); break; }
      off += size;
    }
    if (!moov) return null;
    const out = {};
    const walk = (s, e, depth) => {
      let p = s;
      while (p + 8 <= e && depth < 8) {
        const size = u32(moov, p), type = String.fromCharCode(moov[p + 4], moov[p + 5], moov[p + 6], moov[p + 7]);
        if (size < 8 || p + size > e) break;
        if (type === 'udta' || type === 'ilst') walk(p + 8, p + size, depth + 1);
        else if (type === 'meta') walk(p + 12, p + size, depth + 1);
        else if (type === 'trak' || type === 'mdia') { /* no tiene etiquetas */ }
        else {
          const key = { '©nam': 'title', '©ART': 'artist', 'aART': 'artist', '©alb': 'album', covr: 'picture' }[type];
          if (key && !out[key] && td('ascii').decode(moov.subarray(p + 12, p + 16)) === 'data') {
            const dtype = u32(moov, p + 16) & 0xffffff, payload = moov.subarray(p + 24, p + size);
            if (key === 'picture') out.picture = new Blob([payload.slice()], { type: dtype === 14 ? 'image/png' : 'image/jpeg' });
            else out[key] = clean(td('utf-8').decode(payload));
          }
        }
        p += size;
      }
    };
    walk(8, moov.length, 0);
    return out;
  }

  // "Artista - Título.mp3" → { artist, title } (respaldo si no hay etiquetas).
  function tagsFromName(name) {
    const base = String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/_/g, ' ').trim();
    const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
    return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: base };
  }

  /* ───────────── Portada (miniatura) ───────────── */
  const THUMB_PX = 480;
  function canvasToBlob(c) { return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', 0.84)); }
  async function drawThumb(source, w, h, square) {
    if (!w || !h) return null;
    const scale = square ? Math.max(THUMB_PX / w, THUMB_PX / h) : Math.min(1, THUMB_PX / Math.max(w, h));
    const cw = square ? Math.min(THUMB_PX, Math.round(Math.min(w, h) * Math.min(1, scale))) : Math.max(1, Math.round(w * scale));
    const ch = square ? cw : Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    if (square) { const s = Math.max(cw / w, ch / h); ctx.drawImage(source, (cw - w * s) / 2, (ch - h * s) / 2, w * s, h * s); }
    else ctx.drawImage(source, 0, 0, cw, ch);
    return canvasToBlob(c);
  }
  async function imageThumb(blob, square) {
    try {
      if (window.createImageBitmap) {
        const bmp = await createImageBitmap(blob);
        const t = await drawThumb(bmp, bmp.width, bmp.height, square);
        const dims = { width: bmp.width, height: bmp.height };
        if (bmp.close) bmp.close();
        return { blob: t, dims };
      }
    } catch (e) { /* formato no soportado por el navegador (p. ej. HEIC) */ }
    return { blob: null, dims: null };
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]); }
  function videoInfo(file) {
    return withTimeout(new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      const done = (r) => { try { URL.revokeObjectURL(url); } catch (e) {} v.removeAttribute('src'); resolve(r); };
      v.muted = true; v.playsInline = true; v.preload = 'metadata';
      v.onerror = () => done(null);
      v.onloadedmetadata = () => { v.currentTime = Math.min(1.5, (v.duration || 0) * 0.15 || 0.1); };
      v.onseeked = async () => {
        let blob = null;
        try { blob = await drawThumb(v, v.videoWidth, v.videoHeight, false); } catch (e) {}
        done({ blob, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      };
      v.src = url;
    }), 8000);
  }
  function audioDuration(file) {
    return withTimeout(new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.onloadedmetadata = () => { const d = a.duration; URL.revokeObjectURL(url); resolve(isFinite(d) ? d : null); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      a.src = url;
    }), 5000);
  }

  // Analiza un archivo → { thumb: Blob|null, media: {...}|null }. Nunca lanza.
  async function analyzeFile(file) {
    const kind = mediaKind(file.type, file.name);
    try {
      if (kind === 'image') {
        if (/svg/.test(file.type)) return { thumb: null, media: null };
        const r = await imageThumb(file, false);
        return { thumb: r.blob, media: r.dims ? { width: r.dims.width, height: r.dims.height } : null };
      }
      if (kind === 'video') {
        const r = await videoInfo(file);
        return { thumb: r && r.blob, media: r ? { title: tagsFromName(file.name).title, duration: r.duration, width: r.width, height: r.height } : null };
      }
      if (kind === 'audio') {
        let tags = null;
        try { tags = (await readID3(file)) || (await readFLAC(file)) || (await readMP4(file)); } catch (e) { tags = null; }
        tags = tags || {};
        const byName = tagsFromName(file.name);
        const media = { title: tags.title || byName.title, artist: tags.artist || byName.artist || null, album: tags.album || null, duration: await audioDuration(file) };
        let thumb = null;
        if (tags.picture) thumb = (await imageThumb(tags.picture, true)).blob;
        return { thumb, media };
      }
    } catch (e) {}
    return { thumb: null, media: null };
  }

  /* ───────────── Sección donde se ve / suena una canción ─────────────
     La misma canción puede verse en su proyecto y en Archivos. Solo se marca
     como "sonando" en la sección donde se empezó a reproducir. */
  function playCtx() {
    return state.route === 'projects' && state.projectId ? 'project:' + state.projectId : String(state.route || '');
  }
  function isNowPlaying(id) {
    return !!window.nowPlayingId && String(window.nowPlayingId) === String(id) && window.nowPlayingCtx === playCtx();
  }
  window.playCtx = playCtx;
  window.isNowPlaying = isNowPlaying;

  /* ───────────── Banner del archivo (tarjeta) ───────────── */
  // f: { title, mime, size, thumbUrl, media, downloadUrl, updatedAt }
  function fileBanner(f) {
    const kind = mediaKind(f.mime, f.title);
    const m = f.media || {};
    let src = f.thumbUrl || null;
    if (!src && kind === 'image' && !/svg|heic|heif/.test(f.mime || '')) src = f.downloadUrl + '?inline=1';
    // data-fid: el reproductor marca la canción que suena sin redibujar la vista.
    const art = el('div', { class: 'fb-art fb-' + kind + (src ? ' has-img' : ''), 'data-fid': kind === 'audio' ? String(f.id) : null });
    if (src) {
      const img = el('img', { src, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => { img.remove(); art.classList.remove('has-img'); art.appendChild(el('span', { class: 'fb-icon', html: KIND_ICON[kind] })); });
      art.appendChild(img);
    } else {
      art.appendChild(el('span', { class: 'fb-icon', html: KIND_ICON[kind] }));
    }
    art.appendChild(el('span', { class: 'fb-badge' }, KIND_LABEL[kind] + (kind === 'other' || kind === 'doc' ? (extLabel(f.title) ? ' · ' + extLabel(f.title) : '') : '')));
    if (m.duration && (kind === 'audio' || kind === 'video')) art.appendChild(el('span', { class: 'fb-dur' }, fmtDuration(m.duration)));
    if (kind === 'audio' && isNowPlaying(f.id)) {
      // Canción que está sonando: ecualizador animado en lugar del botón de play.
      art.classList.add('is-now-playing');
      art.appendChild(el('span', { class: 'fb-now', 'aria-label': 'Reproduciendo' }, [ el('i'), el('i'), el('i'), el('i') ]));
    } else if (kind === 'audio' || kind === 'video') art.appendChild(el('span', { class: 'fb-play', html: ICON_PLAY, 'aria-hidden': 'true' }));
    return art;
  }
  // Título y subtítulo legibles (en música: canción y artista).
  function fileTexts(f) {
    const kind = mediaKind(f.mime, f.title);
    const m = f.media || {};
    if (kind === 'audio') return { title: m.title || f.title, sub: [m.artist || 'Artista desconocido', m.album].filter(Boolean).join(' · ') };
    return { title: f.title, sub: formatBytes(f.size || 0) + ' · ' + timeAgo(f.updatedAt || Date.now()) };
  }
  // Abre el archivo según su tipo: imagen → visor, música → reproductor, video → visor.
  // list: la lista en el orden en que se ve (el reproductor sigue con la siguiente canción).
  function openMedia(f, fallback, list) {
    const kind = mediaKind(f.mime, f.title);
    if (kind === 'audio') return playAudio(f, list);
    if (kind === 'video') return playVideo(f);
    if (fallback) return fallback(f);
    window.open(f.downloadUrl + '?inline=1', '_blank', 'noopener');
  }

  /* ───────────── Reproductor de música ─────────────
     Vive en widgets/music.js (cápsula flotante estilo Dynamic Island). */
  function playAudio(f, list) { if (typeof window.playAudio === 'function') window.playAudio(f, list); }

  /* ───────────── Visor de video ───────────── */
  function playVideo(f) {
    const ov = el('div', { class: 'mviewer', onclick: (e) => { if (e.target === ov) close(); } });
    const video = el('video', { controls: '', autoplay: '', playsinline: '', src: f.downloadUrl + '?inline=1', poster: f.thumbUrl || '' });
    const close = () => { video.pause(); ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.append(video, el('div', { class: 'mv-bar' }, [
      el('span', { class: 'mv-title' }, (f.media && f.media.title) || f.title),
      el('a', { class: 'btn btn-primary btn-sm', href: f.downloadUrl, download: f.title }, 'Descargar'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Cerrar')
    ]));
    document.body.appendChild(ov);
  }

  /* ───────────── Subida de muchos archivos (cola en paralelo) ───────────── */
  const UPLOAD_CONCURRENCY = 3;
  const UPLOAD_MAX_MB = 100;   // límite por archivo de Cloudflare Pages
  const up = { queue: [], active: 0, total: 0, done: 0, failed: 0, errors: [], panel: null };
  // Diálogo «Subir archivos» (ver openUploadDialog): tarjetas por archivo.
  const dlg = { root: null, list: null, rows: new Map(), tasks: [], opts: null };
  let renderTimer = null;
  // Redibuja sin interrumpir si el usuario está escribiendo (ver realtime.js).
  function rerender() { if (typeof window.safeRender === 'function') window.safeRender(); else render(); }
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => { renderTimer = null; rerender(); }, 500);
  }

  /* ─── Cola guardada en el navegador (IndexedDB) ───
     Cada archivo pendiente se guarda hasta que el servidor confirma que lo
     recibió. Si la página se cierra, se recarga o el teléfono la suspende, al
     volver a entrar la subida continúa sola: no se pierde ninguna canción. */
  const IDB_NAME = 'nubiflygo-uploads', IDB_STORE = 'q';
  function idb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('sin IndexedDB'));
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function idbDo(mode, fn) {
    return idb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      const req = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    }));
  }
  const saveTask = (t) => idbDo('readwrite', st => st.put({ id: t.id, file: t.file, projectId: t.opts.projectId || null, userId: t.userId || null })).catch(() => {});
  const dropTask = (id) => idbDo('readwrite', st => st.delete(id)).catch(() => {});
  const pendingTasks = () => idbDo('readonly', st => st.getAll()).catch(() => []);

  // Al terminar de subir, añade el archivo a lo que esté en pantalla. El tiempo
  // real (realtime.js) también lo refleja en otros dispositivos.
  function addUploaded(it, projectId) {
    if (Array.isArray(store.files) && typeof mapUploadedFile === 'function' && !store.files.some(x => x.id === it.id)) store.files.unshift(mapUploadedFile(it));
    const p = projectId && (store.projects || []).find(x => x.id === projectId);
    if (p && p._loaded && typeof mapDetailFile === 'function') {
      p.documents = p.documents || [];
      if (!p.documents.some(x => x.id === it.id)) p.documents.unshift(mapDetailFile(it));
      p.updatedAt = Date.now();
    }
  }

  // Mantiene la pantalla encendida mientras se sube (si el teléfono se bloquea,
  // el navegador pausa la página y la subida se detiene).
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (up.active || up.queue.length) keepAwake(true); });

  // files: File[]; opts: { projectId, onItem(item) }
  function queueUploads(files, opts, restored) {
    opts = opts || {};
    const uid = (window.currentUser && window.currentUser.id) || null;
    files.forEach((file, i) => {
      const t = restored ? restored[i] : { id: Date.now().toString(36) + Math.random().toString(36).slice(2), file, opts, userId: uid, tries: 0 };
      t.tries = t.tries || 0;
      t.status = 'queued'; t.loaded = 0; t.error = null; t.item = null;
      up.queue.push(t);
      dlg.tasks.push(t);
      if (!restored) saveTask(t);
    });
    up.total += files.length;
    keepAwake(true);
    paintPanel();
    pump();
  }
  function pump() {
    while (up.active < UPLOAD_CONCURRENCY && up.queue.length) {
      const task = up.queue.shift();
      if (task.status === 'canceled') continue;
      up.active++;
      uploadOne(task).then(() => { up.active--; paintPanel(); pump(); });
    }
    if (!up.active && !up.queue.length) { if (up.total) finishBatch(); else keepAwake(false); }
  }
  // Fallos temporales (sin red, servidor ocupado…) se reintentan solos.
  function isTransient(e) { return !e || !e.status || e.status === 408 || e.status === 429 || e.status >= 500; }
  const RETRY_WAIT = [2000, 5000, 12000, 25000, 45000];
  async function uploadOne(task) {
    const file = task.file;
    try {
      if (file.size > UPLOAD_MAX_MB * 1024 * 1024) { const er = new Error('Supera ' + UPLOAD_MAX_MB + ' MB'); er.status = 413; throw er; }
      task.status = 'preparing'; paintTask(task);
      const info = task.info || (task.info = await analyzeFile(file));
      if (task.status === 'canceled') throw canceledError();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_id', task.id);   // el servidor no duplica si la subida se repite
      if (task.opts.projectId) fd.append('project_id', task.opts.projectId);
      if (info.thumb) fd.append('thumb', info.thumb, 'thumb.jpg');
      if (info.media) fd.append('media', JSON.stringify(info.media));
      task.status = 'uploading'; task.loaded = 0; paintTask(task);
      const d = await xhrUpload('/files/upload', fd, task);
      const it = (d && d.data && d.data.item) || (d && d.item);
      dropTask(task.id);
      task.status = 'done'; task.loaded = file.size; task.item = it || null; paintTask(task);
      if (it) { addUploaded(it, task.opts.projectId); if (task.opts.onItem) task.opts.onItem(it); }
      up.done++;
      scheduleRender();
    } catch (e) {
      // Cancelada por el usuario: se olvida (no es un error).
      if (task.status === 'canceled' || (e && e.canceled)) { dropTask(task.id); up.total = Math.max(0, up.total - 1); return; }
      if (isTransient(e) && task.tries < RETRY_WAIT.length) {
        // Espera y vuelve a la cola (no cuenta como error).
        up.retrying = (up.retrying || 0) + 1;
        task.status = 'retrying'; paintTask(task);
        paintPanel();
        await new Promise(r => setTimeout(r, RETRY_WAIT[task.tries]));
        up.retrying--;
        task.tries++;
        if (task.status === 'canceled') { dropTask(task.id); up.total = Math.max(0, up.total - 1); return; }
        task.status = 'queued'; paintTask(task);
        up.queue.push(task);
        return;
      }
      if (e && e.status === 401) { task.status = 'error'; task.error = 'Inicia sesión para continuar'; paintTask(task); return; }   // queda guardado y se reanuda al volver a entrar
      dropTask(task.id);
      task.status = 'error'; task.error = (e && e.message) || 'No se pudo subir'; paintTask(task);
      up.failed++;
      if (up.errors.length < 50) up.errors.push(file.name + ': ' + (e.message || 'no se pudo subir'));
    }
  }

  // Reanuda lo que quedó pendiente (página cerrada, recargada o suspendida).
  async function resumePending() {
    const uid = (window.currentUser && window.currentUser.id) || null;
    const list = (await pendingTasks()).filter(t => t && t.file && (!t.userId || t.userId === uid));
    if (!list.length) return;
    const tasks = list.map(t => ({ id: t.id, file: t.file, opts: { projectId: t.projectId || null }, userId: t.userId, tries: 0 }));
    toast('Reanudando ' + tasks.length + (tasks.length === 1 ? ' archivo pendiente' : ' archivos pendientes'));
    queueUploads(tasks.map(t => t.file), {}, tasks);
  }
  // session.js se carga después de este archivo: se espera a la carga de la
  // página y a tener la sesión del usuario.
  window.addEventListener('load', () => { if (typeof window.loadCurrentUser === 'function') window.loadCurrentUser().then(resumePending, () => {}); });

  function finishBatch() {
    keepAwake(false);
    const ok = up.done, bad = up.failed, errs = up.errors.slice();
    // Con el diálogo abierto cada tarjeta ya dice «Completado» (el aviso taparía la lista).
    if ((ok || bad) && !dlg.root) toast(ok + (ok === 1 ? ' archivo subido' : ' archivos subidos') + (bad ? ' · ' + bad + ' con error' : ''));
    if (bad && !dlg.root) paintPanel(true, errs); else setTimeout(() => closePanel(), dlg.root ? 0 : 1800);
    up.total = 0; up.done = 0; up.failed = 0; up.errors = [];
    rerender();
  }
  function closePanel() { if (up.panel) { up.panel.remove(); up.panel = null; } }
  function paintPanel(finished, errs) {
    if (dlg.root) { closePanel(); return; }          // el diálogo ya muestra el avance
    if (!finished && !up.active && !up.queue.length) return;
    if (!up.panel) { up.panel = el('div', { class: 'upanel', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(up.panel); }
    const p = up.panel;
    p.innerHTML = '';
    if (finished) {
      p.append(
        el('div', { class: 'up-head' }, [ el('strong', {}, 'Algunos archivos no se subieron'), el('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: closePanel, html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' }) ]),
        el('ul', { class: 'up-errors' }, errs.slice(0, 8).map(t => el('li', {}, t)))
      );
      return;
    }
    const done = up.done + up.failed, pct = up.total ? Math.round(done / up.total * 100) : 0;
    p.append(
      el('div', { class: 'up-head' }, [ el('strong', {}, 'Subiendo archivos'), el('span', { class: 'up-count' }, done + ' de ' + up.total),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm up-open', onclick: () => openUploadDialog(dlg.opts || {}) }, 'Ver') ]),
      el('div', { class: 'progress' }, [ el('span', { class: 'ok', style: { width: pct + '%' } }) ]),
      el('div', { class: 'up-sub' }, [
        up.retrying ? 'Conexión inestable: reintentando ' + up.retrying + '… ' : '',
        up.failed ? up.failed + ' con error · ' : '',
        'No cierres esta pestaña; si se cierra, la subida continúa al volver.'
      ].join(''))
    );
  }
  window.addEventListener('beforeunload', (e) => { if (up.active || up.queue.length) { e.preventDefault(); e.returnValue = ''; } });

  /* ─── Subida con progreso real (XMLHttpRequest informa los bytes enviados) ─── */
  function canceledError() { const e = new Error('Cancelada'); e.canceled = true; return e; }
  function xhrUpload(path, fd, task) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      task.xhr = x;
      x.open('POST', '/api/v1' + path);
      x.withCredentials = true;
      Object.keys(API_CLIENT_HEADERS).forEach(k => x.setRequestHeader(k, API_CLIENT_HEADERS[k]));
      x.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        // El formulario lleva algo más que el archivo (miniatura, datos): se ajusta al tamaño real.
        task.loaded = Math.min(task.file.size, Math.round(ev.loaded / ev.total * task.file.size));
        paintTask(task);
      };
      x.onload = () => {
        task.xhr = null;
        let data = null;
        try { data = JSON.parse(x.responseText); } catch (e) { /* sin JSON */ }
        if (x.status === 401 && typeof showServerBanner === 'function') showServerBanner('Tu sesión expiró o no has iniciado sesión (error 401).');
        if (x.status >= 200 && x.status < 300) return resolve(data);
        const err = new Error((data && data.error) || (x.status === 401 ? 'Sesión caducada.' : 'Error ' + x.status));
        err.status = x.status;
        reject(err);
      };
      x.onerror = () => { task.xhr = null; reject(new Error('Sin conexión con el servidor.')); };
      x.onabort = () => { task.xhr = null; reject(canceledError()); };
      x.send(fd);
    });
  }

  /* ─── Diálogo «Subir archivos» ───
     Zona para soltar o elegir archivos y una tarjeta por archivo con su icono
     por tipo, bytes enviados, barra de avance y cancelar / reintentar / borrar.
     Se puede cerrar mientras sube: la subida sigue y queda el panel pequeño. */
  const ICN_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const ICN_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  const ICN_RETRY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>';
  const ICN_CLOUD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5h.5a4 4 0 0 1 .5 7.97"/><polyline points="9 14 12 11 15 14"/><line x1="12" y1="11" x2="12" y2="20"/></svg>';
  const ICN_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><polyline points="7.5 12.5 10.5 15.5 16.5 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICN_ERR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><line x1="12" y1="7" x2="12" y2="13" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="#fff"/></svg>';
  const fileExt = (name) => { const m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toUpperCase() : ''; };

  function openUploadDialog(opts) {
    dlg.opts = opts || {};
    if (dlg.root) { dlg.root.querySelector('.upd-browse').focus(); return; }
    closePanel();
    const inp = el('input', { type: 'file', multiple: '', class: 'upd-input', tabindex: '-1', 'aria-hidden': 'true' });
    inp.addEventListener('change', () => {
      const list = Array.from(inp.files || []);
      inp.value = '';
      if (list.length) queueUploads(list, dlg.opts);
    });
    const browse = el('button', { type: 'button', class: 'btn btn-ghost upd-browse', onclick: (e) => { e.stopPropagation(); inp.click(); } }, 'Buscar archivos');
    const zone = el('div', { class: 'upd-zone', role: 'button', tabindex: '0', 'aria-label': 'Elegir archivos para subir',
      onclick: () => inp.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } }
    }, [
      el('span', { class: 'upd-zone-ico', html: ICN_CLOUD }),
      el('strong', {}, 'Elige archivos o arrástralos aquí'),
      el('span', { class: 'upd-zone-sub' }, 'Imágenes, videos, música, PDF y más · hasta ' + UPLOAD_MAX_MB + ' MB'),
      browse
    ]);
    let depth = 0;
    zone.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; zone.classList.add('is-over'); });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    zone.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; zone.classList.remove('is-over'); } });
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; zone.classList.remove('is-over');
      const list = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (list.length) queueUploads(list, dlg.opts);
    });

    const proj = dlg.opts.projectId && (store.projects || []).find(x => x.id === dlg.opts.projectId);
    dlg.list = el('div', { class: 'upd-list', 'aria-live': 'polite' });
    const box = el('div', { class: 'upd', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'upd-title' }, [
      el('div', { class: 'upd-head' }, [
        el('span', { class: 'upd-head-ico', html: ICN_CLOUD }),
        el('div', { class: 'upd-head-txt' }, [
          el('h3', { id: 'upd-title' }, 'Subir archivos'),
          el('p', {}, proj ? 'Se guardarán en el proyecto «' + proj.name + '»' : 'Elige y sube los archivos que quieras')
        ]),
        el('button', { type: 'button', class: 'icon-btn upd-close', 'aria-label': 'Cerrar', html: ICN_X, onclick: closeUploadDialog })
      ]),
      el('div', { class: 'upd-body' }, [ zone, dlg.list ]),
      inp
    ]);
    dlg.root = el('div', { class: 'upd-root' }, [ box ]);
    dlg.root.addEventListener('pointerdown', (e) => { if (e.target === dlg.root) dlg.root._down = true; });
    dlg.root.addEventListener('click', (e) => { if (e.target === dlg.root && dlg.root._down) closeUploadDialog(); if (dlg.root) dlg.root._down = false; });
    dlg.root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('#modal-root.show')) { e.stopPropagation(); closeUploadDialog(); } });
    // Soltar archivos en cualquier parte del diálogo, no solo en la zona.
    box.addEventListener('dragover', (e) => e.preventDefault());
    box.addEventListener('drop', (e) => { if (e.target.closest('.upd-zone')) return; e.preventDefault(); const l = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (l.length) queueUploads(l, dlg.opts); });
    document.body.appendChild(dlg.root);
    dlg.rows.clear();
    dlg.tasks.forEach(paintTask);
    setTimeout(() => browse.focus(), 30);
  }
  function closeUploadDialog() {
    if (!dlg.root) return;
    const r = dlg.root;
    dlg.root = null; dlg.list = null; dlg.rows.clear();
    r.classList.add('is-leaving');
    setTimeout(() => r.remove(), 160);
    // Lo terminado se olvida; lo que sigue subiendo pasa al panel pequeño.
    dlg.tasks = dlg.tasks.filter(t => t.status !== 'done' && t.status !== 'canceled' && t.status !== 'error');
    paintPanel();
  }
  function statusText(t) {
    const size = formatBytes(t.file.size);
    switch (t.status) {
      case 'queued': return [size, 'En espera'];
      case 'preparing': return [size, 'Preparando…'];
      case 'uploading': return [formatBytes(t.loaded) + ' de ' + size, 'Subiendo…'];
      case 'retrying': return [formatBytes(t.loaded) + ' de ' + size, 'Reintentando…'];
      case 'done': return [size, 'Completado'];
      case 'error': return [size, t.error || 'Error'];
      default: return [size, ''];
    }
  }
  function paintTask(t) {
    if (!dlg.list) return;
    if (t.status === 'canceled') { const r = dlg.rows.get(t.id); if (r) { r.node.remove(); dlg.rows.delete(t.id); } return; }
    let r = dlg.rows.get(t.id);
    if (!r) {
      const kind = mediaKind(t.file.type, t.file.name);
      r = { node: el('div', { class: 'upd-item upd-k-' + kind }), act: null };
      r.ico = el('span', { class: 'upd-file', 'aria-hidden': 'true' }, [ el('span', { class: 'upd-file-ext' }, fileExt(t.file.name) || KIND_LABEL[kind]) ]);
      r.name = el('div', { class: 'upd-name', title: t.file.name }, t.file.name);
      r.bytes = el('span', { class: 'upd-bytes' });
      r.state = el('span', { class: 'upd-state' });
      r.btn = el('button', { type: 'button', class: 'icon-btn upd-act' });
      r.fill = el('span', { class: 'upd-fill' });
      r.bar = el('div', { class: 'upd-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Avance de ' + t.file.name }, [ r.fill ]);
      r.node.append(r.ico, el('div', { class: 'upd-main' }, [ r.name, el('div', { class: 'upd-meta' }, [ r.bytes, el('span', { class: 'upd-dot', 'aria-hidden': 'true' }, '•'), r.state ]) ]), r.btn, r.bar);
      dlg.rows.set(t.id, r);
      dlg.list.prepend(r.node);
    }
    const [bytes, state] = statusText(t);
    r.bytes.textContent = bytes;
    const busy = t.status === 'preparing' || t.status === 'uploading' || t.status === 'retrying';
    r.state.innerHTML = '';
    r.state.className = 'upd-state is-' + t.status;
    if (busy) r.state.appendChild(el('span', { class: 'upd-spin', 'aria-hidden': 'true' }));
    else if (t.status === 'done') r.state.appendChild(el('span', { class: 'upd-badge', html: ICN_OK }));
    else if (t.status === 'error') r.state.appendChild(el('span', { class: 'upd-badge', html: ICN_ERR }));
    r.state.appendChild(document.createTextNode(state));
    const pct = t.status === 'done' ? 100 : t.file.size ? Math.round(t.loaded / t.file.size * 100) : 0;
    r.fill.style.width = pct + '%';
    r.bar.setAttribute('aria-valuenow', String(pct));
    r.node.classList.toggle('has-bar', t.status !== 'done' && t.status !== 'error');
    r.node.classList.toggle('is-done', t.status === 'done');
    r.node.classList.toggle('is-error', t.status === 'error');
    // Botón según el estado: cancelar (subiendo), reintentar (error) o borrar (completado).
    const act = t.status === 'done' ? 'delete' : t.status === 'error' ? 'retry' : 'cancel';
    if (r.act !== act) {
      r.act = act;
      const conf = { cancel: [ICN_X, 'Cancelar'], retry: [ICN_RETRY, 'Reintentar'], delete: [ICN_TRASH, 'Eliminar archivo'] }[act];
      r.btn.innerHTML = conf[0];
      r.btn.setAttribute('aria-label', conf[1] + ' ' + t.file.name);
      r.btn.title = conf[1];
      r.btn.onclick = () => (act === 'cancel' ? cancelTask : act === 'retry' ? retryTask : deleteUploaded)(t);
    }
  }
  function cancelTask(t) {
    const queued = up.queue.indexOf(t);
    if (queued >= 0) { up.queue.splice(queued, 1); up.total = Math.max(0, up.total - 1); dropTask(t.id); }
    t.status = 'canceled';
    if (t.xhr) t.xhr.abort();
    dlg.tasks = dlg.tasks.filter(x => x !== t);
    paintTask(t);
    paintPanel();
    pump();
  }
  function retryTask(t) {
    dropTask(t.id);
    up.failed = Math.max(0, up.failed - 1);
    dlg.tasks = dlg.tasks.filter(x => x !== t);
    const r = dlg.rows.get(t.id); if (r) { r.node.remove(); dlg.rows.delete(t.id); }
    queueUploads([t.file], t.opts);
  }
  async function deleteUploaded(t) {
    if (!t.item) return;
    const ok = await confirmDialog('¿Eliminar archivo?', '"' + t.file.name + '" se eliminará para siempre.', 'Eliminar');
    if (!ok) return;
    try { await apiDelete('/files/' + t.item.id); }
    catch (e) { if (e.status !== 404) { toast(e.message || 'No se pudo eliminar'); return; } }
    store.files = (store.files || []).filter(x => x.id !== t.item.id);
    (store.projects || []).forEach(p => { if (p.documents) p.documents = p.documents.filter(x => x.id !== t.item.id); });
    t.status = 'canceled';
    dlg.tasks = dlg.tasks.filter(x => x !== t);
    paintTask(t);
    toast('Archivo eliminado');
    rerender();
  }

  // Botón «Subir» → diálogo de subida (opts: { projectId, onItem }).
  function pickAndUpload(opts) { openUploadDialog(opts); }

  // Miniatura cuadrada para listas (Publicados): portada, la propia imagen o un icono por tipo.
  function fileThumb(f) {
    const kind = f.kind === 'file' || f.mime ? mediaKind(f.mime, f.title) : 'doc';
    let src = f.thumbUrl || null;
    if (!src && kind === 'image' && f.downloadUrl && !/svg|heic|heif/.test(f.mime || '')) src = f.downloadUrl + '?inline=1';
    const box = el('span', { class: 'lr-thumb lr-thumb-' + kind, 'aria-hidden': 'true' });
    const icon = () => box.appendChild(el('span', { class: 'lr-thumb-ico', html: KIND_ICON[kind] || KIND_ICON.other }));
    if (src) {
      const img = el('img', { src, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => { img.remove(); icon(); });
      box.appendChild(img);
    } else icon();
    return box;
  }

  window.fileThumb = fileThumb;
  window.mediaKind = mediaKind;
  window.fileBanner = fileBanner;
  window.fileTexts = fileTexts;
  window.openMedia = openMedia;
  window.queueUploads = queueUploads;
  window.pickAndUpload = pickAndUpload;
  window.openUploadDialog = openUploadDialog;
  window.analyzeFile = analyzeFile;
  window.fmtDuration = fmtDuration;
})();

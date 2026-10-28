'use strict';
/* views/library.js — Orden automático (Etapa 1).
   · Biblioteca de música: artistas (círculos), álbumes (portadas con ▶) y
     canciones (lista), con los datos que ya leemos de cada canción.
   · Galería de fotos: por día, la primera foto de cada día más grande.
   · Categoría automática de un proyecto según lo que tiene (Música, Fotos,
     Videos, Documentos o Mixto) y su portada grande (hero).
   · Colecciones inteligentes de Archivos y Limpieza (duplicados y grandes).
   Nada se mueve ni se copia: son vistas sobre los archivos que ya existen. */

  /* ───────────── Datos ───────────── */
  const LIB_GRADS = [
    'linear-gradient(135deg,#1db954,#0b3d20)', 'linear-gradient(135deg,#ff7e5f,#feb47b)',
    'linear-gradient(135deg,#6a82fb,#fc5c7d)', 'linear-gradient(135deg,#0f2027,#2c5364)',
    'linear-gradient(135deg,#f7971e,#ffd200)', 'linear-gradient(135deg,#8e2de2,#4a00e0)',
    'linear-gradient(135deg,#43cea2,#185a9d)', 'linear-gradient(135deg,#ee0979,#ff6a00)',
    'linear-gradient(135deg,#232526,#414345)', 'linear-gradient(135deg,#56ab2f,#a8e063)'
  ];
  // Mismo color siempre para el mismo nombre (artista, álbum…).
  function libGrad(seed) {
    let h = 0;
    for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return LIB_GRADS[Math.abs(h) % LIB_GRADS.length];
  }
  function libInitials(name) {
    const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }
  const libKind = (f) => f.kind === 'doc' ? 'doc' : mediaKind(f.mime || f.type, f.title);
  const libDate = (f) => f.createdAt || f.updatedAt || Date.now();
  const songTitle = (f) => (f.media && f.media.title) || String(f.title || 'Canción').replace(/\.[a-z0-9]{2,5}$/i, '');
  const songArtist = (f) => (f.media && f.media.artist) || 'Artista desconocido';
  const songAlbum = (f) => (f.media && f.media.album) || '';
  // Imagen que representa un archivo: su portada o, si es foto, la foto misma.
  function libThumb(f) {
    if (f.thumbUrl) return f.thumbUrl;
    if (libKind(f) === 'image' && f.downloadUrl && !/svg|heic|heif/.test(f.mime || '')) return f.downloadUrl + '?inline=1';
    return null;
  }

  function groupMusic(files) {
    const songs = files.filter(f => libKind(f) === 'audio');
    const artists = new Map(), albums = new Map();
    songs.forEach(f => {
      const ar = songArtist(f), al = songAlbum(f);
      if (!artists.has(ar)) artists.set(ar, { name: ar, files: [], cover: null });
      const a = artists.get(ar); a.files.push(f); if (!a.cover && f.thumbUrl) a.cover = f.thumbUrl;
      if (al) {
        const k = ar + '\u0000' + al;
        if (!albums.has(k)) albums.set(k, { name: al, artist: ar, files: [], cover: null });
        const b = albums.get(k); b.files.push(f); if (!b.cover && f.thumbUrl) b.cover = f.thumbUrl;
      }
    });
    const byCount = (a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name, 'es');
    const dur = songs.reduce((n, f) => n + (Number(f.media && f.media.duration) || 0), 0);
    return { songs, artists: [...artists.values()].sort(byCount), albums: [...albums.values()].sort(byCount), duration: dur };
  }
  function fmtLongDuration(s) {
    s = Math.round(s || 0);
    if (!s) return '';
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? h + ' h ' + m + ' min' : m + ' min';
  }

  /* ─── Categoría automática del proyecto ─── */
  const CAT = {
    music:  { label: 'Música', color: '#35b98f', hero: 'linear-gradient(135deg,#0e7a46,#0b3d20 55%,#14141c)', icon: KIND_ICON_LIB('audio') },
    photos: { label: 'Fotos', color: '#2f7de1', hero: 'linear-gradient(135deg,#f0745a,#c2416b 55%,#3b2b6e)', icon: KIND_ICON_LIB('image') },
    videos: { label: 'Videos', color: '#8b5cf6', hero: 'linear-gradient(135deg,#5b3cc4,#2a1f5c 55%,#121218)', icon: KIND_ICON_LIB('video') },
    docs:   { label: 'Documentos', color: '#e0a21b', hero: 'linear-gradient(135deg,#b7791f,#5a3d12 55%,#16130e)', icon: KIND_ICON_LIB('doc') },
    mixed:  { label: 'Mixto', color: '#6b6a63', hero: null, icon: KIND_ICON_LIB('mixed') }
  };
  function KIND_ICON_LIB(k) {
    const S = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
    return {
      audio: S('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
      image: S('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
      video: S('<rect x="2" y="5" width="15" height="14" rx="2"/><polygon points="22 7 17 11 17 13 22 17 22 7"/>'),
      doc: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>'),
      mixed: S('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
      archive: S('<rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M5 8v11a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8"/><line x1="10" y1="12" x2="14" y2="12"/>'),
      other: S('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>')
      // Si llega un tipo que no está, se usa «other»: antes devolvía undefined
      // y se pintaba esa palabra encima de la etiqueta.
    }[k] || S('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>');
  }
  function phBytes(n) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, v = Number(n) || 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
  }

  // La categoría gana si 60 % o más del contenido es de ese tipo.
  function projectCategory(items) {
    if (!items || !items.length) return null;
    const n = { music: 0, photos: 0, videos: 0, docs: 0 };
    items.forEach(f => {
      const k = libKind(f);
      if (k === 'audio') n.music++; else if (k === 'image') n.photos++; else if (k === 'video') n.videos++;
      else if (k === 'pdf' || k === 'doc') n.docs++;
    });
    const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return n[top] / items.length >= 0.6 ? top : 'mixed';
  }
  // Contenido del proyecto: lo cargado al abrirlo o, en la lista, sus archivos conocidos.
  function projectItems(p) {
    if (p._loaded) return p.documents || [];
    return (Array.isArray(store.files) ? store.files : []).filter(f => f.project_id === p.id);
  }

  /* ───────────── Piezas visuales ───────────── */
  const LIB_ICN = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5h.5a4 4 0 0 1 .5 7.97"/><polyline points="9 14 12 11 15 14"/><line x1="12" y1="11" x2="12" y2="20"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    big: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>'
  };

  // Portada: imagen real si hay; si no, degradado con iniciales.
  function libCover(url, seed, label, cls) {
    const box = el('div', { class: cls, style: { background: libGrad(seed) } }, [ el('span', { class: 'lib-ini' }, label) ]);
    if (url) {
      const img = el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => img.remove());
      box.appendChild(img);
    }
    return box;
  }
  function libSeg(key, current, opts, onPick) {
    return el('div', { class: 'lib-seg', role: 'tablist', 'aria-label': 'Vista' }, opts.map(o => el('button', {
      type: 'button', role: 'tab', class: o[0] === current ? 'on' : '', 'aria-selected': o[0] === current ? 'true' : 'false',
      onclick: () => onPick(o[0])
    }, o[1])));
  }
  function libSec(title, link, onLink) {
    return el('div', { class: 'lib-sec' }, [ el('h3', {}, title), link ? el('button', { type: 'button', class: 'lib-link', onclick: onLink }, link) : null ].filter(Boolean));
  }
  // Estado de cada biblioteca (Archivos o un proyecto): pestaña y artista elegido.
  function libState(key) {
    state.lib = state.lib || {};
    return state.lib[key] || (state.lib[key] = { seg: 'artists', artist: null, album: null });
  }

  /* ───────────── Biblioteca de música ───────────── */
  // ctx: { key, onMenu(f, evt) }
  function musicLibrary(files, ctx) {
    const st = libState(ctx.key);
    if (!['artists', 'albums', 'songs', 'grid'].includes(st.seg)) st.seg = 'artists';
    const all = groupMusic(files);
    const wrap = el('div', { class: 'lib' });
    if (!all.songs.length) {
      wrap.appendChild(emptyBlock('Aún no hay música', 'Sube canciones y aquí aparecerán ordenadas por artista y álbum, con sus portadas.', null, null, EMPTY_ART.music));
      return wrap;
    }
    const pick = (seg) => { st.seg = seg; st.artist = null; st.album = null; render(); };
    // Filtro de artista o álbum (al tocar un círculo o una portada).
    let songs = all.songs, albums = all.albums;
    if (st.artist) { songs = songs.filter(f => songArtist(f) === st.artist); albums = albums.filter(a => a.artist === st.artist); }
    if (st.album) { songs = songs.filter(f => songAlbum(f) === st.album.name && songArtist(f) === st.album.artist); }

    if (st.artist || st.album) {
      const title = st.album ? st.album.name : st.artist;
      const sub = st.album ? st.album.artist + ' · ' + songs.length + (songs.length === 1 ? ' canción' : ' canciones')
        : songs.length + (songs.length === 1 ? ' canción' : ' canciones') + (albums.length ? ' · ' + albums.length + (albums.length === 1 ? ' álbum' : ' álbumes') : '');
      const back = () => { if (st.album && st.artist) st.album = null; else { st.artist = null; st.album = null; } render(); };
      const cover = st.album ? st.album.cover : (all.artists.find(a => a.name === st.artist) || {}).cover;
      wrap.appendChild(el('div', { class: 'lib-focus' }, [
        el('button', { type: 'button', class: 'icon-btn lib-back', 'aria-label': 'Volver', title: 'Volver', html: LIB_ICN.back, onclick: back }),
        libCover(cover, title, libInitials(title), st.album ? 'lib-focus-cv' : 'lib-focus-cv is-round'),
        el('div', { class: 'lib-focus-t' }, [ el('strong', {}, title), el('span', {}, sub) ]),
        el('button', { type: 'button', class: 'lib-play-all', 'aria-label': 'Reproducir', title: 'Reproducir', html: LIB_ICN.play, onclick: () => playAudio(songs[0], songs) })
      ]));
      if (!st.album && albums.length) {
        wrap.appendChild(libSec('Álbumes'));
        wrap.appendChild(albumGrid(albums, st));
      }
      wrap.appendChild(libSec('Canciones'));
      wrap.appendChild(songList(songs, ctx));
      return wrap;
    }

    wrap.appendChild(libSeg(ctx.key, st.seg, [ ['artists', 'Artistas'], ['albums', 'Álbumes'], ['songs', 'Canciones'], ctx.grid ? ['grid', 'Archivos'] : null ].filter(Boolean), pick));
    if (st.seg === 'grid' && ctx.grid) {
      wrap.appendChild(ctx.grid());
    } else if (st.seg === 'albums') {
      wrap.appendChild(albums.length ? albumGrid(albums, st) : el('p', { class: 'lib-empty' }, 'Tus canciones aún no traen el nombre del álbum.'));
    } else if (st.seg === 'songs') {
      wrap.appendChild(songList(songs, ctx, true));
    } else {
      wrap.appendChild(el('div', { class: 'lib-artists' }, all.artists.map(a => el('button', {
        type: 'button', class: 'lib-artist', onclick: () => { st.artist = a.name; render(); }
      }, [
        libCover(a.cover, a.name, libInitials(a.name), 'lib-av'),
        el('strong', {}, a.name),
        el('span', {}, a.files.length + (a.files.length === 1 ? ' canción' : ' canciones'))
      ]))));
      if (albums.length) {
        wrap.appendChild(libSec('Álbumes', albums.length > 6 ? 'Ver todos' : null, () => pick('albums')));
        wrap.appendChild(albumGrid(albums.slice(0, 6), st));
      }
      wrap.appendChild(libSec('Canciones', songs.length > 5 ? 'Ver las ' + songs.length : null, () => pick('songs')));
      wrap.appendChild(songList(songs.slice(0, 5), ctx, false, songs));
    }
    return wrap;
  }
  function albumGrid(albums, st) {
    return el('div', { class: 'lib-albums' }, albums.map(a => el('div', { class: 'lib-album' }, [
      el('button', { type: 'button', class: 'lib-album-open', 'aria-label': 'Abrir el álbum ' + a.name, onclick: () => { st.artist = a.artist; st.album = a; render(); } }, [
        libCover(a.cover, a.name, libInitials(a.name), 'lib-cv')
      ]),
      el('button', { type: 'button', class: 'lib-cv-play', 'aria-label': 'Reproducir ' + a.name, title: 'Reproducir', html: LIB_ICN.play, onclick: () => playAudio(a.files[0], a.files) }),
      el('strong', {}, a.name),
      el('span', {}, a.artist)
    ])));
  }
  // Portada de la fila con el ecualizador de «sonando» encima (como Spotify o
  // YouTube Music); solo se ve en la fila .is-playing (lo marca music.js).
  function songCover(f) {
    const cv = libCover(f.thumbUrl, songAlbum(f) || songTitle(f), '', 'lib-song-cv');
    cv.appendChild(el('span', { class: 'lib-now', 'aria-hidden': 'true' }, [ el('i'), el('i'), el('i'), el('i') ]));
    return cv;
  }
  // queue: lista completa para reproducir en orden (aunque se muestren solo algunas).
  function songList(songs, ctx, paged, queue) {
    const list = el('div', { class: 'lib-songs' });
    const q = queue || songs;
    let shown = songs, pgEl = null;
    if (paged) { const pg = paginate(songs, 'lib:' + ctx.key); shown = pg.items; pgEl = pg.el; }
    shown.forEach((f, i) => {
      const now = window.isNowPlaying ? window.isNowPlaying(f.id) : false;
      const dur = f.media && f.media.duration ? (window.fmtDuration ? fmtDuration(f.media.duration) : '') : '';
      list.appendChild(el('div', { class: 'lib-song' + (now ? ' is-playing' : ''), 'data-fid': String(f.id) }, [
        el('button', { type: 'button', class: 'lib-song-main', onclick: () => playAudio(f, q) }, [
          el('span', { class: 'lib-n' }, String(songs.indexOf(f) + 1)),
          songCover(f),
          el('span', { class: 'lib-song-t' }, [ el('strong', {}, songTitle(f)), el('span', {}, songArtist(f)) ]),
          el('span', { class: 'lib-song-al' }, songAlbum(f)),
          el('span', { class: 'lib-song-d' }, dur)
        ]),
        ctx.onMenu ? el('button', { type: 'button', class: 'icon-btn lib-more', 'aria-label': 'Opciones de ' + songTitle(f), title: 'Opciones', html: LIB_ICN.dots, onclick: (e) => ctx.onMenu(f, e) }) : null
      ].filter(Boolean)));
    });
    const box = el('div', {}, [ list ]);
    if (pgEl) box.appendChild(pgEl);
    return box;
  }

  /* ───────────── Galería de fotos ───────────── */
  function photoLibrary(files, ctx) {
    const st = libState(ctx.key);
    if (st.seg !== 'all' && !(st.seg === 'grid' && ctx.grid)) st.seg = 'days';
    const media = files.filter(f => /^(image|video)$/.test(libKind(f))).sort((a, b) => libDate(b) - libDate(a));
    const wrap = el('div', { class: 'lib' });
    if (!media.length) {
      wrap.appendChild(emptyBlock('Aún no hay fotos', 'Sube fotos y aquí aparecerán ordenadas por día.', null, null, EMPTY_ART.photos));
      return wrap;
    }
    const open = (f) => (libKind(f) === 'image' ? openImageViewer(f) : openMedia(f, null, media));
    const tile = (f, big) => {
      const url = libThumb(f);
      const t = el('button', { type: 'button', class: 'lib-ph' + (big ? ' big' : ''), 'aria-label': f.title, onclick: () => open(f), style: { background: libGrad(f.id) } });
      if (url) { const img = el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }); img.addEventListener('error', () => img.remove()); t.appendChild(img); }
      if (libKind(f) === 'video') t.appendChild(el('span', { class: 'lib-ph-play', html: LIB_ICN.play }));
      return t;
    };
    wrap.appendChild(libSeg(ctx.key, st.seg, [ ['days', 'Por día'], ['all', 'Todas'], ctx.grid ? ['grid', 'Archivos'] : null ].filter(Boolean), (s) => { st.seg = s; render(); }));
    if (st.seg === 'grid' && ctx.grid) { wrap.appendChild(ctx.grid()); return wrap; }
    if (st.seg === 'all') {
      const pg = paginate(media, 'lib:' + ctx.key);
      wrap.appendChild(el('div', { class: 'lib-gallery' }, pg.items.map(f => tile(f, false))));
      if (pg.el) wrap.appendChild(pg.el);
      return wrap;
    }
    const days = new Map();
    media.forEach(f => {
      const d = new Date(libDate(f)); const k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (!days.has(k)) days.set(k, { date: d, files: [] });
      days.get(k).files.push(f);
    });
    const list = [...days.values()];
    const label = (d) => d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const count = (fs) => { const v = fs.filter(f => libKind(f) === 'video').length, p = fs.length - v; return [p ? p + (p === 1 ? ' foto' : ' fotos') : '', v ? v + (v === 1 ? ' video' : ' videos') : ''].filter(Boolean).join(' · '); };
    if (list.length > 1) {
      wrap.appendChild(el('div', { class: 'lib-albums' }, list.slice(0, 12).map((g, i) => el('div', { class: 'lib-album' }, [
        el('button', { type: 'button', class: 'lib-album-open', 'aria-label': cap(label(g.date)), onclick: () => { const t = document.getElementById('lib-day-' + i); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, [
          libCover(libThumb(g.files[0]), label(g.date), '', 'lib-cv')
        ]),
        el('strong', {}, cap(g.date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))),
        el('span', {}, count(g.files))
      ]))));
    }
    list.forEach((g, i) => {
      wrap.appendChild(el('div', { class: 'lib-day', id: 'lib-day-' + i }, [
        el('div', { class: 'lib-day-h' }, [ el('strong', {}, cap(label(g.date))), el('span', {}, count(g.files)) ]),
        el('div', { class: 'lib-gallery' }, g.files.slice(0, 60).map((f, j) => tile(f, j === 0 && g.files.length > 4)))
      ]));
    });
    return wrap;
  }

  /* ───────────── Portada grande del proyecto ───────────── */
  // loading: el contenido aún no llega (portada y resumen con esqueleto, sin «Nuevo» ni «Vacío»).
  function projectHero(p, items, actions, loading) {
    const cat = projectCategory(items);
    const meta = CAT[cat] || CAT.mixed;
    // Icono elegido por el usuario: gana a las portadas y a la categoría
    // automática (es una elección explícita). Sin elegir («Auto»), como siempre.
    const chosen = projectIcon(p);
    const thumbs = chosen ? [] : items.map(libThumb).filter(Boolean).slice(0, 4);
    const cover = el('div', { class: 'ph-cover' + (thumbs.length < 4 ? ' is-solid' : '') });
    if (chosen) { cover.style.background = safeColor(p.color); cover.appendChild(el('span', { class: 'ph-cover-ico', html: chosen.svg })); }
    else if (thumbs.length >= 4) thumbs.forEach(u => { const i = el('img', { src: u, alt: '', loading: 'lazy', decoding: 'async' }); i.addEventListener('error', () => { i.style.visibility = 'hidden'; }); cover.appendChild(i); });
    else if (thumbs.length) { const i = el('img', { src: thumbs[0], alt: '', decoding: 'async' }); i.addEventListener('error', () => i.remove()); cover.style.background = libGrad(p.name); cover.appendChild(i); }
    else { cover.style.background = meta.hero ? libGrad(p.name) : safeColor(p.color); cover.appendChild(el('span', { class: 'ph-cover-ico', html: meta.icon })); }
    if (loading && !chosen) { cover.className = 'ph-cover sk sk-on-dark'; cover.innerHTML = ''; cover.style.background = ''; }

    let summary;
    if (cat === 'music') {
      const g = groupMusic(items);
      summary = [ g.songs.length + (g.songs.length === 1 ? ' canción' : ' canciones'), g.artists.length + (g.artists.length === 1 ? ' artista' : ' artistas'), fmtLongDuration(g.duration) ];
    } else {
      const c = { image: 0, video: 0, audio: 0, doc: 0 };
      items.forEach(f => { const k = libKind(f); if (k === 'pdf' || k === 'archive' || k === 'other') c.doc++; else c[k] = (c[k] || 0) + 1; });
      summary = [ c.image && c.image + (c.image === 1 ? ' foto' : ' fotos'), c.video && c.video + (c.video === 1 ? ' video' : ' videos'), c.audio && c.audio + (c.audio === 1 ? ' canción' : ' canciones'), c.doc && c.doc + (c.doc === 1 ? ' documento' : ' documentos') ];
      if (!items.length) summary = [ 'Vacío · sube archivos o crea un documento' ];
    }
    // Lo que ocupa, igual que lo dice el banner de la sección. Vale para los
    // dos casos, el de música y el resto.
    if (items.length) {
      const bytes = items.reduce((t, f) => t + (Number(f.size && typeof f.size === 'object' ? f.size.bytes : f.size) || 0), 0);
      if (bytes) summary.push(phBytes(bytes));
    }
    // Con icono elegido el fondo va con su color; si no, el de la categoría.
    const c = safeColor(p.color);
    const bg = (!chosen && meta.hero) || ('linear-gradient(135deg,' + c + ',' + 'color-mix(in srgb,' + c + ' 45%, #111) 60%, #121218)');
    return el('section', { class: 'ph', style: { background: bg }, 'aria-label': 'Proyecto ' + p.name }, [
      cover,
      el('div', { class: 'ph-info' }, [
        el('span', { class: 'ph-k' }, [
          // Con icono elegido manda ese icono y desaparece el «auto»: el aviso
          // es de la categoría, pero leído junto a un icono puesto a mano decía
          // justo lo contrario de lo que pasa.
          el('span', { class: 'ph-k-ico', html: chosen ? chosen.svg : meta.icon }),
          loading ? 'Proyecto' : 'Proyecto · ' + (cat ? meta.label : 'Nuevo'),
          (cat && !chosen) ? el('span', { class: 'ph-auto', title: 'La categoría se pone sola según lo que tiene el proyecto', html: LIB_ICN.spark + ' auto' }) : null
        ].filter(Boolean)),
        el('h2', {}, p.name),
        loading ? el('p', { class: 'ph-sum' }, [ skBox('min(260px, 70%)', '12px', 'sk-on-dark') ]) : el('p', { class: 'ph-sum' }, summary.filter(Boolean).join(' · ')),
        p.description ? el('p', { class: 'ph-desc' }, p.description) : null,
        el('div', { class: 'ph-acts' }, actions.filter(Boolean))
      ].filter(Boolean))
    ]);
  }
  function heroBtn(label, icon, onclick, cls) {
    return el('button', { type: 'button', class: 'ph-btn' + (cls ? ' ' + cls : ''), onclick, 'aria-label': label, title: label, html: icon + (cls === 'is-icon' ? '' : '<span>' + esc(label) + '</span>') });
  }

  /* ───────────── Archivos: colecciones inteligentes ───────────── */
  // Duplicados: misma huella (checksum) o, si el servidor no la guarda, mismo nombre y tamaño.
  function findDuplicates(files) {
    const m = new Map();
    files.forEach(f => {
      const k = f.checksum ? 'c:' + f.checksum : 'n:' + String(f.title || '').toLowerCase() + ':' + f.size;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    });
    return [...m.values()].filter(g => g.length > 1).map(g => g.sort((a, b) => libDate(a) - libDate(b)));
  }
  const FILE_COLS = [
    { id: 'music', label: 'Música', kinds: ['audio'], icon: KIND_ICON_LIB('audio'), color: '#35b98f' },
    { id: 'photos', label: 'Fotos', kinds: ['image'], icon: KIND_ICON_LIB('image'), color: '#2f7de1' },
    { id: 'videos', label: 'Videos', kinds: ['video'], icon: KIND_ICON_LIB('video'), color: '#8b5cf6' },
    { id: 'docs', label: 'Documentos', kinds: ['pdf', 'doc', 'archive', 'other'], icon: KIND_ICON_LIB('doc'), color: '#e0a21b' }
  ];
  function filesOfCol(files, col) { return files.filter(f => col.kinds.includes(libKind(f))); }
  function colSummary(col, fs) {
    if (col.id === 'music') { const g = groupMusic(fs); return fs.length + (fs.length === 1 ? ' canción' : ' canciones') + ' · ' + g.artists.length + (g.artists.length === 1 ? ' artista' : ' artistas'); }
    if (col.id === 'photos') { const months = new Set(fs.map(f => { const d = new Date(libDate(f)); return d.getFullYear() + '-' + d.getMonth(); })); return fs.length + (fs.length === 1 ? ' foto' : ' fotos') + ' · ' + months.size + (months.size === 1 ? ' mes' : ' meses'); }
    const bytes = fs.reduce((n, f) => n + (Number(f.size) || 0), 0);
    return fs.length + ' ' + (col.id === 'videos' ? (fs.length === 1 ? 'video' : 'videos') : (fs.length === 1 ? 'archivo' : 'archivos')) + ' · ' + formatBytes(bytes);
  }
  function filesTabs(files, tab) {
    const counts = {};
    FILE_COLS.forEach(c => { counts[c.id] = filesOfCol(files, c).length; });
    const dup = findDuplicates(files).reduce((n, g) => n + g.length - 1, 0);
    const tabs = [ ['collections', 'Colecciones', LIB_ICN.spark, null], ['all', 'Todos', KIND_ICON_LIB('mixed'), files.length] ]
      .concat(FILE_COLS.filter(c => counts[c.id]).map(c => [c.id, c.label, c.icon, counts[c.id]]))
      .concat([ ['cleanup', 'Limpieza', LIB_ICN.big, dup || null] ]);
    return el('div', { class: 'lib-tabs', role: 'tablist', 'aria-label': 'Colecciones' }, tabs.map(t => el('button', {
      type: 'button', role: 'tab', class: 'lib-tab' + (t[0] === tab ? ' on' : ''), 'aria-selected': t[0] === tab ? 'true' : 'false',
      onclick: () => { state.filesTab = t[0]; state.search = ''; render(); }
    }, [ el('span', { class: 'lib-tab-ico', html: t[2] }), t[1], t[3] != null ? el('b', {}, String(t[3])) : null ].filter(Boolean))));
  }
  function collectionsOverview(files) {
    const wrap = el('div', { class: 'lib' });
    const cols = FILE_COLS.map(c => ({ c, fs: filesOfCol(files, c) })).filter(x => x.fs.length);
    wrap.appendChild(libSec('Colecciones inteligentes'));
    wrap.appendChild(el('p', { class: 'lib-note' }, 'Se ordenan solas con los datos de cada archivo. Nada se mueve de su lugar.'));
    wrap.appendChild(el('div', { class: 'lib-cols' }, cols.map(({ c, fs }) => {
      const thumbs = fs.map(libThumb).filter(Boolean).slice(0, 4);
      const mosaic = el('div', { class: 'lib-mosaic' });
      for (let i = 0; i < 4; i++) {
        const cell = el('i', { style: { background: libGrad(c.id + i + (fs[i] ? fs[i].id : '')) } });
        if (thumbs[i]) { const im = el('img', { src: thumbs[i], alt: '', loading: 'lazy', decoding: 'async' }); im.addEventListener('error', () => im.remove()); cell.appendChild(im); }
        mosaic.appendChild(cell);
      }
      return el('button', { type: 'button', class: 'lib-col', onclick: () => { state.filesTab = c.id; render(); } }, [
        mosaic, el('span', { class: 'lib-col-b' }, [
          el('span', { class: 'lib-col-badge', style: { background: c.color }, html: c.icon }),
          el('span', { class: 'lib-col-t' }, [ el('strong', {}, c.label), el('span', {}, colSummary(c, fs)) ])
        ])
      ]);
    })));
    const dups = findDuplicates(files), dupN = dups.reduce((n, g) => n + g.length - 1, 0);
    const dupBytes = dups.reduce((n, g) => n + g.slice(1).reduce((m, f) => m + (Number(f.size) || 0), 0), 0);
    const big = files.slice().sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 10);
    wrap.appendChild(libSec('Limpieza'));
    wrap.appendChild(el('div', { class: 'lib-clean' }, [
      el('button', { type: 'button', class: 'lib-cl', onclick: () => { state.filesTab = 'cleanup'; render(); } }, [
        el('span', { class: 'lib-cl-ico', html: LIB_ICN.copy }),
        el('span', {}, [ el('strong', {}, 'Duplicados'), el('span', {}, dupN ? [ dupN + (dupN === 1 ? ' copia · ' : ' copias · '), el('em', {}, formatBytes(dupBytes)) ] : 'Sin archivos repetidos') ])
      ]),
      el('button', { type: 'button', class: 'lib-cl', onclick: () => { state.filesTab = 'cleanup'; render(); } }, [
        el('span', { class: 'lib-cl-ico', html: LIB_ICN.big }),
        el('span', {}, [ el('strong', {}, 'Archivos grandes'), el('span', {}, big.length ? 'Los ' + big.length + ' que más ocupan · ' + formatBytes(big.reduce((n, f) => n + (f.size || 0), 0)) : 'Nada por aquí') ])
      ])
    ]));
    return wrap;
  }
  // Limpieza: copias repetidas (se conserva la más antigua) y los más grandes.
  function cleanupView(files, onDelete) {
    const wrap = el('div', { class: 'lib' });
    const dups = findDuplicates(files);
    wrap.appendChild(libSec('Duplicados'));
    if (!dups.length) wrap.appendChild(el('p', { class: 'lib-empty' }, 'No hay archivos repetidos. ✨'));
    dups.forEach(g => {
      const copies = g.slice(1);
      wrap.appendChild(el('div', { class: 'lib-dup' }, [
        el('div', { class: 'lib-dup-h' }, [
          el('strong', { title: g[0].title }, libKind(g[0]) === 'audio' ? songTitle(g[0]) : g[0].title),
          el('span', {}, g.length + ' iguales · ' + formatBytes((g[0].size || 0) * copies.length) + ' en copias'),
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => onDelete(copies) }, copies.length === 1 ? 'Borrar la copia' : 'Borrar ' + copies.length + ' copias')
        ]),
        el('div', { class: 'lib-rows' }, g.map((f, i) => libRow(f, i === 0 ? 'Original · ' + formatDate(libDate(f)) : 'Copia · ' + formatDate(libDate(f)), i === 0 ? null : () => onDelete([f]))))
      ]));
    });
    const big = files.slice().sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 10);
    wrap.appendChild(libSec('Archivos grandes'));
    wrap.appendChild(el('div', { class: 'lib-rows' }, big.map(f => libRow(f, formatBytes(f.size || 0), () => onDelete([f])))));
    return wrap;
  }
  function libRow(f, sub, onDel) {
    const url = libThumb(f);
    const th = el('span', { class: 'lib-row-th', style: { background: libGrad(f.id) } });
    if (url) { const im = el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }); im.addEventListener('error', () => im.remove()); th.appendChild(im); }
    else th.appendChild(el('span', { class: 'lib-row-ico', html: KIND_ICON_LIB(libKind(f) === 'audio' ? 'audio' : libKind(f) === 'video' ? 'video' : libKind(f) === 'image' ? 'image' : 'doc') }));
    return el('div', { class: 'lib-row' }, [
      th,
      el('span', { class: 'lib-row-t' }, [ el('strong', { title: f.title }, libKind(f) === 'audio' ? songTitle(f) : f.title), el('span', {}, sub) ]),
      onDel ? el('button', { type: 'button', class: 'icon-btn lib-row-del', 'aria-label': 'Eliminar ' + f.title, title: 'Eliminar', html: LIB_ICN.trash, onclick: onDel }) : el('span')
    ]);
  }

  // Miniatura de la tarjeta de proyecto: el icono que eligió el usuario sobre su
  // color o, si está en «Auto», mosaico de portadas o icono de su categoría.
  function projectThumb(p) {
    const chosen = projectIcon(p);
    if (chosen) {
      const box = el('span', { class: 'pc-thumb', 'aria-hidden': 'true', style: { background: safeColor(p.color) } });
      box.appendChild(el('span', { class: 'pc-thumb-ico', html: chosen.svg }));
      return box;
    }
    const items = projectItems(p);
    const thumbs = items.map(libThumb).filter(Boolean).slice(0, 4);
    const cat = CAT[projectCategory(items)] || null;
    const box = el('span', { class: 'pc-thumb' + (thumbs.length >= 4 ? ' is-grid' : ''), 'aria-hidden': 'true', style: { background: thumbs.length ? libGrad(p.id) : safeColor(p.color) } });
    if (thumbs.length >= 4) thumbs.forEach(u => { const i = el('img', { src: u, alt: '', loading: 'lazy', decoding: 'async' }); i.addEventListener('error', () => { i.style.visibility = 'hidden'; }); box.appendChild(i); });
    else if (thumbs.length) { const i = el('img', { src: thumbs[0], alt: '', loading: 'lazy', decoding: 'async' }); i.addEventListener('error', () => i.remove()); box.appendChild(i); }
    else box.appendChild(el('span', { class: 'pc-thumb-ico', html: cat ? cat.icon : KIND_ICON_LIB('mixed') }));
    return box;
  }

  window.musicLibrary = musicLibrary;
  window.photoLibrary = photoLibrary;
  window.projectCategory = projectCategory;

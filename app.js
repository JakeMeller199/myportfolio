(() => {
  const data = window.PORTFOLIO_CONTENT;
  const sorted = () => [...data.projects].sort((a, b) => a.rank - b.rank);
  const tagLabel = { motion: 'Motion', live: 'Live Visuals', games: 'Games', trailers: 'Trailers' };
  const slug = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const title = v => String(v || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const publicPath = v => { const path = String(v || '').trim().replace(/\\/g, '/'); if (!path) return ''; const clean = /^[a-z]:\//i.test(path) ? `content/${path.split('/').pop()}` : path.replace(/^\.\//, ''); return !clean.includes('/') && /\.(avif|gif|jpe?g|png|webp|mp4|mov|webm)$/i.test(clean) ? `content/${clean}` : clean; };
  const youtubeId = v => { try { const u = new URL(v); if (u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] || ''; if (u.hostname.includes('youtube.com')) return u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] || ''; } catch {} return ''; };

  /* ---------- normalise content ---------- */
  data.artist.socials = (data.artist.socials || []).filter(s => s.label?.toLowerCase() !== 'vimeo');
  data.collections = (data.collections || []).map((c, i) => ({ id: slug(c.id || c.title), title: c.title || title(c.id), description: c.description || '', rank: Number(c.rank) || i + 1 })).sort((a, b) => a.rank - b.rank);
  data.layout = { cardWidth: Math.min(900, Math.max(160, Math.round(Number(data.layout?.cardWidth)) || 360)) };
  const setBase = () => { const phone = innerWidth <= 700, root = document.documentElement.style; root.setProperty('--card-base', (phone ? Math.floor((innerWidth * .9 - 13) / 2) : data.layout.cardWidth) + 'px'); root.setProperty('--grid-gap', phone ? '13px' : '18px'); };
  setBase(); addEventListener('resize', setBase);
  data.projects.forEach(p => {
    p.scale = Math.min(300, Math.max(20, Math.round(Number(p.scale)) || 100));
    p.resolution = /^\d+x\d+$/i.test(p.resolution || '') ? p.resolution.toLowerCase() : 'auto';
    p.fit = ['scale', 'fill', 'stretch'].includes(p.fit) ? p.fit : 'fill';
    p.media = publicPath(p.media); p.videoUrl = publicPath(p.videoUrl);
    p.thumbMode = ['auto', 'custom', 'none'].includes(p.thumbMode) ? p.thumbMode : 'auto'; p.thumb = publicPath(p.thumb || '');
    p.extra = (p.extra || []).filter(x => x && x.src).map(x => ({ kind: x.kind === 'video' ? 'video' : 'image', src: publicPath(x.src), poster: publicPath(x.poster || '') }));
    p.credits = String(p.credits || '').trim();
    p.tags = [...new Set((p.tags || []).map(slug).filter(Boolean))];
    p.collectionIds = [...new Set((p.collectionIds || (p.collection ? [p.collection] : [])).map(slug).filter(Boolean))];
  });
  /* favourites: the homepage shows exactly the posts flagged `featured` (max 4). Older data without any flags defaults to the first 4 by rank. */
  const ranked = [...data.projects].sort((a, b) => a.rank - b.rank);
  if (!data.projects.some(p => typeof p.featured === 'boolean')) ranked.slice(0, 6).forEach(p => { p.featured = true; });
  let favCount = 0; ranked.forEach(p => { p.featured = p.featured === true && favCount < 6; if (p.featured) favCount++; });
  const collection = id => data.collections.find(c => c.id === id) || { id, title: title(id) };

  /* ---------- slides: main media first, then the carousel extras ---------- */
  function slidesOf(p) {
    const s = [];
    if (p.type === 'video' && p.videoUrl) s.push({ kind: 'video', src: p.videoUrl, poster: p.media });
    else if (p.media) s.push({ kind: 'image', src: p.media });
    p.extra.forEach(x => s.push(x));
    return s.length ? s : [{ kind: 'empty' }];
  }

  /* ---------- cards ---------- */
  const preview = p => p.media || '';
  const frameOf = p => { const m = /^(\d+)x(\d+)$/.exec(p.resolution || ''); return m ? `${m[1]} / ${m[2]}` : ''; };
  const fail = "this.style.display='none';this.nextElementSibling.hidden=false";
  /* YouTube: try the true 16:9 thumbnail first; if it does not exist YouTube serves a 120px grey stub, so fall back to hqdefault and crop its baked-in black bars. */
  window.__ytFix = (img, id, errored) => { if (img.dataset.fb) { if (errored) { img.style.display = 'none'; if (img.nextElementSibling) img.nextElementSibling.hidden = false; } return; } if (errored || img.naturalWidth <= 120) { img.dataset.fb = 1; img.classList.add('yt-bars'); img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; } };
  const empty = (p, label, hidden) => `<div class="project-empty"${hidden ? ' hidden' : ''}><span>${label}</span><b>${p.title}</b></div>`;
  function art(p) {
    const yt = youtubeId(p.videoUrl);
    if (p.thumbMode === 'none') return empty(p, p.type === 'video' ? 'VIDEO' : 'IMAGE'); /* title card only */
    if (p.thumbMode === 'custom' && p.thumb) return `<img class="project-image" src="${p.thumb}" alt="${p.title} thumbnail" loading="lazy" onerror="${fail}">${empty(p, 'MEDIA', 1)}`;
    if (p.media) return `<img class="project-image" src="${p.media}" alt="${p.title} project artwork" loading="lazy" onerror="${fail}">${empty(p, 'MEDIA', 1)}`;
    if (yt) return `<img class="project-image yt" src="https://i.ytimg.com/vi/${yt}/maxresdefault.jpg" alt="${p.title} project artwork" loading="lazy" onload="__ytFix(this,'${yt}')" onerror="__ytFix(this,'${yt}',1)">${empty(p, 'MEDIA', 1)}`;
    if (p.type === 'video' && p.videoUrl) return `<video class="project-image" src="${p.videoUrl}#t=0.1" muted playsinline preload="metadata" onloadedmetadata="if(this.currentTime<.1)this.currentTime=.1" onerror="${fail}"></video>${empty(p, 'VIDEO', 1)}`;
    return empty(p, p.type === 'video' ? 'VIDEO' : 'IMAGE');
  }
  function card(p) {
    const f = frameOf(p), frame = ` ${f ? 'data-frame ' : ''}style="--scale:${p.scale / 100}${f ? `;--frame-ratio:${f}` : ''};width:min(100%,calc(var(--card-base,360px) * ${p.scale / 100}));flex:0 0 auto;grid-column:auto;margin-top:0"`, count = slidesOf(p).length;
    return `<article class="project-card" data-fit="${p.fit}"${frame} data-id="${p.id}" tabindex="0" role="button"><div class="project-media">${art(p)}${p.type === 'video' ? '<span class="project-play">▶ PLAY</span>' : ''}${count > 1 ? `<span class="project-count" title="${count} items">▣ ${count}</span>` : ''}</div><div class="project-meta"><strong>${p.title}</strong><span>${p.year}</span></div></article>`;
  }

  /* ---------- modal with carousel + project-to-project navigation ---------- */
  const nav = { list: [], pi: 0, si: 0 };
  let touchX = null;
  function modal() {
    if (document.querySelector('.modal')) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal" aria-hidden="true"><button class="modal-close" aria-label="Close project">×</button><button class="modal-nav prev" aria-label="Previous" hidden>‹</button><button class="modal-nav next" aria-label="Next" hidden>›</button><div class="modal-inner"></div></div>');
    const el = document.querySelector('.modal');
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('.modal-close')) return close();
      if (e.target.closest('.modal-nav.prev')) return step(-1);
      if (e.target.closest('.modal-nav.next')) return step(1);
      const dot = e.target.closest('[data-slide]'); if (dot) show(nav.pi, Number(dot.dataset.slide));
    });
    el.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null; if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1); });
    document.addEventListener('keydown', e => {
      if (!el.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); step(e.key === 'ArrowRight' ? 1 : -1); }
    }, true);
  }
  function stageHTML(p, s) {
    const f = frameOf(p), m = /^(\d+) \/ (\d+)$/.exec(f), framed = !!m;
    const style = framed ? ` style="aspect-ratio:${f};width:min(100%,calc(78vh * ${(m[1] / m[2]).toFixed(4)}));--fit:${{ scale: 'contain', fill: 'cover', stretch: 'fill' }[p.fit]}"` : '';
    let inner;
    if (s.kind === 'video') {
      const id = youtubeId(s.src);
      if (id) inner = `<iframe class="modal-embed modal-video" src="https://www.youtube-nocookie.com/embed/${id}?rel=0" title="${p.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      else { const mime = /\.webm$/i.test(s.src) ? 'video/webm' : 'video/mp4'; inner = `<video class="modal-file" controls playsinline preload="metadata"${s.poster ? ` poster="${s.poster}"` : ''}><source src="${s.src}#t=0.01" type="${mime}">This file cannot play in this browser. Export a web-friendly H.264 + AAC MP4.</video>`; }
    } else if (s.kind === 'image') inner = `<img class="modal-image" src="${s.src}" alt="${p.title}">`;
    else inner = `<div class="project-empty"><span>MEDIA</span><b>${p.title}</b></div>`;
    return `<div class="modal-stage${framed ? ' framed' : ''}"${style}>${inner}</div>`;
  }
  function show(pi, si) {
    modal(); nav.pi = pi; nav.si = si;
    const el = document.querySelector('.modal'), p = nav.list[pi], slides = slidesOf(p), s = slides[si];
    const dots = slides.length > 1 ? `<div class="modal-dots">${slides.map((_, i) => `<button data-slide="${i}" class="${i === si ? 'on' : ''}" aria-label="Item ${i + 1}"></button>`).join('')}<span>${si + 1} / ${slides.length}</span></div>` : '';
    el.querySelector('.modal-inner').innerHTML = `<div class="modal-media">${stageHTML(p, s)}${dots}</div><div><span class="eyebrow">${p.year} / ${p.type}</span><h2>${p.title}</h2><div class="tags">${p.tags.map(t => `<span class="tag">${tagLabel[t] || title(t)}</span>`).join('')}${p.collectionIds.map(id => `<span class="tag collection-tag">${collection(id).title}</span>`).join('')}</div>${p.description ? `<p>${p.description}</p>` : ''}${p.credits ? `<p><b>CREDITS</b><br>${p.credits}</p>` : ''}</div>`;
    const multi = nav.list.length > 1 || slides.length > 1;
    el.querySelectorAll('.modal-nav').forEach(b => { b.hidden = !multi; });
    el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; el.scrollTop = 0;
    const v = el.querySelector('video.modal-file');
    if (v) {
      const note = t => { if (!v.parentNode.querySelector('.audio-note')) v.insertAdjacentHTML('afterend', `<p class="audio-note">${t}</p>`); };
      v.querySelector('source').addEventListener('error', () => note('This video file could not be decoded by the browser. Re-export it as an H.264 + AAC .mp4 and point the project at the new file.'));
      v.play().catch(() => {});
      setTimeout(() => { const silent = v.webkitAudioDecodedByteCount === 0 || v.mozHasAudio === false; if (v.isConnected && v.readyState >= 3 && v.currentTime > .8 && !v.paused && !v.muted && silent) note('No playable audio track was found in this file. If it should have sound, re-export it as an H.264 + AAC .mp4.'); }, 2200);
    }
  }
  /* one step = next carousel item, or the first item of the next project; wraps around the whole list */
  function step(dir) {
    const n = nav.list.length, count = pi => slidesOf(nav.list[pi]).length;
    let pi = nav.pi, si = nav.si + dir;
    if (si >= count(pi)) { pi = (pi + 1) % n; si = 0; }
    else if (si < 0) { pi = (pi - 1 + n) % n; si = count(pi) - 1; }
    show(pi, si);
  }
  function open(p, list) { nav.list = list && list.length ? list : [p]; show(Math.max(0, nav.list.indexOf(p)), 0); }
  function close() { const el = document.querySelector('.modal'); if (el) { el.querySelectorAll('video').forEach(v => v.pause()); el.querySelector('.modal-inner').innerHTML = ''; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; } }
  function attach(grid, getList) {
    const launch = e => { const c = e.target.closest('.project-card'); if (c) open(data.projects.find(p => p.id === c.dataset.id), getList()); };
    grid.addEventListener('click', launch);
    grid.addEventListener('keydown', e => { if (e.key === 'Enter') launch(e); });
  }

  /* ---------- page wiring ---------- */
  document.querySelectorAll('[data-artist]').forEach(el => el.textContent = data.artist.name);
  document.querySelectorAll('[data-email]').forEach(el => { el.textContent = data.artist.email; el.href = 'mailto:' + data.artist.email; });
  document.querySelectorAll('[data-mailto]').forEach(el => { el.href = 'mailto:' + data.artist.email; }); /* keeps the button's own wording */
  const flexGrid = g => g && Object.assign(g.style, { display: 'flex', flexWrap: 'wrap', gap: 'var(--grid-gap,18px)', alignItems: 'flex-start', justifyContent: 'flex-start' });
  const featured = document.querySelector('[data-featured]'); flexGrid(featured);
  if (featured) { featured.innerHTML = sorted().filter(p => p.featured).map(card).join(''); attach(featured, sorted); }

  const gallery = document.querySelector('[data-gallery]'), filterBar = document.querySelector('[data-filters]');
  flexGrid(gallery);
  if (gallery) {
    let col = 'all', tag = '', visible = sorted(); /* collection + tag are independent, so switching a tag keeps you inside the collection */
    const tags = [...new Set(data.projects.flatMap(p => p.tags))].sort();
    const used = new Set(data.projects.flatMap(p => p.collectionIds));
    const collections = [...data.collections.map(c => c.id).filter(id => used.has(id)), ...[...used].filter(id => !data.collections.some(c => c.id === id))];
    if (filterBar) {
      filterBar.innerHTML = `<button class="filter active" data-filter="all">Everything</button>`
        + ((collections.length || data.projects.some(p => p.featured)) ? `<span class="filter-divider">Collections</span>${data.projects.some(p => p.featured) ? '<button class="filter collection-filter" data-filter="collection:__showcase">Showcase</button>' : ''}${collections.map(id => `<button class="filter collection-filter" data-filter="collection:${id}">${collection(id).title}</button>`).join('')}` : '')
        + (tags.length ? `<span class="filter-divider">Filter</span><select class="filter-select" data-tag-select aria-label="Filter by tag"><option value="">All tags</option>${tags.map(t => `<option value="tag:${t}">${tagLabel[t] || title(t)}</option>`).join('')}</select>` : '');
      const select = filterBar.querySelector('[data-tag-select]');
      const refresh = () => {
        filterBar.querySelectorAll('button[data-filter]').forEach(x => { const v = x.dataset.filter; x.classList.toggle('active', v === 'all' ? col === 'all' && !tag : v === `collection:${col}`); });
        if (select) { select.value = tag ? `tag:${tag}` : ''; select.classList.toggle('active', !!tag); }
        render();
      };
      filterBar.addEventListener('click', e => {
        const b = e.target.closest('button[data-filter]'); if (!b) return;
        const v = b.dataset.filter;
        if (v === 'all') { col = 'all'; tag = ''; } else { const id = v.slice('collection:'.length); col = col === id ? 'all' : id; } /* clicking the active collection again leaves it */
        refresh();
      });
      if (select) select.addEventListener('change', () => { tag = select.value.replace(/^tag:/, ''); refresh(); });
    }
    const render = () => {
      const y = scrollY, h = gallery.offsetHeight;
      visible = sorted().filter(p => (col === 'all' || (col === '__showcase' ? p.featured : p.collectionIds.includes(col))) && (!tag || p.tags.includes(tag)));
      gallery.style.minHeight = h + 'px'; /* hold the page height while images reload so the scroll position stays put */
      gallery.innerHTML = visible.length ? visible.map(card).join('') : '<p class="empty-note">Nothing matches this collection and filter yet.</p>';
      scrollTo(0, y); setTimeout(() => { gallery.style.minHeight = ''; }, 700);
    };
    render(); attach(gallery, () => visible);
  }

  /* ---------- hero carousel: every image and video in the portfolio, no item limit, loops forever ---------- */
  function heroMedia() {
    const out = [], seen = new Set();
    const add = (kind, src) => { if (src && !seen.has(src)) { seen.add(src); out.push({ kind, src }); } };
    const isFile = u => u && !youtubeId(u) && !/^https?:\/\/(www\.)?(youtu|vimeo)/i.test(u);
    const yt = u => { const id = youtubeId(u); return id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : ''; };
    sorted().forEach(p => {
      if (p.thumbMode === 'none') return; /* projects set to "no thumbnail" stay out of the hero too */
      if (p.type === 'video' && isFile(p.videoUrl)) add('video', p.videoUrl);
      else if (p.thumbMode === 'custom' && p.thumb) add('image', p.thumb);
      else if (p.media) add('image', p.media);
      else add('image', yt(p.videoUrl));
    });
    return out;
  }
  function heroCarousel(heroEl) {
    const list = heroMedia(); if (!list.length) return;
    const PERIOD = 3600, LEAVE = 1400; /* ms each item is on screen before the next one starts fading in / how long the old one takes to leave */
    const box = document.createElement('div'); box.className = 'hero-carousel'; box.setAttribute('aria-hidden', 'true');
    box.style.setProperty('--hc-life', (PERIOD + LEAVE + 400) / 1000 + 's');
    const bad = new Set(), sleep = ms => new Promise(r => setTimeout(r, ms));
    /* Slides are created on demand (current + next only) and resolve once their first frame is ready, so nothing fades in half-loaded and there is no cap on how many items the portfolio can hold. */
    const make = m => new Promise(resolve => {
      const slide = document.createElement('div'), el = document.createElement(m.kind === 'video' ? 'video' : 'img');
      slide.className = 'hc-slide'; el.className = 'hc-media'; slide.append(el);
      let done = false, timer;
      const finish = ok => { if (done) return; done = true; clearTimeout(timer); if (ok) resolve(slide); else { slide.remove(); resolve(null); } };
      timer = setTimeout(() => finish(false), 9000);
      if (m.kind === 'video') { el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'auto'; el.setAttribute('muted', ''); el.addEventListener('loadeddata', () => finish(true)); }
      else { el.alt = ''; el.decoding = 'async'; el.addEventListener('load', () => finish(!(/ytimg\.com/.test(m.src) && el.naturalWidth <= 120))); }
      el.addEventListener('error', () => finish(false));
      box.append(slide); el.src = m.src;
    });
    const prepare = async from => { for (let k = 0; k < list.length; k++) { const i = (from + k) % list.length; if (bad.has(i)) continue; const slide = await make(list[i]); if (slide) return { i, slide }; bad.add(i); } return null; };
    const show = slide => { slide.classList.add('live'); void slide.offsetWidth; slide.classList.add('in'); const v = slide.querySelector('video'); if (v) { v.currentTime = 0; v.play().catch(() => {}); } };
    const leave = slide => { slide.classList.remove('in'); setTimeout(() => { const v = slide.querySelector('video'); if (v) v.pause(); slide.remove(); }, LEAVE); };
    (async () => {
      heroEl.prepend(box);
      let cur = await prepare(0); if (!cur) { box.remove(); return; }
      for (;;) {
        show(cur.slide);
        const upcoming = prepare((cur.i + 1) % list.length); /* the next item loads while this one plays */
        await sleep(PERIOD);
        while (document.hidden) await new Promise(r => addEventListener('visibilitychange', r, { once: true }));
        const next = await upcoming; if (!next) return;
        leave(cur.slide); cur = next;
      }
    })();
  }
  const heroForCarousel = document.querySelector('.hero'); if (heroForCarousel) heroCarousel(heroForCarousel);

  const social = document.querySelector('[data-socials]'); if (social) social.innerHTML = data.artist.socials.map(s => `<a href="${s.url}" target="_blank" rel="noreferrer">${s.label} ↗</a>`).join('');
  const hero = document.querySelector('.hero');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { const ink = document.createElement('div'); ink.className = 'mouse-ink'; document.body.prepend(ink); const targets = [...document.querySelectorAll('h1,h2,p,.eyebrow,.button,.project-card,.portrait,.filter')]; targets.forEach((el, i) => { el.classList.add('parallax-target'); el.dataset.depth = String((i % 5 + 1) * .55); }); let raf; addEventListener('pointermove', e => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const x = (e.clientX / innerWidth) - .5, y = (e.clientY / innerHeight) - .5; document.body.style.setProperty('--ink-x', `${x * -42}px`); document.body.style.setProperty('--ink-y', `${y * -42}px`); ink.style.transform = `translate3d(${e.clientX - innerWidth * .37}px,${e.clientY - innerHeight * .37}px,0)`; if (hero) { hero.style.setProperty('--px', x * 34); hero.style.setProperty('--py', y * 34); } targets.forEach(el => { const d = Number(el.dataset.depth); el.style.translate = `${x * d * 13}px ${y * d * 13}px`; }); }); }, { passive: true }); }
})();

/* Content editor. Loaded by editor.html. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const slug = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const title = v => String(v || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const publicPath = v => {
    const path = String(v || '').trim().replace(/\\/g, '/');
    if (!path) return '';
    const clean = /^[a-z]:\//i.test(path) ? `content/${path.split('/').pop()}` : path.replace(/^\.\//, '');
    return !clean.includes('/') && /\.(avif|gif|jpe?g|png|webp|mp4|mov|webm)$/i.test(clean) ? `content/${clean}` : clean;
  };
  const youtubeId = v => {
    try {
      const u = new URL(v);
      if (u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] || '';
      if (u.hostname.includes('youtube.com')) return u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] || '';
    } catch {}
    return '';
  };

  /* ---------- constants ---------- */
  const MAX_FAV = 6; /* the homepage "Selected Work" holds exactly this many favourites */
  const PRESETS = [
    ['1920x1080', '1920 × 1080 — Full HD 16:9'],
    ['1280x720', '1280 × 720 — HD 16:9'],
    ['3840x2160', '3840 × 2160 — 4K 16:9'],
    ['1080x1920', '1080 × 1920 — Vertical 9:16'],
    ['1080x1080', '1080 × 1080 — Square 1:1'],
    ['1080x1350', '1080 × 1350 — Portrait 4:5'],
    ['1440x1080', '1440 × 1080 — Classic 4:3']
  ];
  const FIT_CSS = { scale: 'contain', fill: 'cover', stretch: 'fill' };
  const parseRes = v => { const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i.exec(String(v || '').trim()); return m ? [+m[1], +m[2]] : null; };
  const cleanRes = v => { const r = parseRes(v); return r ? `${r[0]}x${r[1]}` : 'auto'; };
  const cleanFit = v => (FIT_CSS[v] ? v : 'fill');
  const clampScale = v => Math.min(300, Math.max(20, Math.round(Number(v)) || 100));
  const clampBase = v => Math.min(900, Math.max(160, Math.round(Number(v)) || 360));

  /* ---------- state ---------- */
  let uidCounter = 0;
  const normExtra = x => ({ kind: x?.kind === 'video' ? 'video' : 'image', src: publicPath(x?.src || ''), poster: publicPath(x?.poster || '') });
  /* favourites default to the first 4 by rank when the data has no flags yet; never more than 4 */
  const applyFeatured = projects => {
    const ranked = [...projects].sort((a, b) => a.rank - b.rank);
    if (!projects.some(p => typeof p.featured === 'boolean')) ranked.slice(0, MAX_FAV).forEach(p => { p.featured = true; });
    let n = 0; ranked.forEach(p => { p.featured = p.featured === true && n < MAX_FAV; if (p.featured) n++; });
    /* homepage order of the favourites: their own ranking (favRank), kept 1..n; a newly favourited post goes last */
    projects.filter(p => p.featured).sort((a, b) => (a.favRank ?? 1000 + a.rank) - (b.favRank ?? 1000 + b.rank)).forEach((p, i) => { p.favRank = i + 1; });
    projects.filter(p => !p.featured).forEach(p => { delete p.favRank; });
    return projects;
  };
  const normalize = data => ({
    layout: { cardWidth: clampBase(data.layout?.cardWidth), sortMode: data.layout?.sortMode === 'manual' ? 'manual' : 'collections' },
    artist: { ...(data.artist || {}), socials: (data.artist?.socials || []).filter(s => s.label?.toLowerCase() !== 'vimeo') },
    collections: (data.collections || []).map((c, i) => ({ id: slug(c.id || c.title), title: c.title || title(c.id), description: c.description || '', rank: Number(c.rank) || i + 1 })).sort((a, b) => a.rank - b.rank),
    projects: applyFeatured((data.projects || []).map((p, i) => {
      const { ratio, frameRatio, ...rest } = p; // old "display ratio" fields are retired
      return {
        ...rest,
        uid: ++uidCounter,
        id: slug(p.id) || `project-${i + 1}`,
        rank: Number(p.rank) || i + 1,
        type: p.type === 'video' || (p.videoUrl && !p.media) ? 'video' : 'image',
        resolution: cleanRes(p.resolution),
        fit: cleanFit(p.fit),
        scale: clampScale(p.scale),
        thumbMode: ['auto', 'custom', 'none'].includes(p.thumbMode) ? p.thumbMode : 'auto',
        thumb: publicPath(p.thumb || ''),
        media: publicPath(p.media || ''),
        videoUrl: publicPath(p.videoUrl || ''),
        extra: (p.extra || []).map(normExtra),
        tags: [...new Set((p.tags || []).map(slug).filter(Boolean))],
        collectionIds: [...new Set((p.collectionIds || (p.collection ? [p.collection] : [])).map(slug).filter(Boolean))],
        featured: typeof p.featured === 'boolean' ? p.featured : undefined,
        favRank: Number(p.favRank) || undefined
      };
    }))
  });
  let state = normalize(structuredClone(window.PORTFOLIO_CONTENT || { artist: {}, projects: [] }));
  const original = structuredClone(state);
  const previews = new Map();    // "uid:key" -> blob URL for freshly picked files
  const customMode = new Set();  // uids whose resolution dropdown is on "Custom…"
  const open = new Set();        // uids whose card is expanded
  const pinned = new Set();      // uids kept visible while a filter is active (so an edit never makes a card vanish under you)
  const panelsOpen = new Set();  // settings panels left open
  let view = 'all', query = '', pickTarget = null, screen = 'list', zoom = 60, dragUid = null, dragCid = null;

  const byUid = uid => state.projects.find(p => p.uid === Number(uid));
  const renumber = () => state.projects.sort((a, b) => a.rank - b.rank).forEach((p, i) => { p.rank = i + 1; });
  const renumberCollections = () => state.collections.forEach((c, i) => { c.rank = i + 1; });
  const uniqueId = base => { const root = slug(base) || 'new-work'; let id = root, n = 2; while (state.projects.some(p => p.id === id)) id = `${root}-${n++}`; return id; };
  const isCustomRes = p => customMode.has(p.uid) || (p.resolution !== 'auto' && !PRESETS.some(([v]) => v === p.resolution));
  const status = text => { const el = $('#status'); if (el) el.textContent = text; };
  const allTags = () => [...new Set(state.projects.flatMap(p => p.tags))].sort();
  const favCount = () => state.projects.filter(p => p.featured).length;
  const collTitle = id => state.collections.find(c => c.id === id)?.title || title(id);

  /* ---------- names: sequential numbering for duplicates ---------- */
  const nameTaken = (name, exceptUid) => state.projects.some(x => x.uid !== exceptUid && String(x.title).trim().toLowerCase() === name.trim().toLowerCase());
  /* "Bloodlines" -> "Bloodlines 1", "Bloodlines 3" -> "Bloodlines 4"; keeps counting until the name is unused. No "(copy)" text. */
  const nextName = name => {
    const clean = String(name || '').trim(), m = /^(.*?)(\d+)$/.exec(clean);
    const base = m ? m[1] : clean + ' ', width = m ? m[2].length : 0;
    let n = m ? parseInt(m[2], 10) + 1 : 1, candidate;
    do { candidate = base + String(n).padStart(width, '0'); n++; } while (nameTaken(candidate));
    return candidate;
  };
  const uniqueName = name => (nameTaken(name) ? nextName(name) : name);

  /* ---------- filtering ---------- */
  const matchView = p => view === 'all' || (view === 'fav' && p.featured) || (view === 'none' && !p.collectionIds.length) || (view.startsWith('c:') && p.collectionIds.includes(view.slice(2)));
  const matchQuery = p => !query || [p.title, p.id, p.year, ...p.tags, ...p.collectionIds.map(collTitle)].join(' ').toLowerCase().includes(query.toLowerCase());
  const favKey = p => p.favRank ?? 1000 + p.rank;
  const visibleProjects = () => [...state.projects].sort((a, b) => (view === 'fav' ? favKey(a) - favKey(b) : 0) || a.rank - b.rank).filter(p => pinned.has(p.uid) || (matchView(p) && matchQuery(p)));

  /* ---------- markup ---------- */
  const cell = (cls, label, inner) => `<div class="cell ${cls}"><span class="lbl">${label}</span>${inner}</div>`;
  const input = (key, value, type = 'text', extra = '') => `<input type="${type}" data-key="${key}" value="${esc(value)}" ${extra}>`;
  const area = (key, value) => `<textarea data-key="${key}">${esc(value)}</textarea>`;
  const scaleHint = p => `≈ ${Math.round(state.layout.cardWidth * p.scale / 100)} px wide on the Work page`;

  function previewHTML(p, mini) {
    const res = parseRes(p.resolution);
    const style = res && !mini ? ` style="aspect-ratio:${res[0]} / ${res[1]};object-fit:${FIT_CSS[p.fit]};background:#000"` : '';
    if (p.thumbMode === 'none') return '<div class="no-preview">Title card only</div>';
    const thumbSrc = previews.get(`${p.uid}:thumb`) || p.thumb;
    if (p.thumbMode === 'custom' && thumbSrc) return `<img src="${esc(thumbSrc)}" alt="Custom thumbnail" loading="lazy"${style}>`;
    const poster = previews.get(`${p.uid}:media`) || p.media;
    const video = previews.get(`${p.uid}:videoUrl`) || p.videoUrl;
    const yt = youtubeId(video);
    if (poster) return `<img src="${esc(poster)}" alt="Preview" loading="lazy"${style}>`;
    if (p.type === 'video' && yt) return `<img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt="YouTube preview" loading="lazy"${style}>`;
    if (p.type === 'video' && video && !mini) return `<video src="${esc(video)}#t=0.1" muted controls preload="metadata"${style}></video>`;
    return '<div class="no-preview">No preview yet</div>';
  }

  function extraRow(x, i) {
    return `<div class="extra-row" data-i="${i}">
      <select data-extra-kind><option value="image" ${x.kind === 'image' ? 'selected' : ''}>Image</option><option value="video" ${x.kind === 'video' ? 'selected' : ''}>Video</option></select>
      <input data-extra-src value="${esc(x.src)}" placeholder="${x.kind === 'video' ? 'YouTube URL or content/my-video.mp4' : 'content/my-image.webp'}">
      <button class="ghost" data-pick-extra>Choose</button><button class="ghost" data-extra-move="up">↑</button><button class="ghost" data-extra-move="down">↓</button><button class="danger" data-extra-remove title="Remove this item">×</button>
      ${x.kind === 'video' ? `<input class="poster" data-extra-poster value="${esc(x.poster)}" placeholder="Thumbnail for this video (optional)">` : ''}</div>`;
  }

  function bodyHTML(p) {
    const custom = isCustomRes(p), res = parseRes(p.resolution) || [1920, 1080], hasRes = p.resolution !== 'auto' || custom;
    const resOptions = `<option value="auto" ${p.resolution === 'auto' && !custom ? 'selected' : ''}>Auto — match the media</option>`
      + PRESETS.map(([v, label]) => `<option value="${v}" ${p.resolution === v && !custom ? 'selected' : ''}>${label}</option>`).join('')
      + `<option value="custom" ${custom ? 'selected' : ''}>Custom…</option>`;
    return `<div class="pbody"><div class="pgrid">
      ${cell('c3', 'Title', `${input('title', p.title)}<small class="dup-hint" hidden>Another post already uses this name</small>`)}
      ${cell('c3', 'Project ID', input('id', p.id))}${cell('c2', 'Year', input('year', p.year || ''))}${cell('c1', 'Rank', input('rank', p.rank, 'number'))}${cell('c3', 'Accent', input('accent', p.accent || 'red'))}
      ${cell('c2', 'Media kind', `<select data-key="type"><option value="image" ${p.type === 'image' ? 'selected' : ''}>Image</option><option value="video" ${p.type === 'video' ? 'selected' : ''}>Video</option></select>`)}
      ${cell('c5', 'Image / poster', `<div class="media-row"><input data-key="media" value="${esc(p.media)}" placeholder="content/my-poster.webp"><button class="ghost" data-pick="media">Choose</button></div>`)}
      ${cell('c5', 'Video URL / file', `<div class="media-row"><input data-key="videoUrl" value="${esc(p.videoUrl)}" placeholder="YouTube URL or content/my-video.mp4"><button class="ghost" data-pick="videoUrl">Choose</button></div>`)}
      ${cell('c4', 'Card thumbnail', `<select data-key="thumbMode"><option value="auto" ${p.thumbMode === 'auto' ? 'selected' : ''}>Auto — poster / YouTube / first frame</option><option value="custom" ${p.thumbMode === 'custom' ? 'selected' : ''}>Custom image</option><option value="none" ${p.thumbMode === 'none' ? 'selected' : ''}>None — title card only</option></select>
        <div class="media-row" ${p.thumbMode === 'custom' ? '' : 'hidden'}><input data-key="thumb" value="${esc(p.thumb)}" placeholder="content/my-thumbnail.webp"><button class="ghost" data-pick="thumb">Choose</button></div>`)}
      ${cell('c4', 'Resolution', `<div class="media-row"><select data-resolution>${resOptions}</select><button class="ghost" data-flip title="Swap width and height (landscape ⇄ vertical)" ${hasRes ? '' : 'disabled'}>⇄ Flip</button></div>
        <div class="custom-res" ${custom ? '' : 'hidden'}><input type="number" min="16" max="20000" data-res-w value="${res[0]}" aria-label="Width in pixels"><b>×</b><input type="number" min="16" max="20000" data-res-h value="${res[1]}" aria-label="Height in pixels"><em>px</em></div>`)}
      ${cell('c4', 'Size in the Work grid', `<div class="scale-row"><input type="number" min="20" max="300" step="5" data-key="scale" value="${p.scale}"><em>%</em>${[50, 75, 100, 150, 200].map(n => `<button class="ghost" data-scale-preset="${n}">${n}</button>`).join('')}</div><small data-scale-hint>${scaleHint(p)}</small>`)}
      ${hasRes ? cell('c4', 'Resize method', `<select data-fit-method><option value="scale" ${p.fit === 'scale' ? 'selected' : ''}>Scale — nothing cut off</option><option value="crop" ${p.fit !== 'scale' ? 'selected' : ''}>Crop — exact frame</option></select>`) : ''}
      ${hasRes && p.fit !== 'scale' ? cell('c4', 'Crop style', `<select data-fit-crop><option value="fill" ${p.fit === 'fill' ? 'selected' : ''}>Fill — trim the overflow</option><option value="stretch" ${p.fit === 'stretch' ? 'selected' : ''}>Stretch — distort to fill</option></select>`) : ''}
      ${cell('c6', 'Tags', `<div class="tag-row">${p.tags.map(t => `<span class="chip">${esc(title(t))}<button data-remove-tag="${esc(t)}" title="Remove tag from this post">×</button></span>`).join('') || '<em class="muted">none</em>'}</div><div class="media-row"><input list="known-tags" data-new-tag placeholder="Add a tag…"><button class="ghost" data-add-tag>Add</button></div>`)}
      ${cell('c6', 'Collections', `<div class="check-row">${state.collections.map(c => `<label class="check"><input type="checkbox" data-collection="${esc(c.id)}" ${p.collectionIds.includes(c.id) ? 'checked' : ''}> <span data-coll-label="${esc(c.id)}">${esc(c.title)}</span></label>`).join('') || '<em class="muted">No collections yet</em>'}</div><div class="media-row"><input data-new-collection-name placeholder="New collection…"><button class="ghost" data-add-collection>+ Add</button></div>`)}
      ${cell('c8', 'Description', area('description', p.description || ''))}${cell('c4', 'Credits (empty = hidden)', area('credits', p.credits || ''))}
      ${cell('c12', 'More media — carousel (item 1 is the image/video above)', `<div class="extras">${p.extra.map(extraRow).join('')}</div><div class="buttons"><button class="ghost" data-add-extra="image">+ Image</button><button class="ghost" data-add-extra="video">+ Video</button></div>`)}
    </div><aside class="preview" data-preview>${previewHTML(p)}</aside></div>`;
  }

  function headHTML(p) {
    const fav = !!p.featured, full = favCount() >= MAX_FAV && !fav, isOpen = open.has(p.uid);
    const cols = p.collectionIds.map(collTitle);
    const tip = fav ? 'Selected Work — click to remove from the homepage' : full ? `All ${MAX_FAV} Selected Work slots are used — unfavorite another post first` : 'Add to the homepage Selected Work';
    return `<header class="phead" data-toggle>
      <button class="star ${fav ? 'on' : ''}" data-fav aria-pressed="${fav}" ${full ? 'disabled' : ''} title="${esc(tip)}">${fav ? '★' : '☆'}<span>${fav ? 'Selected' : 'Favorite'}</span></button>
      <span class="rank">#${p.rank}</span>${fav ? `<span class="homepos" title="Position in the homepage Selected Work">Home ${p.favRank}</span>` : ''}<strong class="ptitle" data-heading>${esc(p.title || 'Untitled')}</strong>
      <span class="pmeta">${esc(p.year || '')} · ${p.type === 'video' ? 'Video' : 'Image'}${cols.length ? ` · ${cols.map(esc).join(', ')}` : ''}</span>
      ${isOpen ? '' : `<span class="mini">${previewHTML(p, true)}</span>`}
      <span class="grow"></span>
      <span class="buttons"><button class="ghost" data-move="up" title="Move up">↑</button><button class="ghost" data-move="down" title="Move down">↓</button><button class="ghost" data-duplicate>Duplicate</button><button class="danger" data-remove>Remove</button><button class="ghost" data-toggle-btn>${isOpen ? 'Close ▴' : 'Edit ▾'}</button></span></header>`;
  }
  const projectHTML = p => `<article class="project ${p.featured ? 'fav' : ''} ${open.has(p.uid) ? 'open' : ''}" data-uid="${p.uid}">${headHTML(p)}${open.has(p.uid) ? bodyHTML(p) : ''}</article>`;

  const panel = (key, heading, summary, inner) => `<details class="panel" data-panel="${key}" ${panelsOpen.has(key) ? 'open' : ''}><summary><b>${heading}</b><span class="muted">${summary}</span></summary><div class="panel-body">${inner}</div></details>`;

  const STYLE = `*{box-sizing:border-box}body{margin:0;background:#101011;color:#f5f1e9;font:14px ui-monospace,Consolas,monospace}h1,h2,h3{font-family:Impact,'Arial Black',sans-serif;letter-spacing:-.03em}
.topbar{position:sticky;top:0;z-index:8;background:#101011f5;border-bottom:1px solid #3a3939;padding:10px max(16px,calc((100vw - 1240px)/2 + 16px)) 8px;backdrop-filter:blur(6px)}
.toprow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.toprow h1{font-size:22px;color:#e8272e;margin:0;white-space:nowrap}.toprow #search{flex:1 1 200px;max-width:340px;padding:8px 10px}
.views{display:flex;gap:6px;overflow-x:auto;padding:8px 0 2px;scrollbar-width:thin}.pill{flex:0 0 auto;background:#2a2a2c;color:#f5f1e9;padding:7px 12px;display:inline-flex;gap:8px;align-items:center;white-space:nowrap}.pill b{background:#0006;padding:1px 6px;font-size:11px}.pill.on{background:#e8272e}.pill.gold{box-shadow:inset 0 0 0 1px #f4d21f}.pill.gold.on{background:#f4d21f;color:#111}.pill.gold.on b{background:#0002}
.wrap{max-width:1240px;margin:0 auto;padding:14px 16px 190px}.note{line-height:1.6;color:#c6c1bd;margin:0 0 10px;font-size:12px}.muted{color:#8f8a86;font-style:normal;font-size:12px}
.panel{background:#1b1b1d;border-left:4px solid #3a3939;margin:6px 0}.panel>summary{cursor:pointer;padding:10px 14px;display:flex;gap:14px;align-items:baseline;list-style:none}.panel>summary::-webkit-details-marker{display:none}.panel>summary:before{content:'▸';color:#e8272e}.panel[open]>summary:before{content:'▾'}.panel[open]>summary{border-bottom:1px solid #2e2e30}.panel-body{padding:12px 14px 14px}
.pgrid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px 12px}.cell{min-width:0}.c1{grid-column:span 1}.c2{grid-column:span 2}.c3{grid-column:span 3}.c4{grid-column:span 4}.c5{grid-column:span 5}.c6{grid-column:span 6}.c8{grid-column:span 8}.c12{grid-column:span 12}
.lbl{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px;color:#d6d0cc}
input,textarea,select{width:100%;background:#222;color:#fff;border:1px solid #555;padding:8px 10px;font:13px ui-monospace,Consolas,monospace}input[type=checkbox]{width:auto}textarea{min-height:64px;resize:vertical}input.dup{border-color:#e8272e;background:#2a1517}.dup-hint{color:#ff7b80;font-size:11px;display:block;margin-top:3px}.dup-hint[hidden]{display:none}
button{border:0;background:#e8272e;color:#fff;padding:8px 11px;font:700 12px ui-monospace,monospace;cursor:pointer}button:hover{filter:brightness(1.18)}button:disabled{opacity:.35;cursor:not-allowed;filter:none}button.ghost{background:#3a3939}button.danger{background:#79252a}.buttons{display:inline-flex;gap:6px;flex-wrap:wrap}
.project{background:#1b1b1d;border-left:5px solid #3a3939;margin:6px 0;scroll-margin-top:130px}.project.open{border-left-color:#e8272e}.project.fav{border-left-color:#f4d21f;background:linear-gradient(90deg,#f4d21f1c,#1b1b1d 38%)}
.phead{display:flex;align-items:center;gap:10px 12px;padding:8px 12px;cursor:pointer;flex-wrap:wrap}.rank{color:#8f8a86}.ptitle{font-size:15px}.pmeta{color:#9d9791;font-size:12px}.grow{flex:1 1 0}.mini{width:56px;height:34px;overflow:hidden;background:#090909;display:grid;place-items:center}.mini img{width:100%;height:100%;object-fit:cover}.mini .no-preview{padding:0;font-size:9px}
.star{background:#2a2a2c;color:#b9b3ad;padding:7px 10px;display:inline-flex;gap:6px;align-items:center;white-space:nowrap}.star.on{background:#f4d21f;color:#111}.star span{font-size:11px}
.pbody{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:16px;padding:6px 14px 16px;border-top:1px solid #2a2a2c}.preview{align-self:start;background:#090909;display:grid;place-items:center;overflow:hidden;margin-top:6px}.preview img,.preview video{width:100%;height:auto;display:block}.no-preview{color:#888;text-align:center;padding:30px 10px;font-size:12px}
.media-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}.media-row+.media-row,.tag-row+.media-row,.check-row+.media-row{margin-top:6px}.media-row[hidden],.custom-res[hidden]{display:none}.custom-res{display:flex;gap:8px;align-items:center;margin-top:6px}.custom-res input{width:96px}.custom-res em{color:#999;font-style:normal}
.tag-row,.check-row{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px}.chip{background:#f4d21f;color:#111;padding:4px 7px;font-size:11px;font-weight:bold}.chip small{opacity:.7;font-weight:normal}.chip button{background:transparent;color:#111;padding:0 0 0 6px;font-size:13px}.check{display:flex;align-items:center;gap:6px;background:#2a2a2c;padding:5px 9px;font-size:12px}
.scale-row{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.scale-row input{width:72px}.scale-row em{color:#999;font-style:normal;margin-right:4px}.scale-row button{padding:7px 8px}.cell small{display:block;color:#a09a96;margin-top:5px;font-size:11px}
.extras{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:6px;margin-bottom:6px}.extra-row{display:grid;grid-template-columns:84px minmax(0,1fr) auto auto auto auto;gap:5px;align-items:center}.extra-row .poster{grid-column:2 / -1}
.coll-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:6px}.coll-row{display:grid;grid-template-columns:56px minmax(0,1fr) auto auto auto auto;gap:6px;align-items:center;background:#222;padding:6px 8px;border-left:4px solid #f4d21f}.coll-row input[type=number]{width:56px}.add-collection{display:flex;gap:7px;max-width:520px;margin-top:10px}
.listhead{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap;margin:18px 0 6px}.listhead h2{margin:0;font-size:24px}.empty{color:#9d9791;padding:30px 0}
.seg button.on{background:#e8272e}.gridmode #search,.gridmode .views,.gridmode [data-expand-all],.gridmode [data-collapse-all]{display:none}
.zoombar{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:6px 0 14px}.zoombar input{width:200px;padding:0}
.gridpreview{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;background:#0a0a0b;padding:18px;border:1px dashed #3a3939}
.gcard{flex:0 0 auto;cursor:grab;position:relative;transition:opacity .15s}.gcard.dragging{opacity:.35}.gcard.before:before,.gcard.after:after{content:'';position:absolute;top:0;bottom:0;width:5px;background:#f4d21f;z-index:3}.gcard.before:before{left:-11px}.gcard.after:after{right:-11px}
.gmedia{position:relative;overflow:hidden;min-height:56px;background:#090707;box-shadow:5px 6px 0 #000a}.gmedia img,.gmedia video{display:block;width:100%;height:auto;pointer-events:none}.gmedia .no-preview{padding:34px 8px;pointer-events:none}.gcard.fav .gmedia{outline:3px solid #f4d21f}
.gnum{position:absolute;left:6px;top:6px;background:#000c;padding:3px 7px;font-size:11px;font-weight:bold}.gstar{position:absolute;right:6px;top:6px;background:#f4d21f;color:#111;padding:3px 7px;font-size:11px;font-weight:bold}
.gmove{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;padding:6px;opacity:0;transition:opacity .15s}.gcard:hover .gmove,.gcard:focus-within .gmove{opacity:1}.gmove button{padding:6px 9px;background:#000c}
.gmeta{display:flex;justify-content:space-between;gap:8px;background:#000a;padding:6px 8px;font-size:12px}.gmeta span{color:#9d9791}
@media(max-width:620px){.sortbtn{width:100%}}
@media(hover:none){.gmove{opacity:1}}
.sortbtn.on{background:#1f6f4a}.sortbtn{white-space:nowrap}
.cstack{display:flex;flex-direction:column;gap:6px}.cblock{position:relative;padding:4px 0 6px;transition:opacity .15s}.cblock.dragging{opacity:.4}
.cblock.before:before,.cblock.after:after{content:'';position:absolute;left:0;right:0;height:5px;background:#f4d21f;z-index:3}.cblock.before:before{top:-6px}.cblock.after:after{bottom:-6px}
.chead{display:flex;align-items:baseline;gap:14px;padding-top:16px;margin-top:14px;background:linear-gradient(to right,#f5f1e94d,#f5f1e90a 85%) top left/100% 1px no-repeat}.cblock:first-child .chead{margin-top:0}
.cblock:not(.fixed) .chead{cursor:grab}.cgrip{color:#8f8a86;font-size:18px}.ctitle{display:inline-flex;align-items:center;gap:12px;font:22px Impact,'Arial Black',sans-serif;letter-spacing:.04em;text-transform:uppercase}.ctitle:before{content:'';width:9px;height:9px;background:#e8272e}.ccount{font-size:11px;letter-spacing:.14em;color:#f5f1e980}
.chead .buttons button{padding:5px 9px}.cend{height:1px;margin-top:10px;background:linear-gradient(to right,#f5f1e90a,#f5f1e933)}.cempty{padding:10px 4px}
.gridpreview.locked{background:transparent;border:0;padding:12px 0 0}.gridpreview.locked .gcard{cursor:default;opacity:.34;filter:grayscale(1);pointer-events:none}.gridpreview.locked .gcard.fav .gmedia{outline-color:#f4d21f88}
.homepos{background:#f4d21f;color:#111;font-size:11px;font-weight:bold;padding:3px 7px;white-space:nowrap}
.fab{position:fixed;right:22px;bottom:84px;z-index:9;width:58px;height:58px;border-radius:50%;font-size:34px;line-height:1;padding:0 0 4px;box-shadow:0 6px 18px #000a,0 0 0 3px #101011}.fab:hover{filter:brightness(1.15);transform:scale(1.05)}
.sticky{position:fixed;z-index:7;bottom:0;left:0;right:0;background:#101011ee;border-top:1px solid #555;padding:12px max(16px,calc((100vw - 1240px)/2 + 16px));display:flex;justify-content:space-between;gap:12px;align-items:center}.status{color:#f4d21f;font-size:12px}
@media(max-width:1000px){.c1,.c2,.c3,.c4{grid-column:span 6}.c5,.c6,.c8{grid-column:span 12}.pbody{grid-template-columns:1fr}.preview{order:-1;max-width:300px}}
@media(max-width:620px){.c3,.c4{grid-column:span 12}.toprow h1{font-size:18px}.extra-row{grid-template-columns:76px minmax(0,1fr) auto auto}.extra-row button:nth-of-type(n+3){grid-column:auto}.sticky{flex-direction:column;align-items:flex-start}.fab{bottom:128px;right:16px}.coll-grid,.extras{grid-template-columns:1fr}.phead{gap:8px}}
@media(prefers-reduced-motion:reduce){.fab{transition:none}}`;

  /* ---------- rendering ---------- */
  function renderViews() {
    const n = state.projects.length, none = state.projects.filter(p => !p.collectionIds.length).length;
    const pill = (v, label, count, cls = '') => `<button class="pill ${view === v ? 'on' : ''} ${cls}" data-view="${esc(v)}">${label}<b>${count}</b></button>`;
    $('#views').innerHTML = pill('all', 'All', n) + pill('fav', '★ Selected Work', `${favCount()}/${MAX_FAV}`, 'gold')
      + state.collections.map(c => pill(`c:${c.id}`, esc(c.title), state.projects.filter(p => p.collectionIds.includes(c.id)).length)).join('')
      + (none && state.collections.length ? pill('none', 'No collection', none) : '');
  }

  function viewName() { return view === 'all' ? 'All work' : view === 'fav' ? 'Selected Work (homepage)' : view === 'none' ? 'No collection' : collTitle(view.slice(2)); }

  /* ---------- grid screen: preview the Work page layout and drag cards into order ---------- */
  function gridCard(p, locked) {
    const w = Math.round(state.layout.cardWidth * p.scale / 100 * zoom / 100);
    const thumb = previewHTML(p).replace(' controls', '').replace('<img ', '<img draggable="false" ');
    return `<div class="gcard ${p.featured ? 'fav' : ''}" ${locked ? '' : 'draggable="true"'} data-uid="${p.uid}" style="width:${w}px;max-width:100%">
      <div class="gmedia">${thumb}<span class="gnum">${p.rank}</span>${p.featured ? '<span class="gstar">★ Selected</span>' : ''}${locked ? '' : '<span class="gmove"><button data-gmove="-1" title="Move earlier">◀</button><button data-gmove="1" title="Move later">▶</button></span>'}</div>
      <div class="gmeta"><b>${esc(p.title || 'Untitled')}</b><span>${esc(p.year || '')}</span></div></div>`;
  }
  /* Work-page order when "Sort by collections" is on: each post sits under its first collection (collection rank order), unassigned work last */
  const byCollections = () => state.layout.sortMode !== 'manual';
  function groupOrder() {
    const known = state.collections.map(c => c.id), extra = [...new Set(state.projects.flatMap(p => p.collectionIds))].filter(id => !known.includes(id)), order = [...known, ...extra], buckets = new Map([...order, ''].map(id => [id, []]));
    [...state.projects].sort((a, b) => a.rank - b.rank).forEach(p => buckets.get(order.find(k => p.collectionIds.includes(k)) || '').push(p));
    return [...order, ''].map(id => ({ id, title: id ? collTitle(id) : 'More work', posts: buckets.get(id), fixed: !known.includes(id) }));
  }
  function blockHTML(g, i, all) {
    const movable = !g.fixed, n = g.posts.length;
    return `<section class="cblock ${movable ? '' : 'fixed'}" data-cid="${esc(g.id)}" ${movable ? 'draggable="true"' : ''}>
      <header class="chead">${movable ? '<span class="cgrip" title="Drag to reorder this collection">⠿</span>' : ''}<span class="ctitle">${esc(g.title)}</span><span class="ccount">${String(n).padStart(2, '0')}</span><span class="grow"></span>${movable ? `<span class="buttons"><button class="ghost" data-cmove="-1" title="Move collection up" ${i === 0 ? 'disabled' : ''}>▲</button><button class="ghost" data-cmove="1" title="Move collection down" ${all[i + 1] && !all[i + 1].fixed ? '' : 'disabled'}>▼</button></span>` : ''}</header>
      <div class="gridpreview locked">${g.posts.map(p => gridCard(p, true)).join('') || '<span class="muted cempty">No posts in this collection yet</span>'}</div><div class="cend"></div></section>`;
  }
  function renderCollectionGrid() {
    const scroll = scrollY, groups = groupOrder().filter(g => g.posts.length || !g.fixed), movable = groups.filter(g => !g.fixed);
    $('#app').innerHTML = `<main class="wrap"><div class="listhead"><h2>Grid layout · by collection</h2><span class="muted">${movable.length} collections · drag a collection (or use ▲ ▼) to reorder it. This is the order on the Work page and in the Collections list. Posts are locked here — turn off “Sort by collections” to move individual posts.</span></div>
      <div class="zoombar"><label>Preview size <input type="range" id="zoom" min="30" max="120" step="5" value="${zoom}"> <b id="zoomv">${zoom}%</b></label><span class="muted">Posts inside a collection follow their rank.</span></div>
      <div class="cstack">${groups.map((g, i) => blockHTML(g, i, groups)).join('') || '<p class="empty">No work yet.</p>'}</div></main><input id="picker" type="file" hidden>`;
    scrollTo(0, scroll);
  }
  function moveColl(cid, targetCid, after) {
    if (cid === targetCid) return;
    const list = state.collections, c = list.find(x => x.id === cid); if (!c) return;
    list.splice(list.indexOf(c), 1);
    const t = list.findIndex(x => x.id === targetCid); list.splice(t < 0 ? list.length : t + (after ? 1 : 0), 0, c);
    renumberCollections(); renderCollectionGrid(); status(`Moved collection "${c.title}" to position ${c.rank}. Export when ready.`);
  }
  function setSortMode(on) {
    sync();
    if (!on && byCollections()) groupOrder().flatMap(g => g.posts).forEach((p, i) => { p.rank = i + 1; }); /* keep the page exactly as it looked, then let each post be moved */
    state.layout.sortMode = on ? 'collections' : 'manual';
    const b = $('[data-sortmode]'); if (b) { b.classList.toggle('on', on); b.textContent = `Sort by collections: ${on ? 'ON' : 'OFF'}`; }
    render(false); status(on ? 'Work page is grouped by collection. Drag collections in Grid layout to reorder them.' : 'Manual sorting: the Work page follows each post’s own order.');
  }

  function renderGrid() {
    if (byCollections()) { renderCollectionGrid(); return; }
    const scroll = scrollY, list = [...state.projects].sort((a, b) => a.rank - b.rank);
    $('#app').innerHTML = `<main class="wrap"><div class="listhead"><h2>Grid layout</h2><span class="muted">${list.length} posts · manual sorting is on — drag a card to a new spot (or use ◀ ▶). This is the Work page order, with no collection sections. Sizes use each post's Size % × the base width.</span></div>
      <div class="zoombar"><label>Preview size <input type="range" id="zoom" min="30" max="120" step="5" value="${zoom}"> <b id="zoomv">${zoom}%</b></label><span class="muted">★ gold = shown in the homepage Selected Work</span></div>
      <div class="gridpreview" id="gridpreview">${list.map(p => gridCard(p)).join('') || '<p class="empty">No work yet.</p>'}</div></main><input id="picker" type="file" hidden>`;
    scrollTo(0, scroll);
  }
  function moveTo(uid, targetUid, after) {
    const list = [...state.projects].sort((a, b) => a.rank - b.rank), p = list.find(x => x.uid === uid);
    if (!p || uid === targetUid) return;
    list.splice(list.indexOf(p), 1);
    const t = list.findIndex(x => x.uid === targetUid); list.splice(t + (after ? 1 : 0), 0, p);
    list.forEach((x, i) => { x.rank = i + 1; }); state.projects = list;
    renderGrid(); status(`Moved "${p.title}" to position ${p.rank}. Export when ready.`);
  }

  function setScreen(next) {
    sync(); screen = next;
    $('#top').classList.toggle('gridmode', screen === 'grid'); $('.fab').hidden = screen === 'grid';
    $$('[data-screen]').forEach(b => b.classList.toggle('on', b.dataset.screen === screen));
    render(false); scrollTo(0, 0);
  }

  function render(keepScroll = true) {
    const sb = $('[data-sortmode]'); if (sb) { sb.classList.toggle('on', byCollections()); sb.textContent = `Sort by collections: ${byCollections() ? 'ON' : 'OFF'}`; }
    if (screen === 'grid') { renderGrid(); return; }
    const scroll = scrollY;
    renumber(); renumberCollections(); applyFeatured(state.projects);
    if (view.startsWith('c:') && !state.collections.some(c => c.id === view.slice(2))) view = 'all';
    const a = state.artist, social = name => a.socials?.find(s => s.label === name)?.url || '';
    const usage = id => state.projects.filter(p => p.collectionIds.includes(id)).length;
    const list = visibleProjects();
    const hint = byCollections() && view === 'all' ? 'The Work page groups posts by collection; order inside a collection follows rank.' : view.startsWith('c:') ? 'New work you add here is placed in this collection.' : view === 'fav' ? 'Homepage order — use ↑ ↓ to rank these as they appear on the homepage.' : '';
    renderViews();
    $('#app').innerHTML = `<main class="wrap">
      ${panel('artist', 'Artist information', esc(a.name || ''), `<div class="pgrid" data-artist-section>${cell('c3', 'Name', input('name', a.name || ''))}${cell('c3', 'Email', input('email', a.email || '', 'email'))}${cell('c3', 'Instagram URL', input('instagram', social('Instagram')))}${cell('c3', 'YouTube URL', input('youtube', social('YouTube')))}${cell('c6', 'Role / strapline', input('role', a.role || ''))}${cell('c6', 'Biography', area('bio', a.bio || ''))}</div>`)}
      ${panel('layout', 'Layout', `${state.layout.cardWidth}px base card width`, `<p class="note">Work-page cards are left-aligned and wrap. This is a card's width at 100%; each post's own size is set inside the post.</p><div class="scale-row"><input type="number" id="layout-width" min="160" max="900" step="10" value="${state.layout.cardWidth}"><em>px base card width</em></div>`)}
      ${panel('collections', 'Collections', `${state.collections.length} · rename, reorder, delete`, `<p class="note">Collections become buttons on the Work page in this order (rank 1 first).</p><div class="coll-grid">${state.collections.map(c => `<div class="coll-row" data-cid="${esc(c.id)}"><input type="number" min="1" data-coll-rank value="${c.rank}" title="Rank"><input data-coll-title value="${esc(c.title)}"><button class="ghost" data-coll-move="up">↑</button><button class="ghost" data-coll-move="down">↓</button><span class="muted">${usage(c.id)}</span><button class="danger" data-delete-collection="${esc(c.id)}">Delete</button></div>`).join('') || '<em class="muted">No collections yet.</em>'}</div><div class="add-collection"><input id="new-collection" placeholder="New collection name"><button data-add-collection-top>+ New collection</button></div>`)}
      ${panel('tags', 'Tags', `${allTags().length} · delete everywhere`, `<p class="note">Tags become the Work page's filter dropdown. Deleting one removes it from every post.</p><div class="tag-row">${allTags().map(t => `<span class="chip">${esc(title(t))} <small>(${state.projects.filter(p => p.tags.includes(t)).length})</small><button data-delete-tag="${esc(t)}" title="Delete this tag everywhere">×</button></span>`).join('') || '<em class="muted">No tags yet — add them inside a post.</em>'}</div>`)}
      <div class="listhead" id="listhead"><h2>${esc(viewName())}</h2><span class="muted">${list.length} of ${state.projects.length} shown${hint ? ` · ${hint}` : ''}</span></div>
      <datalist id="known-tags">${allTags().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <div id="list">${list.map(projectHTML).join('') || '<p class="empty">Nothing here yet — press the + button to add work.</p>'}</div></main><input id="picker" type="file" hidden>`;
    if (keepScroll) scrollTo(0, scroll);
  }

  /* ---------- read the form back into state ---------- */
  function sync() {
    const a = state.artist, artistSection = $('[data-artist-section]');
    if (!artistSection) return;
    const artistKey = k => $(`[data-key="${k}"]`, artistSection)?.value ?? '';
    a.name = artistKey('name'); a.role = artistKey('role'); a.email = artistKey('email'); a.bio = artistKey('bio');
    a.socials = [{ label: 'Instagram', url: artistKey('instagram') }, { label: 'YouTube', url: artistKey('youtube') }].filter(s => s.url);
    if ($('#layout-width')) state.layout.cardWidth = clampBase($('#layout-width').value);
    $$('.coll-row').forEach(row => { const c = state.collections.find(x => x.id === row.dataset.cid); if (c) c.title = $('[data-coll-title]', row).value || c.title; });
    $$('.project').forEach(card => {
      const p = byUid(card.dataset.uid), body = $('.pbody', card); if (!p || !body) return; /* collapsed cards have no form to read */
      $$('[data-key]', body).forEach(el => { const k = el.dataset.key; p[k] = k === 'rank' ? (Number(el.value) || 999) : k === 'scale' ? clampScale(el.value) : el.value; });
      p.id = slug(p.id) || p.id || uniqueId('work');
      p.media = publicPath(p.media); p.videoUrl = publicPath(p.videoUrl); p.thumb = publicPath(p.thumb);
      p.collectionIds = $$('[data-collection]', body).filter(c => c.checked).map(c => c.dataset.collection);
      p.extra = $$('.extra-row', body).map(row => ({ kind: $('[data-extra-kind]', row).value === 'video' ? 'video' : 'image', src: publicPath($('[data-extra-src]', row).value), poster: publicPath($('[data-extra-poster]', row)?.value || '') }));
      const sel = $('[data-resolution]', body);
      if (sel) {
        if (sel.value === 'custom') { const w = Number($('[data-res-w]', body).value), h = Number($('[data-res-h]', body).value); p.resolution = w >= 16 && h >= 16 ? `${Math.round(w)}x${Math.round(h)}` : 'auto'; }
        else p.resolution = sel.value;
        const method = $('[data-fit-method]', body), crop = $('[data-fit-crop]', body);
        if (method) p.fit = method.value === 'scale' ? 'scale' : (crop ? crop.value : p.fit === 'stretch' ? 'stretch' : 'fill');
      }
    });
  }
  const refreshCard = card => { const p = byUid(card.dataset.uid), prev = $('[data-preview]', card); if (prev) prev.innerHTML = previewHTML(p); const h = $('[data-heading]', card); if (h) h.textContent = p.title || 'Untitled'; };

  /* ---------- actions ---------- */
  function newProject(extra = {}) {
    return { uid: ++uidCounter, id: '', rank: state.projects.length + 1, title: '', year: String(new Date().getFullYear()), type: 'image', resolution: 'auto', fit: 'fill', scale: 100, thumbMode: 'auto', thumb: '', extra: [], tags: [], collectionIds: [], description: '', credits: '', media: '', videoUrl: '', accent: 'red', featured: false, ...extra };
  }
  function reveal(p) {
    render(false);
    const card = $(`.project[data-uid="${p.uid}"]`); if (!card) return;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const t = $('[data-key="title"]', card); if (t) { t.focus({ preventScroll: true }); t.select(); }
  }
  function addProject() {
    sync();
    const inCollection = view.startsWith('c:') ? view.slice(2) : null;
    const p = newProject({ title: uniqueName('New Work'), collectionIds: inCollection ? [inCollection] : [] });
    p.id = uniqueId(p.title);
    let note = '';
    if (view === 'fav') { if (favCount() < MAX_FAV) p.featured = true; else { view = 'all'; note = ` (all ${MAX_FAV} favorite slots are used, so it was added as a regular post)`; } }
    state.projects.push(p); open.add(p.uid); pinned.add(p.uid); query = ''; $('#search').value = '';
    reveal(p); status(`Added "${p.title}"${inCollection ? ` to ${collTitle(inCollection)}` : ''}${note}. Fill it in below.`);
  }
  function duplicate(p) {
    sync();
    const clone = structuredClone(p);
    clone.uid = ++uidCounter; clone.title = nextName(p.title); clone.id = uniqueId(clone.title); clone.featured = false; clone.rank = p.rank + .5;
    state.projects.push(clone); open.add(clone.uid); pinned.add(clone.uid); renumber();
    reveal(clone); status(`Duplicated as "${clone.title}". Everything else was copied.`);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t = e.target, project = t.closest('.project'), p = project ? byUid(project.dataset.uid) : null;
    if (p) pinned.add(p.uid);

    const scr = t.closest('[data-screen]'); if (scr) { setScreen(scr.dataset.screen); return; }
    if (t.closest('[data-sortmode]')) { setSortMode(!byCollections()); return; }
    const cm = t.closest('[data-cmove]');
    if (cm) { const groups = groupOrder().filter(g => g.posts.length || !g.fixed), cid = cm.closest('.cblock').dataset.cid, i = groups.findIndex(g => g.id === cid), q = groups[i + Number(cm.dataset.cmove)]; if (q && !q.fixed) moveColl(cid, q.id, Number(cm.dataset.cmove) > 0); return; }
    const gm = t.closest('[data-gmove]');
    if (gm) { const card = gm.closest('.gcard'), list = [...state.projects].sort((a, b) => a.rank - b.rank), i = list.findIndex(x => x.uid === Number(card.dataset.uid)), q = list[i + Number(gm.dataset.gmove)]; if (q) moveTo(list[i].uid, q.uid, Number(gm.dataset.gmove) > 0); return; }
    const pillBtn = t.closest('[data-view]');
    if (pillBtn) { sync(); view = pillBtn.dataset.view; pinned.clear(); render(); const y = $('#listhead').getBoundingClientRect().top + scrollY - $('#top').offsetHeight - 8; if (scrollY > y) scrollTo(0, y); return; }
    if (t.closest('[data-new]')) { addProject(); return; }
    if (t.closest('[data-expand-all]')) { sync(); visibleProjects().forEach(x => open.add(x.uid)); render(); return; }
    if (t.closest('[data-collapse-all]')) { sync(); open.clear(); render(); return; }
    if (t.closest('[data-reset]')) { state = structuredClone(original); previews.clear(); customMode.clear(); open.clear(); pinned.clear(); view = 'all'; render(); status('Reset to the content you loaded.'); return; }
    if (t.closest('[data-export]')) {
      try {
        sync(); renumber(); renumberCollections(); applyFeatured(state.projects);
        const output = {
          layout: state.layout,
          artist: state.artist,
          collections: state.collections.map(c => ({ id: c.id, title: c.title, description: c.description, rank: c.rank })),
          projects: state.projects.map(({ uid, ratio, frameRatio, ...rest }) => ({ ...rest, featured: !!rest.featured, extra: (rest.extra || []).filter(x => x.src) }))
        };
        const blob = new Blob([`/* Generated by editor.html — replace content/content-data.js */\nwindow.PORTFOLIO_CONTENT = ${JSON.stringify(output, null, 2)};\n`], { type: 'text/javascript' });
        const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'content-data.js' });
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        status('Downloaded content-data.js. Replace content/content-data.js in your site folder and publish.');
      } catch (err) { status('Export failed: ' + err.message); console.error(err); }
      return;
    }

    /* collections */
    const addColl = t.closest('[data-add-collection-top],[data-add-collection]');
    if (addColl) {
      sync();
      const field = project ? $('[data-new-collection-name]', project) : $('#new-collection'), name = field.value.trim();
      if (!name) { field.focus(); status('Type a collection name first.'); return; }
      let id = slug(name) || 'collection', n = 2; const base = id;
      const existing = state.collections.find(c => c.id === id || c.title.toLowerCase() === name.toLowerCase());
      if (existing) id = existing.id; else { while (state.collections.some(c => c.id === id)) id = `${base}-${n++}`; state.collections.push({ id, title: name, description: '', rank: state.collections.length + 1 }); }
      if (p && !p.collectionIds.includes(id)) p.collectionIds.push(id);
      if (!project) panelsOpen.add('collections');
      render(); status(`Collection "${name}" ${existing ? 'selected' : 'created'}.`); return;
    }
    const del = t.closest('[data-delete-collection]');
    if (del) { sync(); const id = del.dataset.deleteCollection, c = state.collections.find(x => x.id === id); state.collections = state.collections.filter(x => x.id !== id); state.projects.forEach(x => { x.collectionIds = x.collectionIds.filter(k => k !== id); }); render(); status(`Deleted collection "${c?.title || id}".`); return; }
    const cmove = t.closest('[data-coll-move]');
    if (cmove) { sync(); const row = cmove.closest('.coll-row'), i = state.collections.findIndex(c => c.id === row.dataset.cid), j = i + (cmove.dataset.collMove === 'up' ? -1 : 1); if (state.collections[j]) [state.collections[i], state.collections[j]] = [state.collections[j], state.collections[i]]; render(); return; }
    const delTag = t.closest('[data-delete-tag]');
    if (delTag) { sync(); const tag = delTag.dataset.deleteTag; state.projects.forEach(x => { x.tags = x.tags.filter(k => k !== tag); }); render(); status(`Deleted tag "${title(tag)}" from every post.`); return; }

    if (!project || !p) return;
    /* header actions */
    if (t.closest('[data-fav]')) {
      sync();
      if (p.featured) { p.featured = false; status(`"${p.title}" removed from Selected Work.`); }
      else if (favCount() >= MAX_FAV) { status(`All ${MAX_FAV} Selected Work slots are used. Unfavorite another post first.`); return; }
      else { p.featured = true; status(`"${p.title}" added to Selected Work (${favCount()}/${MAX_FAV}).`); }
      render(); return;
    }
    if (t.closest('[data-toggle-btn]') || (t.closest('.phead') && !t.closest('button'))) { sync(); if (open.has(p.uid)) open.delete(p.uid); else open.add(p.uid); render(); return; }
    if (t.closest('[data-duplicate]')) { duplicate(p); return; }
    if (t.closest('[data-remove]')) { sync(); state.projects = state.projects.filter(x => x !== p); open.delete(p.uid); render(); status(`Removed "${p.title}".`); return; }
    if (t.closest('[data-move]') && view === 'fav' && p.featured) {
      sync(); const favs = visibleProjects().filter(x => x.featured), q = favs[favs.indexOf(p) + (t.closest('[data-move]').dataset.move === 'up' ? -1 : 1)];
      if (q) { [p.favRank, q.favRank] = [q.favRank, p.favRank]; status(`"${p.title}" is now #${p.favRank} on the homepage.`); }
      render(); return;
    }
    if (t.closest('[data-move]')) {
      sync(); renumber();
      const vis = visibleProjects(), q = vis[vis.indexOf(p) + (t.closest('[data-move]').dataset.move === 'up' ? -1 : 1)];
      if (q) { const i = state.projects.indexOf(p), j = state.projects.indexOf(q); [state.projects[i], state.projects[j]] = [state.projects[j], state.projects[i]]; state.projects.forEach((x, k) => { x.rank = k + 1; }); }
      render(); return;
    }
    /* body actions */
    const preset = t.closest('[data-scale-preset]');
    if (preset) { $('[data-key="scale"]', project).value = preset.dataset.scalePreset; sync(); $('[data-scale-hint]', project).textContent = scaleHint(p); status('Edited — export when ready.'); return; }
    if (t.closest('[data-pick]')) { sync(); pickTarget = { uid: p.uid, key: t.closest('[data-pick]').dataset.pick }; const picker = $('#picker'); picker.accept = pickTarget.key === 'videoUrl' ? 'video/*' : 'image/*'; picker.click(); return; }
    if (t.closest('[data-pick-extra]')) { sync(); const i = Number(t.closest('.extra-row').dataset.i); pickTarget = { uid: p.uid, extra: i }; const picker = $('#picker'); picker.accept = p.extra[i].kind === 'video' ? 'video/*' : 'image/*'; picker.click(); return; }
    if (t.closest('[data-add-extra]')) { sync(); p.extra.push({ kind: t.closest('[data-add-extra]').dataset.addExtra, src: '', poster: '' }); render(); return; }
    if (t.closest('[data-extra-remove]')) { sync(); p.extra.splice(Number(t.closest('.extra-row').dataset.i), 1); render(); return; }
    if (t.closest('[data-extra-move]')) { sync(); const i = Number(t.closest('.extra-row').dataset.i), j = i + (t.closest('[data-extra-move]').dataset.extraMove === 'up' ? -1 : 1); if (p.extra[j]) [p.extra[i], p.extra[j]] = [p.extra[j], p.extra[i]]; render(); return; }
    if (t.closest('[data-flip]')) { sync(); const r = parseRes(p.resolution); if (r) { p.resolution = `${r[1]}x${r[0]}`; render(); status(`Flipped to ${r[1]} × ${r[0]}.`); } else status('Pick a resolution first, then flip it.'); return; }
    if (t.closest('[data-add-tag]')) { sync(); const field = $('[data-new-tag]', project); p.tags = [...new Set([...p.tags, ...field.value.split(',').map(slug).filter(Boolean)])]; render(); return; }
    if (t.closest('[data-remove-tag]')) { sync(); const tag = t.closest('[data-remove-tag]').dataset.removeTag; p.tags = p.tags.filter(x => x !== tag); render(); return; }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'zoom') { zoom = Number(t.value); $('#zoomv').textContent = zoom + '%'; renderGrid(); return; }
    if (t.id === 'search') { query = t.value.trim(); pinned.clear(); sync(); render(); const s = $('#search'); return; }
    if (!t.closest('main')) return;
    sync(); status('Edited — export when ready.');
    if (t.matches('[data-key="scale"],#layout-width')) $$('.project').forEach(c => { const q = byUid(c.dataset.uid), h = $('[data-scale-hint]', c); if (q && h) h.textContent = scaleHint(q); });
    const card = t.closest('.project');
    if (card && t.matches('[data-key="title"]')) {
      const h = $('[data-heading]', card); if (h) h.textContent = t.value || 'Untitled';
      const dup = nameTaken(t.value, Number(card.dataset.uid)); t.classList.toggle('dup', dup); const hint = $('.dup-hint', card); if (hint) hint.hidden = !dup;
    }
    if (t.matches('[data-coll-title]')) { const id = t.closest('.coll-row').dataset.cid; $$(`[data-coll-label="${CSS.escape(id)}"]`).forEach(s => { s.textContent = t.value; }); }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'picker' && pickTarget) {
      const file = t.files[0], p = byUid(pickTarget.uid);
      if (file && p) {
        if (pickTarget.extra !== undefined) p.extra[pickTarget.extra].src = `content/${file.name}`;
        else { p[pickTarget.key] = `content/${file.name}`; previews.set(`${p.uid}:${pickTarget.key}`, URL.createObjectURL(file)); if (pickTarget.key === 'videoUrl') p.type = 'video'; if (pickTarget.key === 'thumb') p.thumbMode = 'custom'; }
        render(); status(`Using content/${file.name}. Keep this file in your site's content folder before publishing.`);
      }
      t.value = ''; return;
    }
    if (t.matches('[data-coll-rank]')) { sync(); const id = t.closest('.coll-row').dataset.cid, i = state.collections.findIndex(c => c.id === id), [c] = state.collections.splice(i, 1); state.collections.splice(Math.min(Math.max(Number(t.value) || 1, 1), state.collections.length + 1) - 1, 0, c); render(); return; }
    const card = t.closest('.project'); if (!card) return;
    const p = byUid(card.dataset.uid); if (!p) return;
    pinned.add(p.uid);
    if (t.matches('[data-resolution]')) {
      if (t.value === 'custom') { customMode.add(p.uid); if (p.resolution === 'auto') p.resolution = '1920x1080'; }
      else customMode.delete(p.uid);
      sync(); render(); return;
    }
    if (t.matches('[data-fit-method],[data-fit-crop]')) { sync(); render(); return; }
    if (t.matches('[data-res-w],[data-res-h]')) { sync(); refreshCard(card); return; }
    if (t.matches('[data-extra-kind]')) { sync(); render(); return; }
    if (t.matches('[data-key="rank"]')) { sync(); const wanted = p.rank; state.projects = state.projects.filter(x => x !== p); state.projects.sort((a, b) => a.rank - b.rank); state.projects.splice(Math.min(Math.max(wanted, 1), state.projects.length + 1) - 1, 0, p); renumber(); render(); return; }
    if (t.matches('[data-key="type"],[data-key="thumbMode"],[data-collection],[data-key="year"]')) { sync(); render(); return; }
    if (t.matches('[data-key="videoUrl"]') && t.value.trim() && p.type !== 'video' && !p.media) { sync(); p.type = 'video'; render(); status('Media kind switched to Video because a video link was added.'); return; }
    if (t.matches('[data-key="media"],[data-key="videoUrl"],[data-key="thumb"]')) { sync(); previews.delete(`${p.uid}:${t.dataset.key}`); refreshCard(card); return; }
    if (t.matches('[data-key="title"]')) { sync(); render(); return; }
    if (t.matches('[data-key]')) { sync(); refreshCard(card); }
  });

  /* drag and drop in the grid screen */
  const clearDrop = () => $$('.gcard.before,.gcard.after,.gcard.dragging').forEach(c => c.classList.remove('before', 'after', 'dragging'));
  const clearBlocks = () => $$('.cblock.before,.cblock.after,.cblock.dragging').forEach(c => c.classList.remove('before', 'after', 'dragging'));
  document.addEventListener('dragstart', e => { const b = e.target.closest?.('.cblock'); if (b) { if (!b.draggable) return; dragCid = b.dataset.cid; b.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragCid); return; } const c = e.target.closest?.('.gcard'); if (!c) return; dragUid = Number(c.dataset.uid); c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragUid)); });
  document.addEventListener('dragover', e => {
    if (dragCid != null) { const b = e.target.closest?.('.cblock'); if (!b) return; e.preventDefault(); const r = b.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2; clearBlocks(); document.querySelector(`.cblock[data-cid="${CSS.escape(dragCid)}"]`)?.classList.add('dragging'); if (b.dataset.cid !== dragCid && (!b.classList.contains('fixed') || !after)) b.classList.add(after ? 'after' : 'before'); return; }
    const c = e.target.closest?.('.gcard'); if (!c || dragUid == null) return; e.preventDefault();
    const r = c.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    $$('.gcard.before,.gcard.after').forEach(x => x.classList.remove('before', 'after')); if (Number(c.dataset.uid) !== dragUid) c.classList.add(after ? 'after' : 'before');
  });
  document.addEventListener('drop', e => {
    if (dragCid != null) { const b = e.target.closest?.('.cblock'); if (!b) return; e.preventDefault(); const r = b.getBoundingClientRect(), id = dragCid, fixed = b.classList.contains('fixed'), after = !fixed && e.clientY > r.top + r.height / 2; dragCid = null; clearBlocks(); moveColl(id, fixed ? (state.collections.at(-1)?.id) : b.dataset.cid, fixed ? true : after); return; }
   const c = e.target.closest?.('.gcard'); if (!c || dragUid == null) return; e.preventDefault(); const r = c.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2, id = dragUid; dragUid = null; clearDrop(); moveTo(id, Number(c.dataset.uid), after); });
  document.addEventListener('dragend', () => { dragUid = null; dragCid = null; clearDrop(); clearBlocks(); });

  /* remember which settings panels are open (the toggle event does not bubble) */
  document.addEventListener('toggle', e => { const d = e.target.closest?.('[data-panel]'); if (d) { if (d.open) panelsOpen.add(d.dataset.panel); else panelsOpen.delete(d.dataset.panel); } }, true);

  /* ---------- chrome that never re-renders: top bar, floating +, bottom bar ---------- */
  function mountChrome() {
    const style = document.createElement('style'); style.textContent = STYLE; document.head.append(style);
    const top = document.createElement('div'); top.id = 'top'; top.className = 'topbar';
    top.innerHTML = `<div class="toprow"><h1>CONTENT // CONTROL</h1><span class="buttons seg"><button class="ghost on" data-screen="list">Edit list</button><button class="ghost" data-screen="grid">Grid layout</button></span><button class="ghost sortbtn on" data-sortmode>Sort by collections: ON</button><input id="search" type="search" placeholder="Search work…" aria-label="Search work"><span class="buttons"><button class="ghost" data-expand-all>Expand all</button><button class="ghost" data-collapse-all>Collapse all</button></span></div><div class="views" id="views" aria-label="Collections"></div>`;
    document.body.prepend(top);
    const fab = document.createElement('button'); fab.className = 'fab'; fab.setAttribute('data-new', ''); fab.setAttribute('aria-label', 'New work'); fab.title = 'New work (added to the selected collection)'; fab.textContent = '+';
    document.body.append(fab);
    $('#bar').innerHTML = `<div class="sticky"><span id="status" class="status">Ready. Nothing is saved until you export.</span><span class="buttons"><button class="ghost" data-reset>Reset to loaded content</button><button data-export>Download content-data.js</button></span></div>`;
  }
  mountChrome(); render(false);
})();

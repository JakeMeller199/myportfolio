/* Content editor. Loaded by editor.html (editor-enhancements.js is no longer needed). */
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

  /* ---------- resolution ---------- */
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

  /* ---------- state ---------- */
  let uidCounter = 0;
  const normExtra = x => ({ kind: x?.kind === 'video' ? 'video' : 'image', src: publicPath(x?.src || ''), poster: publicPath(x?.poster || '') });
  const clampScale = v => Math.min(300, Math.max(20, Math.round(Number(v)) || 100));
  const clampBase = v => Math.min(900, Math.max(160, Math.round(Number(v)) || 360));
  const normalize = data => ({
    layout: { cardWidth: clampBase(data.layout?.cardWidth) },
    artist: { ...(data.artist || {}), socials: (data.artist?.socials || []).filter(s => s.label?.toLowerCase() !== 'vimeo') },
    collections: (data.collections || []).map((c, i) => ({ id: slug(c.id || c.title), title: c.title || title(c.id), description: c.description || '', rank: Number(c.rank) || i + 1 })).sort((a, b) => a.rank - b.rank),
    projects: (data.projects || []).map((p, i) => {
      const { ratio, frameRatio, ...rest } = p; // old "display ratio" fields are retired
      return {
        ...rest,
        uid: ++uidCounter,
        id: slug(p.id) || `project-${i + 1}`,
        rank: Number(p.rank) || i + 1,
        type: p.type === 'video' ? 'video' : 'image',
        resolution: cleanRes(p.resolution),
        fit: cleanFit(p.fit),
        scale: clampScale(p.scale),
        thumbMode: ['auto', 'custom', 'none'].includes(p.thumbMode) ? p.thumbMode : 'auto',
        thumb: publicPath(p.thumb || ''),
        media: publicPath(p.media || ''),
        videoUrl: publicPath(p.videoUrl || ''),
        extra: (p.extra || []).map(normExtra),
        tags: [...new Set((p.tags || []).map(slug).filter(Boolean))],
        collectionIds: [...new Set((p.collectionIds || (p.collection ? [p.collection] : [])).map(slug).filter(Boolean))]
      };
    })
  });
  let state = normalize(structuredClone(window.PORTFOLIO_CONTENT || { artist: {}, projects: [] }));
  const original = structuredClone(state);
  const previews = new Map();   // "uid:key" -> blob URL for freshly picked files
  const customMode = new Set(); // uids whose resolution dropdown is on "Custom…"
  let pickTarget = null;

  const byUid = uid => state.projects.find(p => p.uid === Number(uid));
  const renumber = () => state.projects.sort((a, b) => a.rank - b.rank).forEach((p, i) => { p.rank = i + 1; });
  const renumberCollections = () => state.collections.forEach((c, i) => { c.rank = i + 1; });
  const uniqueId = base => { const root = slug(base) || 'new-project'; let id = root, n = 2; while (state.projects.some(p => p.id === id)) id = `${root}-${n++}`; return id; };
  const isCustomRes = p => customMode.has(p.uid) || (p.resolution !== 'auto' && !PRESETS.some(([v]) => v === p.resolution));
  const status = text => { const el = $('#status'); if (el) el.textContent = text; };
  const allTags = () => [...new Set(state.projects.flatMap(p => p.tags))].sort();

  /* ---------- markup ---------- */
  const field = (label, key, value, cls = '', type = 'text') => `<label class="field ${cls}"><span>${label}</span><input type="${type}" data-key="${key}" value="${esc(value)}"></label>`;
  const area = (label, key, value, cls = '') => `<label class="field ${cls}"><span>${label}</span><textarea data-key="${key}">${esc(value)}</textarea></label>`;

  function previewHTML(p) {
    const res = parseRes(p.resolution);
    const style = res ? ` style="aspect-ratio:${res[0]} / ${res[1]};object-fit:${FIT_CSS[p.fit]};background:#000"` : '';
    if (p.thumbMode === 'none') return '<div class="no-preview">Title card only — no thumbnail</div>';
    const thumbSrc = previews.get(`${p.uid}:thumb`) || p.thumb;
    if (p.thumbMode === 'custom' && thumbSrc) return `<img src="${esc(thumbSrc)}" alt="Custom thumbnail"${style}>`;
    const poster = previews.get(`${p.uid}:media`) || p.media;
    const video = previews.get(`${p.uid}:videoUrl`) || p.videoUrl;
    const yt = youtubeId(video);
    if (poster) return `<img src="${esc(poster)}" alt="Preview"${style}>`;
    if (p.type === 'video' && yt) return `<img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt="YouTube preview"${style}>`;
    if (p.type === 'video' && video) return `<video src="${esc(video)}#t=0.1" muted controls preload="metadata"${style}></video>`;
    return '<div class="no-preview">No preview yet</div>';
  }

  function resolutionHTML(p) {
    const custom = isCustomRes(p), res = parseRes(p.resolution) || [1920, 1080], hasRes = p.resolution !== 'auto' || custom;
    const options = `<option value="auto" ${p.resolution === 'auto' && !custom ? 'selected' : ''}>Auto — match the media</option>`
      + PRESETS.map(([v, label]) => `<option value="${v}" ${p.resolution === v && !custom ? 'selected' : ''}>${label}</option>`).join('')
      + `<option value="custom" ${custom ? 'selected' : ''}>Custom…</option>`;
    return `<div class="field wide"><span>Resolution</span>
      <div class="media-row"><select data-resolution>${options}</select><button class="ghost" data-flip title="Swap width and height (landscape ⇄ vertical)" ${hasRes ? '' : 'disabled'}>⇄ Flip</button></div>
      <div class="custom-res" ${custom ? '' : 'hidden'}><input type="number" min="16" max="20000" data-res-w value="${res[0]}" aria-label="Width in pixels"><b>×</b><input type="number" min="16" max="20000" data-res-h value="${res[1]}" aria-label="Height in pixels"><em>px</em></div>
      <div class="fit-row" ${hasRes ? '' : 'hidden'}>
        <label><span>Resize method</span><select data-fit-method><option value="scale" ${p.fit === 'scale' ? 'selected' : ''}>Scale — upscale / downscale to fit, nothing cut off</option><option value="crop" ${p.fit !== 'scale' ? 'selected' : ''}>Crop — frame is exactly this resolution</option></select></label>
        <label ${p.fit === 'scale' ? 'hidden' : ''}><span>Crop style</span><select data-fit-crop><option value="fill" ${p.fit === 'fill' ? 'selected' : ''}>Fill — keep proportions, trim the overflow</option><option value="stretch" ${p.fit === 'stretch' ? 'selected' : ''}>Stretch — distort to fill exactly</option></select></label>
      </div>
      <small>Auto uses the image/video's own shape. Pick a resolution to give the card and the viewer that shape. Use ⇄ Flip for vertical.</small></div>`;
  }

  const scaleHint = p => `≈ ${Math.round(state.layout.cardWidth * p.scale / 100)} px wide on the Work page. 100% = the base card width in Layout above; every project is sized from that same base, so equal percentages always look equal.`;

  function extraRow(x, i) {
    return `<div class="extra-row" data-i="${i}">
      <select data-extra-kind><option value="image" ${x.kind === 'image' ? 'selected' : ''}>Image</option><option value="video" ${x.kind === 'video' ? 'selected' : ''}>Video</option></select>
      <input data-extra-src value="${esc(x.src)}" placeholder="${x.kind === 'video' ? 'YouTube URL or content/my-video.mp4' : 'content/my-image.webp'}">
      <button class="ghost" data-pick-extra>Choose file</button><button class="ghost" data-extra-move="up">↑</button><button class="ghost" data-extra-move="down">↓</button><button class="danger" data-extra-remove title="Remove this item">×</button>
      ${x.kind === 'video' ? `<input class="poster" data-extra-poster value="${esc(x.poster)}" placeholder="Thumbnail for this video (optional) — content/poster.webp">` : ''}</div>`;
  }

  function projectHTML(p) {
    const collections = state.collections;
    return `<article class="project" data-uid="${p.uid}"><div>
      <div class="project-head"><h3>#${p.rank} — <span data-heading>${esc(p.title || 'Untitled')}</span></h3>
        <div class="buttons"><button class="ghost" data-move="up">↑</button><button class="ghost" data-move="down">↓</button><button class="ghost" data-duplicate>Duplicate</button><button class="danger" data-remove>Remove</button></div></div>
      <div class="grid">
        ${field('Project ID (unique)', 'id', p.id)}${field('Rank', 'rank', p.rank, '', 'number')}${field('Title', 'title', p.title)}${field('Year', 'year', p.year || '')}
        <label class="field"><span>Media kind</span><select data-key="type"><option value="image" ${p.type === 'image' ? 'selected' : ''}>Image</option><option value="video" ${p.type === 'video' ? 'selected' : ''}>Video</option></select></label>
        ${field('Accent', 'accent', p.accent || 'red')}
        <div class="field wide"><span>Thumbnail / image path</span><div class="media-row"><input data-key="media" value="${esc(p.media)}" placeholder="content/my-poster.webp"><button class="ghost" data-pick="media">Choose image</button></div></div>
        <div class="field wide"><span>Video URL / video file path</span><div class="media-row"><input data-key="videoUrl" value="${esc(p.videoUrl)}" placeholder="YouTube URL or content/my-video.mp4"><button class="ghost" data-pick="videoUrl">Choose video</button></div></div>
        <div class="field wide"><span>Card thumbnail (what shows on the page before opening)</span>
          <select data-key="thumbMode"><option value="auto" ${p.thumbMode === 'auto' ? 'selected' : ''}>Auto — image / poster, YouTube thumbnail, or first video frame</option><option value="custom" ${p.thumbMode === 'custom' ? 'selected' : ''}>Custom image — a separate picture just for the card</option><option value="none" ${p.thumbMode === 'none' ? 'selected' : ''}>None — title card only, no picture</option></select>
          <div class="media-row" ${p.thumbMode === 'custom' ? '' : 'hidden'}><input data-key="thumb" value="${esc(p.thumb)}" placeholder="content/my-thumbnail.webp"><button class="ghost" data-pick="thumb">Choose image</button></div></div>
        <div class="field wide"><span>More media — carousel (optional)</span>
          <div class="extras">${p.extra.map(extraRow).join('') || '<em class="muted">None. The main image/video above is item 1; add more to make a carousel.</em>'}</div>
          <div class="buttons"><button class="ghost" data-add-extra="image">+ Add image</button><button class="ghost" data-add-extra="video">+ Add video</button></div></div>
        ${resolutionHTML(p)}
        <div class="field wide"><span>Size in the Work grid</span><div class="scale-row"><input type="number" min="20" max="300" step="5" data-key="scale" value="${p.scale}"><em>%</em>${[50, 75, 100, 125, 150, 200].map(n => `<button class="ghost" data-scale-preset="${n}">${n}%</button>`).join('')}</div><small data-scale-hint>${scaleHint(p)}</small></div>
        <div class="field wide"><span>Tags</span><div class="tag-row">${p.tags.map(t => `<span class="chip">${esc(title(t))}<button data-remove-tag="${esc(t)}" title="Remove tag from this project">×</button></span>`).join('') || '<em class="muted">none</em>'}</div>
          <div class="media-row"><input list="known-tags" data-new-tag placeholder="Type an existing or new tag, then Add"><button class="ghost" data-add-tag>Add tag</button></div></div>
        <div class="field wide"><span>Collections</span><div class="check-row">${collections.map(c => `<label class="check"><input type="checkbox" data-collection="${esc(c.id)}" ${p.collectionIds.includes(c.id) ? 'checked' : ''}> <span data-coll-label="${esc(c.id)}">${esc(c.title)}</span></label>`).join('') || '<em class="muted">No collections yet — create one below.</em>'}</div>
          <div class="media-row"><input data-new-collection-name placeholder="New collection name"><button class="ghost" data-add-collection>+ Collection</button></div></div>
        ${area('Description', 'description', p.description || '', 'wide')}${area('Credits (leave empty to hide)', 'credits', p.credits || '')}
      </div></div><aside class="preview" data-preview>${previewHTML(p)}</aside></article>`;
  }

  const STYLE = `body{margin:0;background:#101011;color:#f5f1e9;font:14px ui-monospace,Consolas,monospace}.wrap{max-width:1240px;margin:auto;padding:32px 20px 110px}h1,h2,h3{font-family:Impact,'Arial Black',sans-serif;letter-spacing:-.03em}h1{font-size:clamp(38px,6vw,70px);color:#e8272e;margin:0}h2{border-top:2px solid #f5f1e9;margin:42px 0 12px;padding-top:25px;font-size:30px}.note{line-height:1.65;color:#c6c1bd;max-width:850px}.muted{color:#888;font-style:normal}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.field{display:block}.field.wide{grid-column:span 2}.field>span,.label,.fit-row span{display:block;font-size:10px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;margin:12px 0 5px;color:#d6d0cc}input,textarea,select{width:100%;box-sizing:border-box;background:#222;color:#fff;border:1px solid #555;padding:10px;font:13px ui-monospace,Consolas,monospace}input[type=checkbox]{width:auto}textarea{min-height:80px;resize:vertical}button{border:0;background:#e8272e;color:#fff;padding:9px 12px;font:700 12px ui-monospace,monospace;cursor:pointer}button:hover{filter:brightness(1.18)}button:disabled{opacity:.35;cursor:not-allowed}button.ghost{background:#3a3939}button.danger{background:#79252a}.buttons{display:flex;gap:7px;flex-wrap:wrap}.project{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:18px;background:#1b1b1d;border-left:6px solid #e8272e;padding:16px;margin:18px 0}.project-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.project h3{margin:0;font-size:19px}.preview{align-self:start;background:#090909;display:grid;place-items:center;overflow:hidden}.preview img,.preview video{width:100%;height:auto;display:block}.no-preview{color:#888;text-align:center;padding:40px 15px}.media-row{display:grid;grid-template-columns:1fr auto;gap:7px;align-items:end;margin-top:6px}.tag-row,.check-row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.chip{background:#f4d21f;color:#111;padding:5px 7px;font-size:11px;font-weight:bold}.chip small{opacity:.7;font-weight:normal}.chip button{background:transparent;color:#111;padding:0 0 0 6px;font-size:13px}.check{display:flex;align-items:center;gap:6px;background:#2a2a2c;padding:6px 10px;font-size:12px}.custom-res{display:flex;gap:8px;align-items:center;margin-top:7px}.media-row[hidden],.custom-res[hidden],.fit-row[hidden],.fit-row label[hidden]{display:none}.custom-res input{width:110px}.custom-res em{color:#999;font-style:normal}.fit-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}.field small{display:block;color:#a09a96;margin-top:6px;font-size:11px;line-height:1.5}.scale-row{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap}.scale-row input{width:100px}.scale-row em{color:#999;font-style:normal;margin-right:8px}.extra-row{display:grid;grid-template-columns:96px 1fr auto auto auto auto;gap:6px;margin:6px 0;align-items:center}.extra-row .poster{grid-column:2 / -1}.add-collection{display:flex;gap:7px;max-width:520px;margin:10px 0}.coll-row{display:grid;grid-template-columns:64px 1fr auto auto 110px auto;gap:8px;align-items:center;background:#1b1b1d;padding:8px 10px;margin:6px 0;border-left:4px solid #f4d21f}.coll-row input[type=number]{width:64px}.sticky{position:fixed;z-index:5;bottom:0;left:0;right:0;background:#101011ee;border-top:1px solid #555;padding:14px max(20px,calc((100vw - 1200px)/2));display:flex;justify-content:space-between;gap:12px;align-items:center}.status{color:#f4d21f;font-size:12px}@media(max-width:760px){.grid,.fit-row{grid-template-columns:1fr}.field.wide{grid-column:auto}.project{grid-template-columns:1fr}.preview{max-width:360px}.coll-row{grid-template-columns:64px 1fr auto auto}.sticky{align-items:flex-start;flex-direction:column}}`;

  function render() {
    const scroll = scrollY;
    renumber(); renumberCollections();
    const a = state.artist, social = name => a.socials?.find(s => s.label === name)?.url || '';
    const usage = id => state.projects.filter(p => p.collectionIds.includes(id)).length;
    $('#app').innerHTML = `<main class="wrap"><h1>CONTENT // CONTROL</h1>
      <p class="note">Everything here exports to one file used by both the homepage and the Work page. Files picked with the chooser are stored as <code>content/filename.ext</code>, so keep the real file in your site's <code>content</code> folder before publishing.</p>
      <section data-artist-section><h2>Artist information</h2><div class="grid">${field('Name', 'name', a.name || '')}${field('Role / strapline', 'role', a.role || '', 'wide')}${field('Email', 'email', a.email || '')}${area('Biography', 'bio', a.bio || '', 'wide')}${field('Instagram URL', 'instagram', social('Instagram'))}${field('YouTube URL', 'youtube', social('YouTube'))}</div></section>
      <section><h2>Layout</h2><p class="note">Work-page cards are left-aligned and wrap. This is the width of a card at 100%; set each project's own size below. Change it here to make the whole grid bigger or smaller.</p>
        <div class="scale-row"><input type="number" id="layout-width" min="160" max="900" step="10" value="${state.layout.cardWidth}"><em>px base card width</em></div></section>
      <section><h2>Collections</h2><p class="note">Collections become buttons on the Work page, in this order (rank 1 first). Rename, reorder or delete them here; tick them inside each project.</p>
        <div id="collections">${state.collections.map(c => `<div class="coll-row" data-cid="${esc(c.id)}"><input type="number" min="1" data-coll-rank value="${c.rank}" title="Rank"><input data-coll-title value="${esc(c.title)}"><button class="ghost" data-coll-move="up">↑</button><button class="ghost" data-coll-move="down">↓</button><span class="muted">${usage(c.id)} project${usage(c.id) === 1 ? '' : 's'}</span><button class="danger" data-delete-collection="${esc(c.id)}">Delete</button></div>`).join('') || '<em class="muted">No collections yet.</em>'}</div>
        <div class="add-collection"><input id="new-collection" placeholder="New collection name"><button data-add-collection-top>+ New collection</button></div></section>
      <section><h2>Tags</h2><p class="note">Tags appear in the Work page's filter dropdown. Deleting a tag here removes it from every project.</p>
        <div class="tag-row">${allTags().map(t => `<span class="chip">${esc(title(t))} <small>(${state.projects.filter(p => p.tags.includes(t)).length})</small><button data-delete-tag="${esc(t)}" title="Delete this tag everywhere">×</button></span>`).join('') || '<em class="muted">No tags yet — add them inside a project.</em>'}</div></section>
      <section><h2>Projects / ranking</h2><p class="note">Rank 1 appears first. Tags become Work page filters automatically.</p>
        <datalist id="known-tags">${allTags().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
        <div id="projects">${state.projects.map(projectHTML).join('')}</div><button data-add>+ Add project</button></section></main><input id="picker" type="file" hidden>`;
    scrollTo(0, scroll);
  }

  function renderBar() {
    $('#bar').innerHTML = `<div class="sticky"><span id="status" class="status">Ready. Nothing is saved until you export.</span><div class="buttons"><button class="ghost" data-reset>Reset to loaded content</button><button data-export>Download content-data.js</button></div></div>`;
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
      const p = byUid(card.dataset.uid); if (!p) return;
      $$('.grid > .field [data-key], .grid > label [data-key]', card).forEach(el => { const k = el.dataset.key; p[k] = k === 'rank' ? (Number(el.value) || 999) : k === 'scale' ? clampScale(el.value) : el.value; });
      p.id = slug(p.id) || p.id || uniqueId('project');
      p.media = publicPath(p.media); p.videoUrl = publicPath(p.videoUrl); p.thumb = publicPath(p.thumb);
      p.collectionIds = $$('[data-collection]', card).filter(c => c.checked).map(c => c.dataset.collection);
      p.extra = $$('.extra-row', card).map(row => ({ kind: $('[data-extra-kind]', row).value === 'video' ? 'video' : 'image', src: publicPath($('[data-extra-src]', row).value), poster: publicPath($('[data-extra-poster]', row)?.value || '') }));
      const sel = $('[data-resolution]', card);
      if (sel) {
        if (sel.value === 'custom') { const w = Number($('[data-res-w]', card).value), h = Number($('[data-res-h]', card).value); p.resolution = w >= 16 && h >= 16 ? `${Math.round(w)}x${Math.round(h)}` : 'auto'; }
        else p.resolution = sel.value;
        p.fit = $('[data-fit-method]', card).value === 'scale' ? 'scale' : $('[data-fit-crop]', card).value;
      }
    });
  }
  const refreshCard = card => { const p = byUid(card.dataset.uid); $('[data-preview]', card).innerHTML = previewHTML(p); $('[data-heading]', card).textContent = p.title || 'Untitled'; };

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t = e.target, project = t.closest('.project'), p = project ? byUid(project.dataset.uid) : null;

    if (t.closest('[data-add]')) { sync(); state.projects.push({ uid: ++uidCounter, id: uniqueId('new-project'), rank: state.projects.length + 1, title: 'NEW PROJECT', year: String(new Date().getFullYear()), type: 'image', resolution: 'auto', fit: 'fill', scale: 100, thumbMode: 'auto', thumb: '', extra: [], tags: [], collectionIds: [], description: '', credits: '', media: '', videoUrl: '', accent: 'red' }); render(); return; }
    if (t.closest('[data-reset]')) { state = structuredClone(original); previews.clear(); customMode.clear(); render(); status('Reset to the content you loaded.'); return; }
    if (t.closest('[data-export]')) {
      try {
        sync(); renumber(); renumberCollections();
        const output = {
          layout: state.layout,
          artist: state.artist,
          collections: state.collections.map(c => ({ id: c.id, title: c.title, description: c.description, rank: c.rank })),
          projects: state.projects.map(({ uid, ratio, frameRatio, ...rest }) => ({ ...rest, extra: (rest.extra || []).filter(x => x.src) }))
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
      const input = project ? $('[data-new-collection-name]', project) : $('#new-collection'), name = input.value.trim();
      if (!name) { input.focus(); status('Type a collection name first.'); return; }
      let id = slug(name) || 'collection', n = 2; const base = id;
      const existing = state.collections.find(c => c.id === id || c.title.toLowerCase() === name.toLowerCase());
      if (existing) id = existing.id; else { while (state.collections.some(c => c.id === id)) id = `${base}-${n++}`; state.collections.push({ id, title: name, description: '', rank: state.collections.length + 1 }); }
      if (p && !p.collectionIds.includes(id)) p.collectionIds.push(id);
      render(); status(`Collection "${name}" ${existing ? 'selected' : 'created'}.`); return;
    }
    const del = t.closest('[data-delete-collection]');
    if (del) { sync(); const id = del.dataset.deleteCollection, c = state.collections.find(x => x.id === id); state.collections = state.collections.filter(x => x.id !== id); state.projects.forEach(x => { x.collectionIds = x.collectionIds.filter(k => k !== id); }); render(); status(`Deleted collection "${c?.title || id}".`); return; }
    const cmove = t.closest('[data-coll-move]');
    if (cmove) { sync(); const row = cmove.closest('.coll-row'), i = state.collections.findIndex(c => c.id === row.dataset.cid), j = i + (cmove.dataset.collMove === 'up' ? -1 : 1); if (state.collections[j]) [state.collections[i], state.collections[j]] = [state.collections[j], state.collections[i]]; render(); return; }
    /* tags (global) */
    const delTag = t.closest('[data-delete-tag]');
    if (delTag) { sync(); const tag = delTag.dataset.deleteTag; state.projects.forEach(x => { x.tags = x.tags.filter(k => k !== tag); }); render(); status(`Deleted tag "${title(tag)}" from every project.`); return; }

    if (!project || !p) return;
    const preset = t.closest('[data-scale-preset]');
    if (preset) { $('[data-key="scale"]', project).value = preset.dataset.scalePreset; sync(); $('[data-scale-hint]', project).textContent = scaleHint(p); status('Edited — export when ready.'); return; }
    if (t.closest('[data-pick]')) { sync(); pickTarget = { uid: p.uid, key: t.closest('[data-pick]').dataset.pick }; const picker = $('#picker'); picker.accept = pickTarget.key === 'videoUrl' ? 'video/*' : 'image/*'; picker.click(); return; }
    if (t.closest('[data-pick-extra]')) { sync(); const row = t.closest('.extra-row'), i = Number(row.dataset.i); pickTarget = { uid: p.uid, extra: i }; const picker = $('#picker'); picker.accept = p.extra[i].kind === 'video' ? 'video/*' : 'image/*'; picker.click(); return; }
    if (t.closest('[data-add-extra]')) { sync(); p.extra.push({ kind: t.closest('[data-add-extra]').dataset.addExtra, src: '', poster: '' }); render(); return; }
    if (t.closest('[data-extra-remove]')) { sync(); p.extra.splice(Number(t.closest('.extra-row').dataset.i), 1); render(); return; }
    if (t.closest('[data-extra-move]')) { sync(); const i = Number(t.closest('.extra-row').dataset.i), j = i + (t.closest('[data-extra-move]').dataset.extraMove === 'up' ? -1 : 1); if (p.extra[j]) [p.extra[i], p.extra[j]] = [p.extra[j], p.extra[i]]; render(); return; }
    if (t.closest('[data-flip]')) { sync(); const r = parseRes(p.resolution); if (r) { p.resolution = `${r[1]}x${r[0]}`; render(); status(`Flipped to ${r[1]} × ${r[0]}.`); } else status('Pick a resolution first, then flip it.'); return; }
    if (t.closest('[data-add-tag]')) { sync(); const input = $('[data-new-tag]', project); p.tags = [...new Set([...p.tags, ...input.value.split(',').map(slug).filter(Boolean)])]; render(); return; }
    if (t.closest('[data-remove-tag]')) { sync(); const tag = t.closest('[data-remove-tag]').dataset.removeTag; p.tags = p.tags.filter(x => x !== tag); render(); return; }
    if (t.closest('[data-duplicate]')) { sync(); const clone = structuredClone(p); clone.uid = ++uidCounter; clone.id = uniqueId(`${p.id}-copy`); clone.title = `${p.title} (Copy)`; clone.rank = p.rank + .5; state.projects.push(clone); render(); return; }
    if (t.closest('[data-remove]')) { sync(); state.projects = state.projects.filter(x => x !== p); render(); return; }
    if (t.closest('[data-move]')) { sync(); renumber(); const i = state.projects.indexOf(p), j = i + (t.closest('[data-move]').dataset.move === 'up' ? -1 : 1); if (state.projects[j]) { [state.projects[i], state.projects[j]] = [state.projects[j], state.projects[i]]; state.projects.forEach((x, k) => { x.rank = k + 1; }); } render(); }
  });

  document.addEventListener('input', e => {
    if (!e.target.closest('main')) return;
    sync(); status('Edited — export when ready.');
    if (e.target.matches('[data-key="scale"],#layout-width')) $$('.project').forEach(c => { const q = byUid(c.dataset.uid); if (q) $('[data-scale-hint]', c).textContent = scaleHint(q); });
    const card = e.target.closest('.project'); if (card && e.target.matches('[data-key="title"]')) $('[data-heading]', card).textContent = e.target.value || 'Untitled';
    if (e.target.matches('[data-coll-title]')) { const id = e.target.closest('.coll-row').dataset.cid; $$(`[data-coll-label="${CSS.escape(id)}"]`).forEach(s => { s.textContent = e.target.value; }); }
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
    const p = byUid(card.dataset.uid);
    if (t.matches('[data-resolution]')) {
      if (t.value === 'custom') { customMode.add(p.uid); if (p.resolution === 'auto') p.resolution = '1920x1080'; }
      else customMode.delete(p.uid);
      sync(); render(); return;
    }
    if (t.matches('[data-fit-method],[data-fit-crop]')) { sync(); render(); return; }
    if (t.matches('[data-res-w],[data-res-h]')) { sync(); refreshCard(card); return; }
    if (t.matches('[data-extra-kind]')) { sync(); render(); return; }
    if (t.matches('[data-key="rank"]')) { sync(); const wanted = p.rank; state.projects = state.projects.filter(x => x !== p); state.projects.sort((a, b) => a.rank - b.rank); state.projects.splice(Math.min(Math.max(wanted, 1), state.projects.length + 1) - 1, 0, p); renumber(); render(); return; }
    if (t.matches('[data-key="type"],[data-key="thumbMode"],[data-collection]')) { sync(); render(); return; }
    if (t.matches('[data-key="media"],[data-key="videoUrl"],[data-key="thumb"]')) { sync(); previews.delete(`${p.uid}:${t.dataset.key}`); refreshCard(card); return; }
    if (t.matches('[data-key]')) { sync(); refreshCard(card); }
  });

  const style = document.createElement('style'); style.textContent = STYLE; document.head.append(style);
  renderBar(); render();
})();

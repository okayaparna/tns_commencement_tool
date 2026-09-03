// Declarative control builder for the right-hand panel.
export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
export const setPath = (obj, path, value) => {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (a == null ? v : b == null ? v : Math.min(b, Math.max(a, v)));

export function buildControls(container, groups, ctx) {
  container.innerHTML = '';
  const refreshers = [];
  for (const g of groups) {
    const box = el('div', 'group');
    const h = el('h3', null, g.title);
    h.addEventListener('click', () => box.classList.toggle('collapsed'));
    if (g.collapsed) box.classList.add('collapsed');
    const list = el('div', 'ctrls');
    box.append(h, list);
    container.appendChild(box);
    for (const c of g.controls) {
      const { row, refresh } = makeRow(c, ctx);
      list.appendChild(row);
      refreshers.push(() => {
        const s = ctx.getState();
        const vis = !c.when || c.when(s);
        row.hidden = !vis;
        if (vis) refresh(s);
      });
    }
    refreshers.push(() => { box.hidden = !!g.when && !g.when(ctx.getState()); });
  }
  const refresh = () => refreshers.forEach(f => f());
  refresh();
  return { refresh };
}

// One labelled row. Field rows carry their label inside the box, so they skip the label column.
function makeRow(c, ctx) {
  const bare = ['fields', 'note', 'sublabel', 'textarea'].includes(c.type) || c.wide;
  const row = el('div', 'ctrl' + (bare ? ' wide' : ''));
  if (!bare && (c.type !== 'textarea' || c.label)) row.appendChild(el('label', null, c.label));
  const input = makeInput(c, ctx);
  row.appendChild(input.node);
  return { row, refresh: input.refresh };
}

function makeInput(c, ctx) {
  const write = v => (c.onSet ? c.onSet(v, ctx) : ctx.set(c.path, v, c));
  const read = s => (c.get ? c.get(s) : getPath(s, c.path));
  switch (c.type) {
    case 'range': {
      const wrap = el('div', 'range');
      const r = el('input'); r.type = 'range'; r.min = c.min; r.max = c.max; r.step = c.step ?? 0.01;
      const v = el('input', 'val'); v.type = 'text';
      const fmt = x => (c.fmt ? c.fmt(x) : Number(x).toFixed(c.decimals ?? (c.step >= 1 ? 0 : 2)));
      r.addEventListener('input', () => { write(parseFloat(r.value)); v.value = fmt(r.value); });
      v.addEventListener('change', () => { const n = parseFloat(v.value); if (!isNaN(n)) { write(n); r.value = n; v.value = fmt(n); } });
      wrap.append(r, v);
      return { node: wrap, refresh: s => { const x = read(s); r.value = x; if (document.activeElement !== v) v.value = fmt(x); } };
    }
    case 'select': return makeSelect(c, read, write);
    case 'field': return makeField(c, read, write);
    // A row of compact controls sharing one line, each optionally captioned above —
    // the shape of Figma's Typography and Position sections.
    case 'fields': {
      const wrap = el('div', 'fieldrow');
      wrap.style.gridTemplateColumns = c.cols || `repeat(${c.items.length}, minmax(0, 1fr))`;
      const kids = c.items.map(item => {
        const cell = el('div', 'fcell');
        if (item.label) cell.appendChild(el('span', 'flabel', item.label));
        const made = makeInput(item, ctx);
        cell.appendChild(made.node);
        wrap.appendChild(cell);
        return { item, made, cell };
      });
      return { node: wrap, refresh: s => kids.forEach(({ item, made, cell }) => {
        const vis = !item.when || item.when(s);
        cell.hidden = !vis;
        if (vis) made.refresh(s);
      }) };
    }
    // Section caption, e.g. the word "Alignment" over a pair of icon groups.
    case 'sublabel': return { node: el('span', 'flabel solo', c.text), refresh: () => {} };
    // A bare chevron that drops a list of preset values into the field beside it.
    case 'presets': {
      const sel = el('select', 'chev');
      const fill = st => {
        sel.innerHTML = '';
        sel.appendChild(el('option', null, ''));
        for (const p of (typeof c.presets === 'function' ? c.presets(st) : c.presets)) {
          const o = el('option', null, p.label); o.value = p.value; sel.appendChild(o);
        }
        sel.value = '';
      };
      fill(ctx.getState());
      sel.addEventListener('change', () => { if (sel.value !== '') { write(parseFloat(sel.value)); sel.value = ''; } });
      return { node: sel, refresh: st => fill(st) };
    }
    case 'seg': {
      const wrap = el('div', 'seg');
      const btns = c.options.map(o => { const b = el('button', null, o.label ?? o); b.type = 'button'; b.title = o.title || ''; b.addEventListener('click', () => write(o.value ?? o)); wrap.appendChild(b); return [o.value ?? o, b]; });
      return { node: wrap, refresh: s => { const cur = read(s); btns.forEach(([v, b]) => b.classList.toggle('active', v === cur)); } };
    }
    // Icon segments: the same control, drawn as pictures.
    case 'iconseg': {
      const wrap = el('div', 'seg icons');
      const btns = c.options.map(o => {
        const b = el('button'); b.type = 'button'; b.title = o.title || ''; b.innerHTML = o.icon;
        b.addEventListener('click', () => write(o.value));
        wrap.appendChild(b); return [o.value, b];
      });
      return { node: wrap, refresh: s => { const cur = read(s); btns.forEach(([v, b]) => b.classList.toggle('active', v === cur)); } };
    }
    case 'checkbox': {
      const i = el('input'); i.type = 'checkbox';
      i.addEventListener('change', () => write(i.checked));
      return { node: i, refresh: s => { i.checked = !!read(s); } };
    }
    case 'color': {
      const i = el('input'); i.type = 'color';
      i.addEventListener('input', () => write(i.value));
      return { node: i, refresh: s => { i.value = read(s); } };
    }
    case 'text': {
      const i = el('input'); i.type = 'text';
      i.addEventListener('input', () => write(i.value));
      return { node: i, refresh: s => { if (document.activeElement !== i) i.value = read(s); } };
    }
    case 'textarea': {
      const i = el('textarea'); i.rows = c.rows || 2; i.placeholder = c.placeholder || '';
      i.addEventListener('input', () => write(i.value));
      return { node: i, refresh: s => { if (document.activeElement !== i) i.value = read(s); } };
    }
    case 'note': {
      const n = el('div', 'note', c.text);
      return { node: n, refresh: s => { if (c.render) n.textContent = c.render(s); } };
    }
    case 'buttons': {
      const wrap = el('div', 'seg');
      for (const b of c.buttons) { const btn = el('button', null, b.label); btn.type = 'button'; btn.title = b.title || ''; btn.addEventListener('click', () => b.onClick(ctx)); wrap.appendChild(btn); }
      return { node: wrap, refresh: () => {} };
    }
    case 'file': {
      const lab = el('label', 'file-btn small block', c.label2 || 'Choose file…');
      const i = el('input'); i.type = 'file'; i.accept = c.accept || '*'; i.hidden = true;
      i.addEventListener('change', () => { if (i.files[0]) c.onFile(i.files[0], ctx); i.value = ''; });
      lab.appendChild(i);
      return { node: lab, refresh: () => {} };
    }
  }
  return { node: el('span', null, '?'), refresh: () => {} };
}

function makeSelect(c, read, write) {
  const s = el('select');
  if (c.compact) s.className = 'compact';
  const fill = () => {
    const opts = typeof c.options === 'function' ? c.options() : c.options;
    s.innerHTML = '';
    for (const o of opts) {
      if (o && o.group) {
        const gp = el('optgroup'); gp.label = o.group;
        for (const x of o.options) { const op = el('option', null, x.label ?? x); op.value = x.value ?? x; gp.appendChild(op); }
        s.appendChild(gp);
      } else { const op = el('option', null, o.label ?? o); op.value = o.value ?? o; s.appendChild(op); }
    }
  };
  fill();
  s.addEventListener('change', () => write(c.number ? parseFloat(s.value) : s.value));
  return { node: s, refresh: st => {
    if (typeof c.options === 'function') fill();
    const v = String(read(st));
    // A live axis combination that matches no named instance shows as "Custom".
    if (c.allowCustom && ![...s.options].some(o => o.value === v)) {
      const op = el('option', null, c.customLabel || 'Custom'); op.value = v; s.insertBefore(op, s.firstChild);
    }
    s.value = v;
  } };
}

// A boxed numeric field: type over the value, or drag its icon sideways to scrub —
// the trick that makes Figma's panels feel direct. Arrow keys nudge by one step.
function makeField(c, read, write) {
  const wrap = el('div', 'field');
  wrap.title = c.title || c.label || '';
  // Figma labels some fields with a glyph ("X", "Y") and others with a line icon.
  const ic = el('span', 'ico' + (c.text ? ' glyph' : ''));
  if (c.text) ic.textContent = c.text; else ic.innerHTML = c.icon || '';
  const i = el('input', 'num'); i.type = 'text'; i.inputMode = 'decimal';
  wrap.append(ic, i);

  const step = c.step ?? 1;
  const dec = c.decimals ?? (step >= 1 ? 0 : String(step).split('.')[1]?.length || 2);
  const fmt = x => (c.fmt ? c.fmt(x) : Number(x).toFixed(dec)) + (c.unit || '');
  const parse = str => {
    const n = c.parse ? c.parse(str) : parseFloat(String(str).replace(/[^\d.+-]/g, ''));
    return isNaN(n) ? null : n;
  };
  const commit = v => { const q = clamp(Math.round(v / step) * step, c.min, c.max); write(+q.toFixed(6)); return q; };

  i.addEventListener('change', () => { const n = parse(i.value); if (n != null) i.value = fmt(commit(n)); });
  i.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const n = parse(i.value); if (n == null) return;
    i.value = fmt(commit(n + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
  });

  let scrub = null;
  ic.addEventListener('pointerdown', e => {
    e.preventDefault();
    const n = parse(i.value); if (n == null) return;
    scrub = { x: e.clientX, v: n };
    ic.setPointerCapture(e.pointerId);
    wrap.classList.add('scrubbing');
  });
  ic.addEventListener('pointermove', e => {
    if (!scrub) return;
    const perPx = c.scrub ?? step;
    i.value = fmt(commit(scrub.v + (e.clientX - scrub.x) * perPx * (e.shiftKey ? 0.1 : 1)));
  });
  const stop = () => { scrub = null; wrap.classList.remove('scrubbing'); };
  ic.addEventListener('pointerup', stop); ic.addEventListener('pointercancel', stop);

  return { node: wrap, refresh: s => { if (document.activeElement !== i) i.value = fmt(read(s)); } };
}

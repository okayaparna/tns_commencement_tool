// Declarative control builder for the right-hand panel.
export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
export const setPath = (obj, path, value) => {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

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
    const visibility = [];
    for (const c of g.controls) {
      const row = el('div', 'ctrl' + (c.type === 'textarea' || c.type === 'seg' && c.wide ? ' wide' : ''));
      if (c.type !== 'textarea' || c.label) row.appendChild(el('label', null, c.label));
      const input = makeInput(c, ctx);
      row.appendChild(input.node);
      list.appendChild(row);
      refreshers.push(() => {
        const s = ctx.getState();
        const vis = !c.when || c.when(s);
        row.hidden = !vis;
        if (vis) input.refresh(s);
      });
      visibility.push(() => !c.when || c.when(ctx.getState()));
    }
    refreshers.push(() => { box.hidden = !!g.when && !g.when(ctx.getState()); });
  }
  const refresh = () => refreshers.forEach(f => f());
  refresh();
  return { refresh };
}

function makeInput(c, ctx) {
  const set = v => ctx.set(c.path, v, c);
  switch (c.type) {
    case 'range': {
      const wrap = el('div', 'range');
      const r = el('input'); r.type = 'range'; r.min = c.min; r.max = c.max; r.step = c.step ?? 0.01;
      const v = el('input', 'val'); v.type = 'text';
      const fmt = x => (c.fmt ? c.fmt(x) : Number(x).toFixed(c.decimals ?? (c.step >= 1 ? 0 : 2)));
      r.addEventListener('input', () => { set(parseFloat(r.value)); v.value = fmt(r.value); });
      v.addEventListener('change', () => { const n = parseFloat(v.value); if (!isNaN(n)) { set(n); r.value = n; v.value = fmt(n); } });
      wrap.append(r, v);
      return { node: wrap, refresh: s => { const x = getPath(s, c.path); r.value = x; if (document.activeElement !== v) v.value = fmt(x); } };
    }
    case 'select': {
      const s = el('select');
      const fill = () => {
        const opts = typeof c.options === 'function' ? c.options() : c.options;
        s.innerHTML = '';
        for (const o of opts) { const op = el('option', null, o.label ?? o); op.value = o.value ?? o; s.appendChild(op); }
      };
      fill();
      s.addEventListener('change', () => set(c.number ? parseFloat(s.value) : s.value));
      return { node: s, refresh: st => { if (typeof c.options === 'function') fill(); s.value = getPath(st, c.path); } };
    }
    case 'seg': {
      const wrap = el('div', 'seg');
      const btns = c.options.map(o => { const b = el('button', null, o.label ?? o); b.type = 'button'; b.addEventListener('click', () => set(o.value ?? o)); wrap.appendChild(b); return [o.value ?? o, b]; });
      return { node: wrap, refresh: s => { const cur = getPath(s, c.path); btns.forEach(([v, b]) => b.classList.toggle('active', v === cur)); } };
    }
    case 'checkbox': {
      const i = el('input'); i.type = 'checkbox';
      i.addEventListener('change', () => set(i.checked));
      return { node: i, refresh: s => { i.checked = !!getPath(s, c.path); } };
    }
    case 'color': {
      const i = el('input'); i.type = 'color';
      i.addEventListener('input', () => set(i.value));
      return { node: i, refresh: s => { i.value = getPath(s, c.path); } };
    }
    case 'text': {
      const i = el('input'); i.type = 'text';
      i.addEventListener('input', () => set(i.value));
      return { node: i, refresh: s => { if (document.activeElement !== i) i.value = getPath(s, c.path); } };
    }
    case 'textarea': {
      const i = el('textarea'); i.rows = c.rows || 2; i.placeholder = c.placeholder || '';
      i.addEventListener('input', () => set(i.value));
      return { node: i, refresh: s => { if (document.activeElement !== i) i.value = getPath(s, c.path); } };
    }
    case 'buttons': {
      const wrap = el('div', 'seg');
      for (const b of c.buttons) { const btn = el('button', null, b.label); btn.type = 'button'; btn.addEventListener('click', () => b.onClick(ctx)); wrap.appendChild(btn); }
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

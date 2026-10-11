// PriceBuddy Companion — "Add to existing product": the split Track button and
// the searchable product picker behind it.
//
// Pulled out of panel.js, which is already doing too much. Nothing here talks to
// the network or holds state beyond one picker's lifetime: the panel passes in
// its `el`/`thumb` helpers, a `search(query)` that resolves to product options,
// and an `onSubmit(product)` that does the actual attach. Filtering and request
// shaping live in viewmodels.js, where they're tested.
//
// Loaded after viewmodels.js and before panel.js; exposes `window.PBAttach`.

(() => {
  if (window.PBAttach) {
    return;
  }

  const SEARCH_DEBOUNCE_MS = 250;

  // A primary action with a ▾ beside it for the alternatives. The menu closes on
  // pick, Escape, or focus leaving the control — the last covers clicking
  // anywhere else in the panel without a document-level listener.
  function splitButton({ el, label, icon, variant, onPrimary, items }) {
    const main = el('button', { className: `pb-btn ${variant} pb-split-main` }, [
      el('span', { className: 'pb-btn-icon', textContent: icon }),
      document.createTextNode(` ${label}`),
    ]);
    main.addEventListener('click', onPrimary);

    const toggle = el('button', {
      className: `pb-btn ${variant} pb-split-toggle`,
      textContent: '▾',
      title: 'More ways to track',
    });
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');

    const menu = el('div', { className: 'pb-split-menu', hidden: true });
    menu.setAttribute('role', 'menu');

    const wrap = el('div', { className: 'pb-split' }, [main, toggle, menu]);

    function setOpen(open) {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    }

    for (const item of items) {
      const b = el('button', { className: 'pb-split-item', textContent: item.label });
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => {
        setOpen(false);
        item.onSelect();
      });
      menu.append(b);
    }

    toggle.addEventListener('click', () => {
      setOpen(menu.hidden);
      if (!menu.hidden) {
        menu.firstChild.focus();
      }
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        e.stopPropagation();
        setOpen(false);
        toggle.focus();
      }
    });
    wrap.addEventListener('focusout', (e) => {
      if (!wrap.contains(e.relatedTarget)) {
        setOpen(false);
      }
    });

    return wrap;
  }

  // `search(query)` resolves to `{ok, options, note?, error?}`; `onSubmit(product)`
  // resolves truthy on success. On failure the picker stays open with the
  // selection intact so the user can retry.
  function picker({ el, thumb, search, onSubmit, onCancel }) {
    let selected = null;
    let seq = 0;
    let debounce = null;

    const input = el('input', {
      className: 'pb-input pb-attach-search',
      type: 'search',
      placeholder: 'Search your products…',
      autocomplete: 'off',
    });
    input.setAttribute('aria-label', 'Search your products');

    const note = el('div', { className: 'pb-attach-note' });
    const list = el('div', { className: 'pb-attach-list' });
    list.setAttribute('role', 'listbox');

    const submit = el('button', {
      className: 'pb-btn pb-btn-primary pb-btn-grow',
      textContent: '+ Add to existing product',
      disabled: true,
    });
    const cancel = el('button', { className: 'pb-btn pb-btn-soft', textContent: 'Cancel' });
    cancel.addEventListener('click', onCancel);

    function message(text) {
      list.innerHTML = '';
      list.append(el('div', { className: 'pb-attach-empty', textContent: text }));
    }

    function select(option, row) {
      selected = option;
      for (const r of list.children) {
        r.setAttribute('aria-selected', String(r === row));
      }
      submit.disabled = false;
    }

    function renderOptions(options) {
      list.innerHTML = '';
      // A selection that the new query filtered out would be invisible, so
      // dropping it is less surprising than submitting something off-screen.
      if (selected && !options.some((o) => o.id === selected.id)) {
        selected = null;
        submit.disabled = true;
      }
      if (!options.length) {
        message('No products match.');
        return;
      }
      for (const option of options) {
        const row = el('button', { className: 'pb-attach-opt' }, [
          thumb(option.image, 'xs'),
          el('span', { className: 'pb-attach-title', textContent: option.title }),
        ]);
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(!!selected && selected.id === option.id));
        row.addEventListener('click', () => select(option, row));
        list.append(row);
      }
    }

    // Responses can land out of order while the user types; only the latest
    // query's answer is allowed to render.
    async function run(query) {
      const mine = ++seq;
      const res = await search(query);
      if (mine !== seq) {
        return;
      }
      note.textContent = res.note || '';
      if (!res.ok) {
        message(res.error || 'Couldn’t load your products.');
        return;
      }
      renderOptions(res.options);
    }

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => run(input.value), SEARCH_DEBOUNCE_MS);
    });

    // Arrow keys walk between the search box and the rows; Enter/Space on a row
    // is the native button click.
    function rowsFocusable() {
      return [...list.querySelectorAll('.pb-attach-opt')];
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        const first = rowsFocusable()[0];
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
        return;
      }
      const rows = rowsFocusable();
      const i = rows.indexOf(e.target);
      if (i === -1) {
        return;
      }
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? rows[i + 1] : rows[i - 1];
      (next || (e.key === 'ArrowUp' ? input : rows[i])).focus();
    });

    submit.addEventListener('click', async () => {
      if (!selected) {
        return;
      }
      submit.disabled = true;
      cancel.disabled = true;
      submit.textContent = 'Adding…';
      const ok = await onSubmit(selected);
      if (!ok) {
        submit.disabled = !selected;
        cancel.disabled = false;
        submit.textContent = '+ Add to existing product';
      }
    });

    const box = el('div', { className: 'pb-attach' }, [
      el('div', { className: 'pb-attach-head', textContent: 'Add this page to an existing product' }),
      input,
      note,
      list,
      el('div', { className: 'pb-row2' }, [cancel, submit]),
    ]);

    message('Loading your products…');
    run('');
    // Focus once attached, so typing goes straight into the search.
    setTimeout(() => input.focus(), 0);

    return box;
  }

  // Appended to the panel's stylesheet. Theme tokens only — see PANEL_CSS.
  const CSS = `
    .pb-split { position: relative; display: flex; gap: 2px; }
    .pb-split-main { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 12px 0 0 12px; font-weight: 800; }
    .pb-split-toggle { flex: none; width: 40px; padding: 0; border-radius: 0 12px 12px 0; font-size: 12px; }
    .pb-split-menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 2; min-width: 200px; padding: 4px; border-radius: 11px; background: var(--card); border: 1px solid var(--line); box-shadow: 0 8px 24px var(--frame); }
    .pb-split-item { display: block; width: 100%; text-align: left; padding: 9px 10px; border: none; border-radius: 8px; background: none; color: var(--text); font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }
    .pb-split-item:hover, .pb-split-item:focus-visible { background: var(--chip); outline: none; }
    .pb-attach { padding: 14px 16px 6px; display: flex; flex-direction: column; gap: 8px; }
    .pb-attach-head { font: 700 12.5px/1.3 system-ui, sans-serif; color: var(--text); }
    .pb-attach-search { flex: none; width: 100%; box-sizing: border-box; padding: 10px 11px; font-size: 12px; }
    .pb-attach-search:focus { border-color: var(--teal); }
    .pb-attach-note { font: 500 10.5px/1.35 system-ui, sans-serif; color: var(--faint); }
    .pb-attach-note:empty { display: none; }
    .pb-attach-list { max-height: 216px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding: 3px; border-radius: 11px; background: var(--input); border: 1px solid var(--line); }
    .pb-attach-opt { display: flex; align-items: center; gap: 9px; width: 100%; padding: 6px 7px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text); text-align: left; cursor: pointer; }
    .pb-attach-opt:hover, .pb-attach-opt:focus-visible { background: var(--chip); outline: none; }
    .pb-attach-opt[aria-selected="true"] { background: var(--tealdim); border-color: var(--goodln); }
    .pb-attach-title { flex: 1; min-width: 0; font: 600 11.5px/1.3 system-ui, sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pb-thumb-xs { width: 28px; height: 28px; border-radius: 7px; }
    .pb-attach-empty { padding: 14px 8px; text-align: center; font: 500 11.5px/1.3 system-ui, sans-serif; color: var(--muted); }
    .pb-attach .pb-row2 .pb-btn-soft { flex: none; padding: 10px 16px; }
    .pb-attach .pb-row2 .pb-btn-primary { white-space: nowrap; }
    .pb-btn:disabled { opacity: .5; cursor: default; }
  `;

  window.PBAttach = { splitButton, picker, CSS };
})();

/*
 * <quaera-switcher app="lab"> — левый блок шапки семейства Quaera:
 * плитка 22px, «Quaera <Имя акцентом>» и меню из пяти приложений.
 * Без зависимостей, стили на --q-* из tokens.css (у каждого свой запасной цвет).
 * Блок данных между маркерами генерируется scripts/family-sync.mjs из
 * family.json и marks/*.svg; руками его не править.
 *
 * Язык подписей: lang у <quaera-switcher> или у <html>, ru или en.
 */
(function () {
  if (typeof customElements === 'undefined' || customElements.get('quaera-switcher')) return;

  /* @family-data:begin */
  const APPS = [
    {
      "id": "quaera",
      "name": "Quaera",
      "url": "https://quaera.app",
      "purpose": {
        "en": "Trainer: SQL, pandas, DAX and the analyst profession",
        "ru": "Тренажёр: SQL, pandas, DAX и профессия аналитика"
      },
      "accent": {
        "light": "#2563eb",
        "dark": "#6ea8fe",
        "ink": {
          "light": "#ffffff",
          "dark": "#14171d"
        }
      },
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"7\" fill=\"#1f2a40\"/><g transform=\"translate(5.75 3.45)\"><rect x=\"0\" y=\"11\" width=\"4.5\" height=\"6\" rx=\"1.2\" fill=\"#38bdf8\"/><rect x=\"6.5\" y=\"7\" width=\"4.5\" height=\"10\" rx=\"1.2\" fill=\"#818cf8\"/><rect x=\"13\" y=\"3\" width=\"4.5\" height=\"14\" rx=\"1.2\" fill=\"#4ade80\"/><rect x=\"0\" y=\"19.5\" width=\"12\" height=\"2.6\" rx=\"1.3\" fill=\"#fff\"/><rect x=\"13.8\" y=\"19.5\" width=\"4.7\" height=\"2.6\" rx=\"1.3\" fill=\"#fff\" opacity=\"0.4\"/></g></svg>"
    },
    {
      "id": "lab",
      "name": "Quaera Lab",
      "url": "https://lab.quaera.app",
      "purpose": {
        "en": "SQL workbench for your own CSV and Excel files",
        "ru": "SQL-верстак для ваших CSV и Excel"
      },
      "accent": {
        "light": "#15803d",
        "dark": "#4ade80",
        "ink": {
          "light": "#ffffff",
          "dark": "#14171d"
        }
      },
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"7\" fill=\"#15803d\"/><g transform=\"translate(3.2 3.2) scale(.8)\"><ellipse cx=\"16\" cy=\"7\" rx=\"11\" ry=\"4\" fill=\"#fff\"/><path d=\"M5 7v18c0 2.2 4.9 4 11 4s11-1.8 11-4V7\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3\"/><path d=\"M5 16c0 2.2 4.9 4 11 4s11-1.8 11-4\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3\"/></g></svg>"
    },
    {
      "id": "model",
      "name": "Quaera Model",
      "url": "https://model.quaera.app",
      "purpose": {
        "en": "Data modelling: CDM, PDM and SQL",
        "ru": "Моделирование данных: CDM, PDM и SQL"
      },
      "accent": {
        "light": "#c2410c",
        "dark": "#fb923c",
        "ink": {
          "light": "#ffffff",
          "dark": "#14171d"
        }
      },
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"7\" fill=\"#c2410c\"/><rect x=\"7\" y=\"7\" width=\"18\" height=\"18\" rx=\"3\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M7 14h18M7 19.5h18M14 14v11\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M8 8h16v6H8z\" fill=\"#fff\"/></svg>"
    },
    {
      "id": "flow",
      "name": "Quaera Flow",
      "url": "https://flow.quaera.app",
      "purpose": {
        "en": "Business process modelling in BPMN 2.0",
        "ru": "Моделирование процессов в BPMN 2.0"
      },
      "accent": {
        "light": "#0f766e",
        "dark": "#2dd4bf",
        "ink": {
          "light": "#ffffff",
          "dark": "#14171d"
        }
      },
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"7\" fill=\"#0f766e\"/><circle cx=\"7\" cy=\"16\" r=\"3.2\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.8\"/><rect x=\"12\" y=\"11.5\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#fff\"/><path d=\"M10.2 16h1.8M21 16h1.6\" stroke=\"#fff\" stroke-width=\"1.6\"/><path d=\"M26 12.5l3.5 3.5-3.5 3.5-3.5-3.5z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.6\"/></svg>"
    },
    {
      "id": "pandas",
      "name": "Quaera Pandas",
      "url": "https://pandas.quaera.app",
      "purpose": {
        "en": "137 pandas tasks in a Colab notebook",
        "ru": "137 заданий по pandas в тетради Colab"
      },
      "accent": {
        "light": "#7c3aed",
        "dark": "#a78bfa",
        "ink": {
          "light": "#ffffff",
          "dark": "#14171d"
        }
      },
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"7\" fill=\"#7c3aed\"/><rect x=\"7\" y=\"7\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\"/><rect x=\"13.6\" y=\"7\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\"/><rect x=\"20.2\" y=\"7\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\"/><rect x=\"7\" y=\"13.6\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\"/><rect x=\"13.6\" y=\"13.6\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\" opacity=\"0.55\"/><rect x=\"20.2\" y=\"13.6\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\" opacity=\"0.55\"/><rect x=\"7\" y=\"20.2\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\"/><rect x=\"13.6\" y=\"20.2\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\" opacity=\"0.55\"/><rect x=\"20.2\" y=\"20.2\" width=\"4.8\" height=\"4.8\" rx=\"1.2\" fill=\"#fff\" opacity=\"0.55\"/></svg>"
    }
  ];
  /* @family-data:end */

  const CSS = `
    :host { display: inline-block; font-family: var(--q-font-sans, system-ui, sans-serif); font-size: 14px; color: var(--q-text, #1d2330); position: relative; }
    * { box-sizing: border-box; }
    button { font: inherit; color: inherit; background: none; border: 0; margin: 0; cursor: pointer; }
    .trigger { display: inline-flex; align-items: center; gap: 8px; padding: 4px 8px 4px 4px; border-radius: 8px; }
    .trigger:hover { background: var(--q-surface-2, #f1f3f6); }
    .trigger:focus-visible, a:focus-visible { outline: 2px solid var(--tint); outline-offset: 2px; }
    .tile { display: block; width: 22px; height: 22px; flex: none; }
    .tile svg { display: block; width: 100%; height: 100%; }
    .label { font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
    .suffix, .solo { color: var(--tint); }
    .caret { width: 10px; height: 10px; flex: none; color: var(--q-muted, #6b7385); transition: transform .15s; }
    .trigger[aria-expanded='true'] .caret { transform: rotate(180deg); }
    .menu { position: absolute; left: 0; top: calc(100% + 6px); z-index: 1000; min-width: 296px; max-width: min(360px, calc(100vw - 16px)); margin: 0; padding: 6px; list-style: none;
      background: var(--q-surface, #fff); border: 1px solid var(--q-line, #e3e6eb); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .18); }
    .menu[hidden] { display: none; }
    .menu li { margin: 0; }
    .item { display: grid; grid-template-columns: 28px 1fr 16px; align-items: center; column-gap: 10px; padding: 8px; border-radius: 8px; color: inherit; text-decoration: none; }
    .item:hover, .item:focus-visible { background: var(--q-surface-2, #f1f3f6); }
    .item .tile { width: 28px; height: 28px; }
    .name { display: block; font-weight: 600; line-height: 1.25; }
    .purpose { display: block; margin-top: 1px; color: var(--q-muted, #6b7385); font-size: 12.5px; line-height: 1.35; }
    .check { width: 14px; height: 14px; color: var(--tint); }
    .foot { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--q-line, #e3e6eb); }
    .foot a { display: block; padding: 8px; border-radius: 8px; color: var(--q-muted, #6b7385); text-decoration: none; font-size: 12.5px; }
    .foot a:hover, .foot a:focus-visible { background: var(--q-surface-2, #f1f3f6); color: var(--q-text, #1d2330); }
  `;

  const CARET = '<svg class="caret" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHECK = '<svg class="check" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  class QuaeraSwitcher extends HTMLElement {
    static get observedAttributes() { return ['app', 'lang']; }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._onDoc = (e) => { if (!e.composedPath().includes(this)) this._close(false); };
    }

    connectedCallback() { this._render(); }
    disconnectedCallback() { document.removeEventListener('pointerdown', this._onDoc, true); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }

    _lang() {
      const l = (this.getAttribute('lang') || document.documentElement.lang || 'en').toLowerCase();
      return l.startsWith('ru') ? 'ru' : 'en';
    }

    _render() {
      const id = this.getAttribute('app') || 'quaera';
      const cur = APPS.find((a) => a.id === id) || APPS[0];
      const lang = this._lang();
      const short = cur.name === 'Quaera' ? '' : cur.name.replace(/^Quaera\s+/, '');
      const label = short
        ? `Quaera <span class="suffix">${esc(short)}</span>`
        : '<span class="solo">Quaera</span>';
      const items = APPS.map((a) => `
        <li role="none"><a class="item" role="menuitem" href="${esc(a.url)}" target="_blank" rel="noopener"
            style="--tint: var(--q-accent-${a.id}, ${a.accent.light})"${a.id === cur.id ? ' aria-current="true"' : ''}>
          <span class="tile">${a.svg}</span>
          <span><span class="name">${esc(a.name)}</span><span class="purpose">${esc(a.purpose[lang])}</span></span>
          ${a.id === cur.id ? CHECK : '<span></span>'}
        </a></li>`).join('');
      this._root.innerHTML = `
        <style>${CSS}</style>
        <button class="trigger" type="button" aria-haspopup="menu" aria-expanded="false"
            style="--tint: var(--q-accent-${cur.id}, ${cur.accent.light})">
          <span class="tile">${cur.svg}</span><span class="label">${label}</span>${CARET}
        </button>
        <ul class="menu" role="menu" hidden aria-label="Quaera">${items}
          <li role="none" class="foot"><a role="menuitem" href="https://quaera.app" target="_blank" rel="noopener">quaera.app</a></li>
        </ul>`;
      this._btn = this._root.querySelector('.trigger');
      this._menu = this._root.querySelector('.menu');
      this._btn.addEventListener('click', () => (this._menu.hidden ? this._open() : this._close(true)));
      this._btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this._open(e.key === 'ArrowUp' ? -1 : 0); }
      });
      this._menu.addEventListener('keydown', (e) => this._onMenuKey(e));
      this._menu.addEventListener('click', () => this._close(false));
    }

    _links() { return Array.from(this._menu.querySelectorAll('a')); }

    _open(focusAt) {
      this._menu.hidden = false;
      this._btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', this._onDoc, true);
      if (focusAt === undefined) return;
      const links = this._links();
      (focusAt < 0 ? links[links.length - 1] : links[0]).focus();
    }

    _close(refocus) {
      if (this._menu.hidden) return;
      this._menu.hidden = true;
      this._btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', this._onDoc, true);
      if (refocus) this._btn.focus();
    }

    _onMenuKey(e) {
      const links = this._links();
      const i = links.indexOf(this._root.activeElement);
      const go = (n) => { e.preventDefault(); links[(n + links.length) % links.length].focus(); };
      if (e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowUp') go(i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(links.length - 1);
      else if (e.key === 'Escape') { e.preventDefault(); this._close(true); }
      else if (e.key === 'Tab') this._close(false);
    }
  }

  customElements.define('quaera-switcher', QuaeraSwitcher);
})();

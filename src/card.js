/* global MargemFees, MargemDetect */
/**
 * Content script: shows the profit card on Mercado Livre and Shopee product pages.
 * The card lives in a Shadow DOM so the marketplace CSS cannot break it (and vice versa).
 */
(function () {
  if (window.__margemCertaLoaded) return;
  window.__margemCertaLoaded = true;

  const { calculate, priceForMargin, formatBRL, FEES_UPDATED } = MargemFees;
  const { detectMarketplace, itemId, detectPrice } = MargemDetect;

  const state = {
    url: '',
    marketplace: null,
    id: null,
    price: null,
    priceEdited: false,
    product: { cost: '', shipping: '', listingType: 'classico' },
    settings: {},
    collapsed: false,
  };

  let host = null;
  let shadow = null;
  let els = {};
  let detectTimer = null;
  let saveTimer = null;

  // ---------- Storage ----------

  const storageKey = () => `item:${state.marketplace}:${state.id}`;

  async function loadSettings() {
    const { settings } = await chrome.storage.sync.get('settings');
    state.settings = settings || {};
  }

  async function loadProduct() {
    const key = storageKey();
    const data = await chrome.storage.local.get([key, 'cardCollapsed']);
    state.product = { cost: '', shipping: '', listingType: 'classico', ...(data[key] || {}) };
    state.collapsed = Boolean(data.cardCollapsed);
  }

  function saveProduct() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ [storageKey()]: state.product }).catch(() => {});
    }, 300);
  }

  // ---------- UI ----------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .card {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 300px; max-height: calc(100vh - 32px); overflow: auto;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #172033; background: #fff; border: 1px solid #dfe4ee; border-radius: 14px;
      box-shadow: 0 12px 32px rgba(15, 23, 41, 0.18);
    }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #edf0f5; }
    .logo { width: 22px; height: 22px; display: block; }
    .title { font-weight: 700; flex: 1; }
    .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef2f8; color: #5b6780; }
    .icon-btn { border: 0; background: transparent; color: #5b6780; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
    .icon-btn:hover { background: #eef2f8; }
    .body { padding: 10px 12px 12px; }
    .field { display: grid; grid-template-columns: 1fr 112px; align-items: center; gap: 8px; margin-bottom: 6px; }
    .field label { color: #3d4860; }
    .field input, .field select {
      width: 100%; font: inherit; color: #172033; padding: 5px 8px; border: 1px solid #d3dae6; border-radius: 7px; background: #fff;
    }
    .field input:focus, .field select:focus { outline: 2px solid #2b6ff6; outline-offset: 0; border-color: #2b6ff6; }
    .hint { font-size: 11px; color: #6b7690; margin: -2px 0 8px; }
    .rows { margin-top: 10px; border-top: 1px dashed #dfe4ee; padding-top: 8px; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; color: #3d4860; }
    .row span:last-child { font-variant-numeric: tabular-nums; }
    .result { margin-top: 8px; padding: 10px; border-radius: 10px; background: #f0fdf4; }
    .result.loss { background: #fef2f2; }
    .result .label { font-size: 12px; color: #3d4860; }
    .result .value { font-size: 22px; font-weight: 800; color: #15803d; font-variant-numeric: tabular-nums; }
    .result.loss .value { color: #b91c1c; }
    .result .margin { font-size: 12px; font-weight: 600; color: #3d4860; }
    .target { margin-top: 8px; font-size: 12px; color: #3d4860; }
    .target b { color: #172033; }
    .foot { margin-top: 10px; font-size: 11px; color: #6b7690; }
    .pill {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; cursor: pointer;
      font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff;
      background: #15803d; border: 0; border-radius: 999px; padding: 10px 14px; box-shadow: 0 8px 24px rgba(15, 23, 41, 0.25);
    }
    .pill.loss { background: #b91c1c; }
    .hidden { display: none !important; }
  `;

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function moneyInput(id, placeholder) {
    return el('input', { id, type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder });
  }

  function buildUI() {
    host = el('div', { id: 'margem-certa-root' });
    shadow = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    const card = el('section', { class: 'card', 'aria-label': 'Margem Certa' });

    const head = el('div', { class: 'head' });
    head.append(
      el('img', { class: 'logo', src: chrome.runtime.getURL('icons/icon32.png'), alt: '' }),
      el('div', { class: 'title' }, 'Margem Certa'),
    );
    const badge = el('span', { class: 'badge' });
    const collapse = el('button', { class: 'icon-btn', title: 'Minimizar', 'aria-label': 'Minimizar' }, '–');
    head.append(badge, collapse);

    const body = el('div', { class: 'body' });

    const priceField = el('div', { class: 'field' });
    priceField.append(el('label', { for: 'price' }, 'Preço de venda'), moneyInput('price', 'R$'));

    const typeField = el('div', { class: 'field' });
    const select = el('select', { id: 'listingType' });
    select.append(el('option', { value: 'classico' }, 'Clássico'), el('option', { value: 'premium' }, 'Premium'));
    typeField.append(el('label', { for: 'listingType' }, 'Tipo de anúncio'), select);

    const costField = el('div', { class: 'field' });
    costField.append(el('label', { for: 'cost' }, 'Custo do produto'), moneyInput('cost', 'R$ 0,00'));

    const shipField = el('div', { class: 'field' });
    shipField.append(el('label', { for: 'shipping' }, 'Frete pago por você'), moneyInput('shipping', 'R$ 0,00'));
    const shipHint = el('p', { class: 'hint' });

    const rows = el('div', { class: 'rows' });
    const result = el('div', { class: 'result' });
    result.append(el('div', { class: 'label' }, 'Lucro por venda'), el('div', { class: 'value' }), el('div', { class: 'margin' }));
    const target = el('div', { class: 'target' });
    const foot = el('p', { class: 'foot' }, `Estimativa com tarifas de ${FEES_UPDATED}. Confira as taxas da sua categoria. Ajustes no ícone da extensão.`);

    body.append(priceField, typeField, costField, shipField, shipHint, rows, result, target, foot);
    card.append(head, body);

    const pill = el('button', { class: 'pill hidden', title: 'Abrir Margem Certa' });

    shadow.append(card, pill);
    document.documentElement.appendChild(host);

    els = {
      card, pill, badge, collapse, rows, result, target, shipHint, typeField,
      price: shadow.getElementById('price'),
      listingType: select,
      cost: shadow.getElementById('cost'),
      shipping: shadow.getElementById('shipping'),
    };

    els.price.addEventListener('input', () => {
      state.price = els.price.value === '' ? null : Number(els.price.value);
      state.priceEdited = true;
      update();
    });
    els.listingType.addEventListener('change', () => {
      state.product.listingType = els.listingType.value;
      saveProduct();
      update();
    });
    ['cost', 'shipping'].forEach((key) => {
      els[key].addEventListener('input', () => {
        state.product[key] = els[key].value;
        saveProduct();
        update();
      });
    });
    collapse.addEventListener('click', () => setCollapsed(true));
    pill.addEventListener('click', () => setCollapsed(false));
  }

  function setCollapsed(value) {
    state.collapsed = value;
    chrome.storage.local.set({ cardCollapsed: value }).catch(() => {});
    update();
  }

  function row(label, value) {
    const r = el('div', { class: 'row' });
    r.append(el('span', {}, label), el('span', {}, value));
    return r;
  }

  function update() {
    if (!host) return;
    const isMl = state.marketplace === 'ml';
    els.badge.textContent = isMl ? 'Mercado Livre' : 'Shopee';
    els.typeField.classList.toggle('hidden', !isMl);
    els.shipHint.textContent = isMl
      ? 'A partir de R$ 79 o frete grátis é obrigatório e você paga parte dele.'
      : 'Deixe 0 se o frete é pago pelo comprador.';

    // Once the user types a price, the detected one no longer overwrites it.
    if (!state.priceEdited) els.price.value = state.price ? state.price.toFixed(2) : '';
    if (shadow.activeElement !== els.cost) els.cost.value = state.product.cost;
    if (shadow.activeElement !== els.shipping) els.shipping.value = state.product.shipping;
    els.listingType.value = state.product.listingType;

    const input = {
      marketplace: state.marketplace,
      price: state.price || 0,
      cost: state.product.cost,
      shipping: state.product.shipping,
      listingType: state.product.listingType,
      settings: state.settings,
    };
    const r = calculate(input);
    const settings = MargemFees.mergeSettings(state.settings);

    els.rows.replaceChildren(
      row(`Comissão (${r.commissionRate.toLocaleString('pt-BR')}%)`, `− ${formatBRL(r.commission)}`),
      row('Tarifa fixa', `− ${formatBRL(r.fixedFee)}`),
      row('Frete', `− ${formatBRL(r.shipping)}`),
      ...(settings.taxPercent ? [row(`Imposto (${settings.taxPercent}%)`, `− ${formatBRL(r.tax)}`)] : []),
      ...(settings.adsPercent ? [row(`Anúncios (${settings.adsPercent}%)`, `− ${formatBRL(r.ads)}`)] : []),
      row('Custo do produto', `− ${formatBRL(r.cost)}`),
    );

    const loss = r.profit < 0;
    els.result.classList.toggle('loss', loss);
    els.result.querySelector('.value').textContent = state.price ? formatBRL(r.profit) : '—';
    els.result.querySelector('.margin').textContent = state.price
      ? `Margem de ${r.margin.toLocaleString('pt-BR')}% · você recebe ${formatBRL(r.received)}`
      : 'Digite o preço de venda';

    if (!(Number(input.cost) > 0)) {
      // Without the product cost the minimum price is meaningless (it would show R$ 0,00).
      els.target.textContent = `Preencha o custo do produto para ver o preço mínimo para ${settings.targetMargin}% de margem.`;
    } else {
      const target = priceForMargin({ ...input, targetMargin: settings.targetMargin });
      els.target.replaceChildren(
        document.createTextNode(`Preço mínimo para ${settings.targetMargin}% de margem: `),
        el('b', {}, target === null ? 'impossível com estas taxas' : formatBRL(target)),
      );
    }

    els.pill.textContent = state.price ? `Lucro ${formatBRL(r.profit)} · ${r.margin.toLocaleString('pt-BR')}%` : 'Margem Certa';
    els.pill.classList.toggle('loss', loss);
    els.card.classList.toggle('hidden', state.collapsed);
    els.pill.classList.toggle('hidden', !state.collapsed);
  }

  function removeUI() {
    if (host) host.remove();
    host = null;
  }

  // ---------- Page tracking ----------

  function tryDetectPrice(attempt = 0) {
    clearTimeout(detectTimer);
    if (state.priceEdited) return;
    const price = detectPrice(document, state.marketplace);
    if (price) {
      state.price = price;
      update();
      return;
    }
    // Prices on Shopee (and some Mercado Livre pages) load after the page; keep trying for ~15 s.
    if (attempt < 15) detectTimer = setTimeout(() => tryDetectPrice(attempt + 1), 1000);
  }

  async function onPageChange() {
    state.url = location.href;
    state.marketplace = detectMarketplace(location.href);
    state.id = state.marketplace ? itemId(location.href, state.marketplace) : null;

    if (!state.id) {
      removeUI();
      return;
    }

    state.price = null;
    state.priceEdited = false;
    await loadProduct();
    if (!host) buildUI();
    update();
    tryDetectPrice();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      state.settings = changes.settings.newValue || {};
      update();
    }
  });

  // Both marketplaces change pages without a full reload, so watch the URL.
  setInterval(() => {
    if (location.href !== state.url) onPageChange();
  }, 1000);

  loadSettings().then(onPageChange);
})();

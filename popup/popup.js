/* global MargemFees */
const { DEFAULT_SETTINGS, FEES_UPDATED, mergeSettings, calculate, priceForMargin, formatBRL } = MargemFees;

const $ = (id) => document.getElementById(id);

let settings = mergeSettings();

// ---------- Tabs ----------

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });
    document.querySelectorAll('.panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== tab.dataset.tab);
    });
  });
});

// ---------- Settings ----------

const SETTING_FIELDS = {
  's-classico': (s) => s.ml.commission.classico,
  's-premium': (s) => s.ml.commission.premium,
  's-under19': (s) => s.ml.fixedFee.under19,
  's-under49': (s) => s.ml.fixedFee.under49,
  's-under79': (s) => s.ml.fixedFee.under79,
  's-seller': (s) => s.shopee.sellerType,
  's-tax': (s) => s.taxPercent,
  's-ads': (s) => s.adsPercent,
  's-margin': (s) => s.targetMargin,
};

function fillSettingsForm() {
  Object.entries(SETTING_FIELDS).forEach(([id, read]) => {
    $(id).value = read(settings);
  });
}

function readSettingsForm() {
  const n = (id) => ($(id).value === '' ? undefined : Number($(id).value));
  return mergeSettings({
    ml: {
      commission: { classico: n('s-classico'), premium: n('s-premium') },
      fixedFee: { under19: n('s-under19'), under49: n('s-under49'), under79: n('s-under79') },
    },
    shopee: { sellerType: $('s-seller').value },
    taxPercent: n('s-tax'),
    adsPercent: n('s-ads'),
    targetMargin: n('s-margin'),
  });
}

let savedTimer = null;
function showSaved(text) {
  $('s-saved').textContent = text;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($('s-saved').textContent = ''), 1500);
}

async function saveSettings() {
  settings = readSettingsForm();
  await chrome.storage.sync.set({ settings });
  showSaved('Salvo ✓');
  updateCalc();
}

Object.keys(SETTING_FIELDS).forEach((id) => $(id).addEventListener('change', saveSettings));

$('s-reset').addEventListener('click', async () => {
  settings = mergeSettings(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ settings });
  fillSettingsForm();
  showSaved('Padrões restaurados ✓');
  updateCalc();
});

$('s-updated').textContent = `Tarifas padrão de ${FEES_UPDATED}. As taxas mudam com frequência: confira sempre no marketplace.`;

// ---------- Calculator ----------

function row(label, value) {
  const r = document.createElement('div');
  r.className = 'row';
  const a = document.createElement('span');
  const b = document.createElement('span');
  a.textContent = label;
  b.textContent = value;
  r.append(a, b);
  return r;
}

function updateCalc() {
  const marketplace = $('c-marketplace').value;
  $('c-type-field').classList.toggle('hidden', marketplace !== 'ml');

  const input = {
    marketplace,
    listingType: $('c-type').value,
    price: $('c-price').value,
    cost: $('c-cost').value,
    shipping: $('c-shipping').value,
    settings,
  };
  const r = calculate(input);
  const hasPrice = Number($('c-price').value) > 0;

  $('c-rows').replaceChildren(
    row(`Comissão (${r.commissionRate.toLocaleString('pt-BR')}%)`, `− ${formatBRL(r.commission)}`),
    row('Tarifa fixa', `− ${formatBRL(r.fixedFee)}`),
    row('Frete', `− ${formatBRL(r.shipping)}`),
    ...(settings.taxPercent ? [row(`Imposto (${settings.taxPercent}%)`, `− ${formatBRL(r.tax)}`)] : []),
    ...(settings.adsPercent ? [row(`Anúncios (${settings.adsPercent}%)`, `− ${formatBRL(r.ads)}`)] : []),
    row('Custo do produto', `− ${formatBRL(r.cost)}`),
  );

  $('c-result').classList.toggle('loss', hasPrice && r.profit < 0);
  $('c-profit').textContent = hasPrice ? formatBRL(r.profit) : '—';
  $('c-margin').textContent = hasPrice
    ? `Margem de ${r.margin.toLocaleString('pt-BR')}% · você recebe ${formatBRL(r.received)}`
    : 'Digite o preço de venda';

  const target = priceForMargin({ ...input, targetMargin: settings.targetMargin });
  const label = document.createTextNode(`Preço mínimo para ${settings.targetMargin}% de margem: `);
  const value = document.createElement('b');
  value.textContent = target === null ? 'impossível com estas taxas' : formatBRL(target);
  $('c-target').replaceChildren(label, value);
}

['c-marketplace', 'c-type', 'c-price', 'c-cost', 'c-shipping'].forEach((id) => {
  $(id).addEventListener('input', updateCalc);
  $(id).addEventListener('change', updateCalc);
});

// ---------- Start ----------

chrome.storage.sync.get('settings').then(({ settings: saved }) => {
  settings = mergeSettings(saved);
  fillSettingsForm();
  updateCalc();
});

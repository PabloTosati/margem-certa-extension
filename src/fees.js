/**
 * Fee engine for Mercado Livre and Shopee (Brazil).
 *
 * Fee tables are estimates based on public information from November 2026.
 * They change often and depend on category, weight and reputation, so every
 * Mercado Livre value can be edited in the settings.
 *
 * Classic script (no modules) so it works as a content script and in the popup,
 * and it exports itself for Node so it can be unit tested.
 */
(function (root) {
  const FEES_UPDATED = 'nov/2026';

  const DEFAULT_SETTINGS = {
    ml: {
      // Commission (%) by listing type. Varies by category: Clássico 10–14%, Premium 15–19%.
      commission: { classico: 12, premium: 17 },
      // Fixed fee per unit (R$) for items under R$ 79, up to 2 kg (upper end of each 2026 range).
      fixedFee: { under19: 6.25, under49: 7.45, under79: 8.75 },
    },
    shopee: {
      // 'cnpj' or 'cpf-alto-volume' (CPF with more than 450 orders in 90 days pays R$ 3 more per item).
      sellerType: 'cnpj',
    },
    taxPercent: 0, // Seller's tax rate on revenue (e.g. Simples Nacional)
    adsPercent: 0, // Share of the price spent on ads
    targetMargin: 20, // Desired profit margin (%) used by "price for margin"
  };

  // Shopee Brazil table, effective March 2026 (CNPJ, and CPF up to 450 orders in 90 days).
  const SHOPEE_BANDS = [
    { min: 0, max: 8, rate: 0.5, fixed: 0 },
    { min: 8, max: 80, rate: 0.2, fixed: 4 },
    { min: 80, max: 100, rate: 0.14, fixed: 16 },
    { min: 100, max: 200, rate: 0.14, fixed: 20 },
    { min: 200, max: Infinity, rate: 0.14, fixed: 26 },
  ];
  const SHOPEE_CPF_EXTRA = 3;

  const ML_FIXED_FEE_LIMIT = 79;

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Deep-merges saved settings over the defaults, ignoring invalid values. */
  function mergeSettings(saved) {
    const s = saved || {};
    const d = DEFAULT_SETTINGS;
    const ml = s.ml || {};
    return {
      ml: {
        commission: {
          classico: num(ml.commission && ml.commission.classico, d.ml.commission.classico),
          premium: num(ml.commission && ml.commission.premium, d.ml.commission.premium),
        },
        fixedFee: {
          under19: num(ml.fixedFee && ml.fixedFee.under19, d.ml.fixedFee.under19),
          under49: num(ml.fixedFee && ml.fixedFee.under49, d.ml.fixedFee.under49),
          under79: num(ml.fixedFee && ml.fixedFee.under79, d.ml.fixedFee.under79),
        },
      },
      shopee: {
        sellerType: s.shopee && s.shopee.sellerType === 'cpf-alto-volume' ? 'cpf-alto-volume' : 'cnpj',
      },
      taxPercent: num(s.taxPercent, d.taxPercent),
      adsPercent: num(s.adsPercent, d.adsPercent),
      targetMargin: num(s.targetMargin, d.targetMargin),
    };
  }

  /** Mercado Livre fixed fee per unit. Under R$ 19 it never exceeds half of the price. */
  function mlFixedFee(price, fixedFee) {
    if (price >= ML_FIXED_FEE_LIMIT) return 0;
    if (price < 19) return Math.min(fixedFee.under19, price / 2);
    if (price < 49) return fixedFee.under49;
    return fixedFee.under79;
  }

  function shopeeBand(price, sellerType) {
    const band = SHOPEE_BANDS.find((b) => price >= b.min && price < b.max);
    const extra = sellerType === 'cpf-alto-volume' && price >= 8 ? SHOPEE_CPF_EXTRA : 0;
    return { rate: band.rate, fixed: band.fixed + extra };
  }

  /** Commission rate (0–1) and fixed fee for a price. */
  function marketplaceFees(marketplace, price, settings, listingType) {
    if (marketplace === 'shopee') return shopeeBand(price, settings.shopee.sellerType);
    const type = listingType === 'premium' ? 'premium' : 'classico';
    return { rate: settings.ml.commission[type] / 100, fixed: mlFixedFee(price, settings.ml.fixedFee) };
  }

  /**
   * Profit breakdown for one sale.
   * @param {object} input
   *   marketplace: 'ml' | 'shopee'
   *   price: sale price (R$)
   *   cost: product cost (R$)
   *   shipping: shipping paid by the seller (R$)
   *   listingType: 'classico' | 'premium' (Mercado Livre only)
   *   settings: saved settings (merged with defaults)
   */
  function calculate(input) {
    const settings = mergeSettings(input.settings);
    const price = Math.max(0, num(input.price, 0));
    const cost = Math.max(0, num(input.cost, 0));
    const shipping = Math.max(0, num(input.shipping, 0));

    const { rate, fixed } = marketplaceFees(input.marketplace, price, settings, input.listingType);
    const commission = price * rate;
    const tax = (price * settings.taxPercent) / 100;
    const ads = (price * settings.adsPercent) / 100;

    const marketplaceTotal = commission + fixed + shipping;
    const received = price - marketplaceTotal; // what the marketplace deposits
    const profit = received - tax - ads - cost;

    return {
      price: round2(price),
      commissionRate: round2(rate * 100),
      commission: round2(commission),
      fixedFee: round2(fixed),
      shipping: round2(shipping),
      tax: round2(tax),
      ads: round2(ads),
      cost: round2(cost),
      received: round2(received),
      profit: round2(profit),
      margin: price > 0 ? round2((profit / price) * 100) : 0,
    };
  }

  /** Price bands as linear pieces: fixed fee = fixedConst + fixedRate × price. */
  function bands(marketplace, settings, listingType) {
    if (marketplace === 'shopee') {
      return SHOPEE_BANDS.map((b) => {
        const { rate, fixed } = shopeeBand(b.min, settings.shopee.sellerType);
        return { min: b.min, max: b.max, rate, fixedConst: fixed, fixedRate: 0 };
      });
    }
    const type = listingType === 'premium' ? 'premium' : 'classico';
    const rate = settings.ml.commission[type] / 100;
    const f = settings.ml.fixedFee;
    const halfLimit = Math.min(2 * f.under19, 19); // below this, the fee is half the price
    return [
      { min: 0, max: halfLimit, rate, fixedConst: 0, fixedRate: 0.5 },
      { min: halfLimit, max: 19, rate, fixedConst: f.under19, fixedRate: 0 },
      { min: 19, max: 49, rate, fixedConst: f.under49, fixedRate: 0 },
      { min: 49, max: ML_FIXED_FEE_LIMIT, rate, fixedConst: f.under79, fixedRate: 0 },
      { min: ML_FIXED_FEE_LIMIT, max: Infinity, rate, fixedConst: 0, fixedRate: 0 },
    ];
  }

  /**
   * Lowest price that reaches the target margin, or null if it is impossible
   * (fees + taxes + margin add up to 100% or more).
   */
  function priceForMargin(input) {
    const settings = mergeSettings(input.settings);
    const cost = Math.max(0, num(input.cost, 0));
    const shipping = Math.max(0, num(input.shipping, 0));
    const margin = num(input.targetMargin, settings.targetMargin) / 100;
    const variable = (settings.taxPercent + settings.adsPercent) / 100 + margin;

    for (const band of bands(input.marketplace, settings, input.listingType)) {
      const divisor = 1 - band.rate - band.fixedRate - variable;
      if (divisor <= 0) continue;
      const price = (cost + shipping + band.fixedConst) / divisor;
      if (price >= band.min && price < band.max) {
        // Round up to the cent so the margin is never below the target.
        return Math.ceil(price * 100 - 1e-6) / 100;
      }
    }
    return null;
  }

  function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }

  const api = {
    FEES_UPDATED,
    DEFAULT_SETTINGS,
    SHOPEE_BANDS,
    mergeSettings,
    mlFixedFee,
    calculate,
    priceForMargin,
    formatBRL,
  };

  root.MargemFees = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

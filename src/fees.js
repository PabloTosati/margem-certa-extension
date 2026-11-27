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

  // Shopee Brazil table, effective October 1, 2026 (CNPJ, and CPF up to 450 orders in 90 days).
  // Up to R$ 79,99: 20% + R$ 4,50. The fixed part is capped at half the price, so below
  // R$ 9 it becomes 20% + 50% of the price.
  const SHOPEE_BANDS = [
    { min: 0, max: 9, rate: 0.7, fixed: 0 },
    { min: 9, max: 80, rate: 0.2, fixed: 4.5 },
    { min: 80, max: 100, rate: 0.14, fixed: 16 },
    { min: 100, max: 200, rate: 0.14, fixed: 20 },
    { min: 200, max: Infinity, rate: 0.14, fixed: 26 },
  ];
  const SHOPEE_CPF_EXTRA = 3;

  const ML_FIXED_FEE_LIMIT = 79;

  // Mercado Livre cost per unit by package weight and price (green reputation or no reputation).
  // Under R$ 79 it is the operational cost per unit (it replaces the fixed fee); from R$ 79 it is
  // the free-shipping cost the seller pays. Under R$ 19 it never exceeds half of the price.
  // Source: Mercado Livre, "Custos dos Envios no Mercado Livre", checked 01/11/2026.
  const ML_SHIP_PRICES = [0, 19, 49, 79, 100, 120, 150, 200];
  const ML_SHIP_TABLE = [
    { maxKg: 0.3, costs: [5.65, 6.85, 8.15, 12.95, 14.95, 16.95, 19.05, 21.65] },
    { maxKg: 0.5, costs: [5.95, 6.95, 8.25, 13.85, 16.15, 18.15, 20.45, 23.25] },
    { maxKg: 1, costs: [6.05, 7.15, 8.45, 14.45, 16.85, 19.05, 21.35, 24.45] },
    { maxKg: 1.5, costs: [6.15, 7.35, 8.65, 14.75, 17.15, 19.45, 21.75, 25.45] },
    { maxKg: 2, costs: [6.25, 7.45, 8.75, 15.05, 17.65, 19.85, 22.25, 25.55] },
    { maxKg: 3, costs: [6.35, 8.65, 9.15, 16.45, 19.15, 21.65, 24.35, 27.05] },
    { maxKg: 4, costs: [6.45, 8.75, 9.75, 17.85, 20.75, 23.35, 26.35, 29.25] },
    { maxKg: 5, costs: [6.55, 8.85, 10.25, 19.75, 22.85, 26.05, 29.25, 32.45] },
    { maxKg: 6, costs: [6.65, 8.95, 10.35, 25.95, 29.15, 33.35, 36.45, 40.85] },
  ];
  const ML_MAX_KG = 6;

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

  /** Table row for a package weight (kg), or null when blank, invalid or above 6 kg. */
  function mlWeightRow(weight) {
    if (weight === '' || weight === null || weight === undefined) return null;
    const kg = Number(weight);
    if (!Number.isFinite(kg) || kg <= 0 || kg > ML_MAX_KG) return null;
    return ML_SHIP_TABLE.find((row) => kg <= row.maxKg + 1e-9);
  }

  /** Mercado Livre cost per unit by weight and price, or null without a usable weight. */
  function mlShippingCost(price, weight) {
    const row = mlWeightRow(weight);
    if (!row) return null;
    let col = 0;
    ML_SHIP_PRICES.forEach((min, i) => {
      if (price >= min) col = i;
    });
    const cost = row.costs[col];
    return price < 19 ? Math.min(cost, price / 2) : cost;
  }

  function hasValue(value) {
    return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
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
    const extra = sellerType === 'cpf-alto-volume' && price >= 9 ? SHOPEE_CPF_EXTRA : 0;
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
   *   shipping: shipping paid by the seller (R$). With a weight on Mercado Livre, from R$ 79 it
   *     replaces the estimated free-shipping cost; leave it blank to use the estimate.
   *   weight: package weight in kg (Mercado Livre only, optional, up to 6 kg)
   *   listingType: 'classico' | 'premium' (Mercado Livre only)
   *   settings: saved settings (merged with defaults)
   */
  function calculate(input) {
    const settings = mergeSettings(input.settings);
    const price = Math.max(0, num(input.price, 0));
    const cost = Math.max(0, num(input.cost, 0));
    let shipping = Math.max(0, num(input.shipping, 0));
    let { rate, fixed } = marketplaceFees(input.marketplace, price, settings, input.listingType);
    let shippingEstimated = false;

    const byWeight = input.marketplace !== 'shopee' ? mlShippingCost(price, input.weight) : null;
    if (byWeight !== null) {
      if (price < ML_FIXED_FEE_LIMIT) {
        fixed = byWeight; // operational cost by weight replaces the fixed fee
      } else if (!hasValue(input.shipping)) {
        shipping = byWeight; // free shipping paid by the seller, estimated by weight
        shippingEstimated = true;
      }
    }
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
      shippingEstimated,
      weightUsed: byWeight !== null,
    };
  }

  /**
   * Price bands as linear pieces: fees = rate × price + fixedConst + fixedRate × price,
   * plus shipConst (shipping paid by the seller in that band).
   */
  function bands(marketplace, settings, listingType, shipping, weight, shippingGiven) {
    if (marketplace === 'shopee') {
      return SHOPEE_BANDS.map((b) => {
        const { rate, fixed } = shopeeBand(b.min, settings.shopee.sellerType);
        return { min: b.min, max: b.max, rate, fixedConst: fixed, fixedRate: 0, shipConst: shipping };
      });
    }
    const type = listingType === 'premium' ? 'premium' : 'classico';
    const rate = settings.ml.commission[type] / 100;
    const row = mlWeightRow(weight);
    if (row) {
      const c = row.costs;
      const halfLimit = Math.min(2 * c[0], 19);
      const out = [
        { min: 0, max: halfLimit, rate, fixedConst: 0, fixedRate: 0.5, shipConst: shipping },
        { min: halfLimit, max: 19, rate, fixedConst: c[0], fixedRate: 0, shipConst: shipping },
      ];
      for (let i = 1; i < ML_SHIP_PRICES.length; i++) {
        const min = ML_SHIP_PRICES[i];
        const max = i + 1 < ML_SHIP_PRICES.length ? ML_SHIP_PRICES[i + 1] : Infinity;
        if (min < ML_FIXED_FEE_LIMIT) {
          out.push({ min, max, rate, fixedConst: c[i], fixedRate: 0, shipConst: shipping });
        } else {
          // From R$ 79 the table is the free-shipping cost, unless the seller typed their own.
          out.push({ min, max, rate, fixedConst: 0, fixedRate: 0, shipConst: shippingGiven ? shipping : c[i] });
        }
      }
      return out;
    }
    const f = settings.ml.fixedFee;
    const halfLimit = Math.min(2 * f.under19, 19); // below this, the fee is half the price
    return [
      { min: 0, max: halfLimit, rate, fixedConst: 0, fixedRate: 0.5, shipConst: shipping },
      { min: halfLimit, max: 19, rate, fixedConst: f.under19, fixedRate: 0, shipConst: shipping },
      { min: 19, max: 49, rate, fixedConst: f.under49, fixedRate: 0, shipConst: shipping },
      { min: 49, max: ML_FIXED_FEE_LIMIT, rate, fixedConst: f.under79, fixedRate: 0, shipConst: shipping },
      { min: ML_FIXED_FEE_LIMIT, max: Infinity, rate, fixedConst: 0, fixedRate: 0, shipConst: shipping },
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

    const list = bands(input.marketplace, settings, input.listingType, shipping, input.weight, hasValue(input.shipping));
    for (const band of list) {
      const divisor = 1 - band.rate - band.fixedRate - variable;
      if (divisor <= 0) continue;
      const price = (cost + band.shipConst + band.fixedConst) / divisor;
      if (price < band.max) {
        // Below band.min means the whole band already reaches the target (the earlier
        // bands did not), so the band's first price is the answer. This happens when
        // the fixed fee drops, as at R$ 79 on Mercado Livre.
        const best = Math.max(price, band.min);
        // Round up to the cent so the margin is never below the target.
        return Math.ceil(best * 100 - 1e-6) / 100;
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
    ML_SHIP_PRICES,
    ML_SHIP_TABLE,
    ML_MAX_KG,
    mlFixedFee,
    mlShippingCost,
    calculate,
    priceForMargin,
    formatBRL,
  };

  root.MargemFees = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

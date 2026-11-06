const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calculate, priceForMargin, mlFixedFee, mergeSettings, DEFAULT_SETTINGS } = require('../src/fees.js');

const ml = (input) => calculate({ marketplace: 'ml', ...input });
const shopee = (input) => calculate({ marketplace: 'shopee', ...input });

describe('Mercado Livre', () => {
  test('price from R$ 79: commission only, no fixed fee', () => {
    const r = ml({ price: 100, cost: 40, shipping: 15 });
    assert.equal(r.commissionRate, 12);
    assert.equal(r.commission, 12);
    assert.equal(r.fixedFee, 0);
    assert.equal(r.received, 73);
    assert.equal(r.profit, 33);
    assert.equal(r.margin, 33);
  });

  test('premium uses the premium commission', () => {
    const r = ml({ price: 100, listingType: 'premium' });
    assert.equal(r.commission, 17);
  });

  test('fixed fee by price range', () => {
    const fees = DEFAULT_SETTINGS.ml.fixedFee;
    assert.equal(mlFixedFee(10, fees), 5); // capped at half the price
    assert.equal(mlFixedFee(15, fees), 6.25);
    assert.equal(mlFixedFee(30, fees), 7.45);
    assert.equal(mlFixedFee(50, fees), 8.75);
    assert.equal(mlFixedFee(78.99, fees), 8.75);
    assert.equal(mlFixedFee(79, fees), 0);
  });

  test('profit of a cheap item includes the fixed fee', () => {
    const r = ml({ price: 50, cost: 20 });
    assert.equal(r.commission, 6);
    assert.equal(r.fixedFee, 8.75);
    assert.equal(r.profit, 15.25);
  });

  test('custom commission and fixed fees from settings', () => {
    const settings = { ml: { commission: { classico: 14 }, fixedFee: { under49: 6.85 } } };
    const r = ml({ price: 30, settings });
    assert.equal(r.commission, 4.2);
    assert.equal(r.fixedFee, 6.85);
  });
});

describe('Shopee', () => {
  test('price bands (CNPJ)', () => {
    assert.deepEqual([shopee({ price: 5 }).commission, shopee({ price: 5 }).fixedFee], [2.5, 0]);
    assert.deepEqual([shopee({ price: 50 }).commission, shopee({ price: 50 }).fixedFee], [10, 4]);
    assert.deepEqual([shopee({ price: 80 }).commission, shopee({ price: 80 }).fixedFee], [11.2, 16]);
    assert.deepEqual([shopee({ price: 150 }).commission, shopee({ price: 150 }).fixedFee], [21, 20]);
    assert.deepEqual([shopee({ price: 250 }).commission, shopee({ price: 250 }).fixedFee], [35, 26]);
  });

  test('high-volume CPF pays R$ 3 more per item from R$ 8', () => {
    const settings = { shopee: { sellerType: 'cpf-alto-volume' } };
    assert.equal(shopee({ price: 50, settings }).fixedFee, 7);
    assert.equal(shopee({ price: 5, settings }).fixedFee, 0);
  });
});

describe('taxes and ads', () => {
  test('are taken from the price', () => {
    const r = ml({ price: 100, cost: 40, settings: { taxPercent: 6, adsPercent: 5 } });
    assert.equal(r.tax, 6);
    assert.equal(r.ads, 5);
    assert.equal(r.profit, 37); // 100 - 12 commission - 6 tax - 5 ads - 40 cost
  });

  test('a loss shows as negative profit', () => {
    const r = ml({ price: 30, cost: 30 });
    assert.ok(r.profit < 0);
    assert.ok(r.margin < 0);
  });
});

describe('priceForMargin', () => {
  function assertReachesTarget(input, expected) {
    const price = priceForMargin(input);
    assert.equal(price, expected);
    const r = calculate({ ...input, price });
    assert.ok(r.margin >= input.targetMargin, `margin ${r.margin} at ${price}`);
    // A few cents cheaper no longer reaches the target (margins are rounded to 0.01%).
    const cheaper = calculate({ ...input, price: price - 0.05 });
    assert.ok(cheaper.margin < input.targetMargin, `margin ${cheaper.margin} at ${price - 0.05}`);
  }

  test('Mercado Livre, price lands in the fixed-fee range', () => {
    // (40 + 8.75) / (1 - 0.12 - 0.20) = 71.69... -> rounded up to the cent
    assertReachesTarget({ marketplace: 'ml', cost: 40, targetMargin: 20 }, 71.7);
  });

  test('Mercado Livre, price above R$ 79', () => {
    // (60 + 15) / (1 - 0.12 - 0.20) = 110.29...
    assertReachesTarget({ marketplace: 'ml', cost: 60, shipping: 15, targetMargin: 20 }, 110.3);
  });

  test('Shopee', () => {
    // (40 + 4) / (1 - 0.20 - 0.20) = 73.33...
    assertReachesTarget({ marketplace: 'shopee', cost: 40, targetMargin: 20 }, 73.34);
  });

  test('includes taxes and ads', () => {
    const settings = { taxPercent: 6, adsPercent: 4 };
    // 60 / (1 - 0.12 - 0.06 - 0.04 - 0.15) = 95.23...
    assertReachesTarget({ marketplace: 'ml', cost: 60, targetMargin: 15, settings }, 95.24);
  });

  test('returns null when the margin is impossible', () => {
    assert.equal(priceForMargin({ marketplace: 'ml', cost: 10, targetMargin: 90 }), null);
  });
});

describe('mergeSettings', () => {
  test('falls back to defaults for missing or invalid values', () => {
    const s = mergeSettings({ taxPercent: 'abc', ml: { commission: { premium: 18 } } });
    assert.equal(s.taxPercent, 0);
    assert.equal(s.ml.commission.classico, 12);
    assert.equal(s.ml.commission.premium, 18);
    assert.equal(s.shopee.sellerType, 'cnpj');
  });
});

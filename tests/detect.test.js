const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { detectMarketplace, itemId, parsePrice, detectPrice } = require('../src/detect.js');

const doc = (html) => new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`).window.document;

describe('detectMarketplace', () => {
  test('recognizes both marketplaces and ignores other sites', () => {
    assert.equal(detectMarketplace('https://produto.mercadolivre.com.br/MLB-123456789-x'), 'ml');
    assert.equal(detectMarketplace('https://www.mercadolivre.com.br/abc/p/MLB12345678'), 'ml');
    assert.equal(detectMarketplace('https://shopee.com.br/Produto-i.123.456'), 'shopee');
    assert.equal(detectMarketplace('https://www.amazon.com.br/'), null);
    assert.equal(detectMarketplace('https://mercadolivre.com.br.evil.com/'), null);
    assert.equal(detectMarketplace('not a url'), null);
  });
});

describe('itemId', () => {
  test('Mercado Livre listing and catalog URLs', () => {
    assert.equal(itemId('https://produto.mercadolivre.com.br/MLB-3456789012-fone-bluetooth-_JM', 'ml'), 'MLB3456789012');
    assert.equal(itemId('https://www.mercadolivre.com.br/fone/p/MLB19876543?pdp_filters=x', 'ml'), 'MLB19876543');
    assert.equal(itemId('https://www.mercadolivre.com.br/', 'ml'), null);
  });

  test('Shopee product URLs', () => {
    assert.equal(itemId('https://shopee.com.br/Fone-Bluetooth-i.123456.987654321', 'shopee'), '123456.987654321');
    assert.equal(itemId('https://shopee.com.br/product/123456/987654321', 'shopee'), '123456.987654321');
    assert.equal(itemId('https://shopee.com.br/', 'shopee'), null);
  });
});

describe('parsePrice', () => {
  test('Brazilian and international formats', () => {
    assert.equal(parsePrice('R$ 1.299,90'), 1299.9);
    assert.equal(parsePrice('59,90'), 59.9);
    assert.equal(parsePrice('1299.90'), 1299.9);
    assert.equal(parsePrice('1,299.90'), 1299.9);
    assert.equal(parsePrice('1.299'), 1299);
    assert.equal(parsePrice(89.5), 89.5);
  });

  test('rejects invalid values', () => {
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('grátis'), null);
    assert.equal(parsePrice(0), null);
    assert.equal(parsePrice(undefined), null);
  });
});

describe('detectPrice', () => {
  test('reads JSON-LD Product offers', () => {
    const d = doc(`<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Fone","offers":{"@type":"Offer","price":"129.90","priceCurrency":"BRL"}}
    </script>`);
    assert.equal(detectPrice(d, 'ml'), 129.9);
  });

  test('reads JSON-LD inside @graph and offer arrays', () => {
    const d = doc(`<script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":["Product"],"offers":[{"@type":"AggregateOffer","lowPrice":49.9}]}]}
    </script>`);
    assert.equal(detectPrice(d, 'shopee'), 49.9);
  });

  test('ignores broken JSON-LD and falls back to meta tags', () => {
    const d = doc(`<script type="application/ld+json">{ broken</script><meta itemprop="price" content="89.00">`);
    assert.equal(detectPrice(d, 'ml'), 89);
  });

  test('falls back to the visible Mercado Livre price', () => {
    const d = doc(`
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount">
          <span class="andes-money-amount__currency-symbol">R$</span>
          <span class="andes-money-amount__fraction">1.249</span>
          <span class="andes-money-amount__cents">90</span>
        </span>
      </div>`);
    assert.equal(detectPrice(d, 'ml'), 1249.9);
  });

  test('returns null when there is no price', () => {
    assert.equal(detectPrice(doc('<p>Sem preço</p>'), 'ml'), null);
  });
});

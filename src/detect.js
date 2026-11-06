/**
 * Reads the listing price and ID from Mercado Livre and Shopee product pages.
 *
 * Marketplaces change their pages often, so several strategies are tried,
 * from the most stable (structured data) to the most fragile (CSS classes).
 * When nothing is found, the user can still type the price in the card.
 */
(function (root) {
  function detectMarketplace(url) {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      return null;
    }
    if (/(^|\.)mercadolivre\.com\.br$/.test(host)) return 'ml';
    if (/(^|\.)shopee\.com\.br$/.test(host)) return 'shopee';
    return null;
  }

  /** Listing ID used to remember the product cost, or null when the page is not a product. */
  function itemId(url, marketplace) {
    if (marketplace === 'ml') {
      const match = url.match(/\bMLB-?(\d{6,})/i);
      return match ? `MLB${match[1]}` : null;
    }
    if (marketplace === 'shopee') {
      const match = url.match(/-i\.(\d+)\.(\d+)/) || url.match(/\/product\/(\d+)\/(\d+)/);
      return match ? `${match[1]}.${match[2]}` : null;
    }
    return null;
  }

  /**
   * Parses prices written as "1.299,90", "1299.90", "R$ 59,90" or 59.9.
   * Returns null for anything that is not a positive number.
   */
  function parsePrice(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value !== 'string') return null;

    let text = value.replace(/[^\d.,]/g, '');
    if (!text) return null;

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Brazilian format: dots for thousands, comma for decimals.
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma && lastComma !== -1) {
      // US format: commas for thousands.
      text = text.replace(/,/g, '');
    } else if (lastComma === -1 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
      // "1.299" is one thousand two hundred ninety-nine, not 1.3.
      text = text.replace(/\./g, '');
    }

    const n = parseFloat(text);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  /** Finds Product.offers.price in JSON-LD blocks (including @graph and arrays). */
  function priceFromJsonLd(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      let data;
      try {
        data = JSON.parse(script.textContent);
      } catch {
        continue;
      }
      const queue = Array.isArray(data) ? [...data] : [data];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
        const types = [].concat(node['@type'] || []);
        if (types.includes('Product') && node.offers) {
          const offers = [].concat(node.offers);
          for (const offer of offers) {
            const price = parsePrice(offer.price) || parsePrice(offer.lowPrice);
            if (price) return price;
          }
        }
      }
    }
    return null;
  }

  function priceFromMeta(doc) {
    const selectors = [
      'meta[itemprop="price"]',
      'meta[property="product:price:amount"]',
      'meta[property="og:price:amount"]',
    ];
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      const price = el && parsePrice(el.getAttribute('content'));
      if (price) return price;
    }
    return null;
  }

  /** Mercado Livre visible price (main price block of the product page). */
  function priceFromMlDom(doc) {
    const block =
      doc.querySelector('.ui-pdp-price__second-line') || doc.querySelector('.ui-pdp-price__main-container');
    if (!block) return null;
    const fraction = block.querySelector('.andes-money-amount__fraction');
    if (!fraction) return null;
    const cents = block.querySelector('.andes-money-amount__cents');
    const text = `${fraction.textContent.replace(/\D/g, '')},${cents ? cents.textContent.replace(/\D/g, '') : '00'}`;
    return parsePrice(text);
  }

  /** Detects the listing price, trying the most reliable sources first. */
  function detectPrice(doc, marketplace) {
    return (
      priceFromJsonLd(doc) ||
      priceFromMeta(doc) ||
      (marketplace === 'ml' ? priceFromMlDom(doc) : null)
    );
  }

  const api = { detectMarketplace, itemId, parsePrice, priceFromJsonLd, priceFromMeta, priceFromMlDom, detectPrice };

  root.MargemDetect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

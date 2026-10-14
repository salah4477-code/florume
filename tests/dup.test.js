const test = require('node:test');
const assert = require('node:assert/strict');
const RULES = require('../js/rules.js');

const st = () => ({ products: [
  { id: 'a', sku: 'LT-KH100', brand: 'لطافة', name: 'خمرة', sizeMl: 100 },
  { id: 'b', sku: 'LT-KH50', brand: 'لطافة', name: 'خمرة', sizeMl: 50 },
] });

test('codes that differ only by a dash are different products (box AR-GS3 vs piece AR-GS-3)', () => {
  const s = { products: [{ id: 'box', sku: 'AR-GS3', brand: 'أرماف', name: 'بوكس هدايا 3×30 مل' }] };
  assert.equal(RULES.productDuplicate(s, { id: 'p3', sku: 'AR-GS-3', brand: 'أرماف', name: 'تاج 30مل (من البوكس)', sizeMl: 30 }), null);
});

test('same product name in another size is fine', () => {
  assert.equal(RULES.productDuplicate(st(), { id: 'c', sku: 'X1', brand: 'لطافة', name: 'خمرة', sizeMl: 75 }), null);
  assert.equal(RULES.productDuplicate(st(), st().products[0]), null, 'editing a product does not clash with itself');
});

test('duplicate code is caught regardless of case, spaces and Arabic digits', () => {
  for (const sku of ['lt-kh100', ' LT-KH100 ', 'LT - KH100', 'LT-KH١٠٠']) {
    const d = RULES.productDuplicate(st(), { id: 'c', sku, brand: 'x', name: 'y', sizeMl: 1 });
    assert.equal(d && d.field, 'sku', sku);
    assert.equal(d.other.id, 'a');
  }
});

test('duplicate name (brand + name + size) is caught with Arabic spelling variants', () => {
  const d = RULES.productDuplicate(st(), { id: 'c', sku: '', brand: 'لطافه', name: 'خمره', sizeMl: 100 });
  assert.equal(d && d.field, 'name');
  assert.equal(d.other.id, 'a');
  assert.equal(RULES.productDuplicate(st(), { id: 'c', sku: '', brand: '', name: '', sizeMl: 0 }), null, 'empty names are not compared');
});

test('health check lists existing duplicates', () => {
  const s = st(); s.products.push({ id: 'c', sku: 'lt-kh100', brand: 'أرماف', name: 'كلوب', sizeMl: 105 }, { id: 'd', sku: '', brand: 'لطافة', name: 'خمرة', sizeMl: 50 });
  const d = RULES.productDuplicates(s);
  assert.deepEqual(d.map((x) => `${x.field}:${x.a.id}-${x.b.id}`), ['sku:a-c', 'name:b-d']);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const ATT = require('../js/attach.js');

test('attachment file names are safe on Windows and readable', () => {
  assert.equal(ATT.cleanName('مصروف 2026-10-14 إعلانات: ميتا/تيك توك?'), 'مصروف 2026-10-14 إعلانات ميتا تيك توك');
  assert.equal(ATT.cleanName('  شحنة  SA-2610.  '), 'شحنة SA-2610');
  assert.equal(ATT.cleanName(''), 'مستند');
  assert.ok(ATT.cleanName('x'.repeat(200)).length <= 90);
});

test('the same name gets a number instead of overwriting', () => {
  assert.equal(ATT.fileName('مصروف 2026-10-14', 'jpg', new Set()), 'مصروف 2026-10-14.jpg');
  const taken = new Set(['مصروف 2026-10-14.jpg', 'مصروف 2026-10-14 (2).jpg']);
  assert.equal(ATT.fileName('مصروف 2026-10-14', 'jpg', taken), 'مصروف 2026-10-14 (3).jpg');
});

test('extension and accepted types: images and PDF only', () => {
  assert.equal(ATT.extOf({ name: 'Invoice.PDF', type: 'application/pdf' }), 'pdf');
  assert.equal(ATT.extOf({ name: 'blob', type: 'image/jpeg' }), 'jpg');
  assert.ok(ATT.accepted({ name: 'a.jpg', type: 'image/jpeg' }));
  assert.ok(ATT.accepted({ name: 'scan.pdf', type: '' }));
  assert.ok(!ATT.accepted({ name: 'sheet.xlsx', type: 'application/vnd.ms-excel' }));
  assert.ok(ATT.isImage({ file: 'x.png' })); assert.ok(!ATT.isImage({ file: 'x.pdf', type: 'application/pdf' }));
  assert.equal(ATT.sizeText(2 * 1048576), '2.0 ميجا'); assert.equal(ATT.sizeText(300), '1 كيلو');
});

import { describe, expect, it } from 'vitest';
import { coa } from '../src/content';
import { checkEntry, parseAmount } from '../src/engine/checkEntry';
import { formatMoney } from '../src/lib/format';
import { parseInline } from '../src/lib/inline';

const solution = [
  { account: '5201', debit: 850000 },
  { account: '1250', credit: 850000 },
];
const line = (account: string, debit = '', credit = '') => ({ account, debit, credit });

describe('مصحح تمرين القيد', () => {
  it('يقبل الحل الصحيح حتى بترتيب مختلف وبفواصل وأرقام عربية', () => {
    const r = checkEntry([line('1250', '', '850,000'), line('5201', '٨٥٠٠٠٠')], solution, coa);
    expect(r.ok).toBe(true);
  });
  it('يكتشف القيد غير المتوازن', () => {
    const r = checkEntry([line('5201', '850000'), line('1250', '', '800000')], solution, coa);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'unbalanced')).toBe(true);
  });
  it('يكتشف عكس الطرفين', () => {
    const r = checkEntry([line('1250', '850000'), line('5201', '', '850000')], solution, coa);
    expect(r.issues.filter((i) => i.kind === 'wrong-side')).toHaveLength(2);
  });
  it('يكتشف الحساب الخطأ والحساب الناقص', () => {
    const r = checkEntry([line('5202', '850000'), line('1250', '', '850000')], solution, coa);
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['extra-account', 'missing-account']);
  });
  it('يكتشف المبلغ الخطأ رغم التوازن', () => {
    const r = checkEntry([line('5201', '85000'), line('1250', '', '85000')], solution, coa);
    expect(r.balanced).toBe(true);
    expect(r.issues.filter((i) => i.kind === 'wrong-amount')).toHaveLength(2);
  });
  it('يرفض سطراً فيه مدين ودائن معاً، أو بلا حساب، أو قيداً فارغاً', () => {
    expect(checkEntry([line('5201', '10', '10')], solution, coa).issues[0].kind).toBe('both-sides');
    expect(checkEntry([line('', '10')], solution, coa).issues[0].kind).toBe('no-account');
    expect(checkEntry([line('')], solution, coa).issues[0].kind).toBe('empty');
  });
  it('يحلل المبالغ', () => {
    expect(parseAmount('1,250,000')).toBe(1250000);
    expect(parseAmount('١٢٥٠٫٥')).toBe(1250.5);
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('التنسيق والنص', () => {
  it('ينسق المبالغ بفواصل الآلاف وعلامة ج.م', () => {
    expect(formatMoney(1250000)).toBe('1,250,000 ج.م');
    expect(formatMoney(-2130000, { parens: true })).toBe('(2,130,000) ج.م');
  });
  it('يحلل المصطلحات والغامق وشارات المراجعة', () => {
    const t = parseInline('**أ** {{term:x|س}} {{review:V01}}');
    expect(t.map((x) => x.type)).toEqual(['bold', 'text', 'ref', 'text', 'review']);
  });
});

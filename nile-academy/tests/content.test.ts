import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coa, entriesFor, episodes, glossary, program } from '../src/content';
import { balanceSheet, entryTotals, incomeStatement, isBalanced, trialBalance, toCents } from '../src/engine/ledger';
import { checkEntry } from '../src/engine/checkEntry';
import { collectRefs } from '../src/lib/inline';
import { episodeStrings } from '../src/lib/blocks';

const verifyIds = new Set([...readFileSync(new URL('../VERIFY.md', import.meta.url), 'utf8').matchAll(/^##\s+(V\d+)/gm)].map((m) => m[1]));
const codes = new Set(coa.accounts.map((a) => a.code));

describe('دليل الحسابات', () => {
  it('الأكواد فريدة وكل حساب في مجموعة موجودة ونوعه يطابق المجموعة', () => {
    expect(codes.size).toBe(coa.accounts.length);
    const groups = new Map(coa.groups.map((g) => [g.id, g]));
    for (const a of coa.accounts) {
      const g = groups.get(a.group);
      expect(g, a.code).toBeDefined();
      expect(g!.type, a.code).toBe(a.type);
    }
  });
});

describe('هيكل البرنامج', () => {
  it('فيه 6 أجزاء، والجزءان الأول والثاني متاحان بـ6 حلقات لكل منهما', () => {
    expect(program.parts).toHaveLength(6);
    expect(program.parts[0].status).toBe('available');
    expect(program.parts[1].status).toBe('available');
    expect(episodes.filter((e) => e.part === 1)).toHaveLength(6);
    expect(episodes.filter((e) => e.part === 2)).toHaveLength(6);
  });
  it('معرّف كل حلقة يطابق تسجيلها في program.json', () => {
    for (const p of program.parts.filter((p) => p.status === 'available')) {
      for (const ref of p.episodes) {
        const ep = episodes.find((e) => e.id === ref.id);
        expect(ep, ref.id).toBeDefined();
        expect(ep!.part).toBe(p.number);
        expect(ep!.number).toBe(ref.number);
      }
    }
  });
});

for (const ep of episodes) {
  describe(`الحلقة ${ep.id}: ${ep.title}`, () => {
    it('كل قيد متوازن وحساباته موجودة وكل سطر مدين أو دائن فقط', () => {
      for (const e of ep.application.entries) {
        expect(isBalanced(e.lines), `${e.id} غير متوازن: ${JSON.stringify(entryTotals(e.lines))}`).toBe(true);
        for (const l of e.lines) {
          expect(codes.has(l.account), `${e.id}: الحساب ${l.account}`).toBe(true);
          const d = toCents(l.debit);
          const c = toCents(l.credit);
          expect((d > 0) !== (c > 0), `${e.id}: سطر ${l.account}`).toBe(true);
          expect(d >= 0 && c >= 0).toBe(true);
        }
      }
    });

    it('معرّفات القيود فريدة', () => {
      const ids = ep.application.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('الاختبار فيه 4-6 أسئلة، لكل سؤال إجابة صحيحة واحدة، وتمرين قيد واحد على الأقل', () => {
      expect(ep.quiz.questions.length).toBeGreaterThanOrEqual(4);
      expect(ep.quiz.questions.length).toBeLessThanOrEqual(6);
      for (const q of ep.quiz.questions) {
        expect(q.options.filter((o) => o.correct).length, q.id).toBe(1);
        expect(q.options.length).toBeGreaterThanOrEqual(3);
        for (const o of q.options) expect(o.explanation.length, q.id).toBeGreaterThan(0);
      }
      expect(ep.quiz.exercises.length).toBeGreaterThanOrEqual(1);
    });

    it('حلول تمارين القيد متوازنة وتنجح في المصحح الآلي', () => {
      for (const x of ep.quiz.exercises) {
        expect(isBalanced(x.solution), x.id).toBe(true);
        for (const l of x.solution) expect(codes.has(l.account), `${x.id}: ${l.account}`).toBe(true);
        const draft = x.solution.map((l) => ({
          account: l.account,
          debit: l.debit ? String(l.debit) : '',
          credit: l.credit ? String(l.credit) : '',
        }));
        const r = checkEntry(draft, x.solution, coa);
        expect(r.issues, x.id).toEqual([]);
        expect(r.ok).toBe(true);
      }
    });

    it('كل مصطلح أو مرجع مستخدم موجود في القاموس، وكل "يحتاج مراجعة" مسجل في VERIFY.md', () => {
      for (const s of episodeStrings(ep)) {
        const { refs, reviews } = collectRefs(s);
        for (const r of refs) expect(glossary.has(r), `مرجع غير معرف: ${r}`).toBe(true);
        for (const v of reviews) expect(verifyIds.has(v), `بند مراجعة غير مسجل: ${v}`).toBe(true);
      }
      for (const ref of ep.rule.refs) {
        expect(glossary.has(ref.id), `مرجع القاعدة غير معرف: ${ref.id}`).toBe(true);
        if (ref.review) expect(verifyIds.has(ref.review), ref.review).toBe(true);
      }
    });
  });
}

describe('بنود القاموس', () => {
  it('كل بند عليه "يحتاج مراجعة" مسجل في VERIFY.md', () => {
    for (const g of glossary.values()) if (g.review) expect(verifyIds.has(g.review), g.id).toBe(true);
  });
});

const part1 = episodes.filter((e) => e.part === 1).map((e) => e.id);
const part2 = episodes.filter((e) => e.part === 2).map((e) => e.id);

describe('الدفاتر التراكمية', () => {
  it('ميزان المراجعة وقائمة المركز المالي متوازنان بعد كل حلقة', () => {
    const done: string[] = [];
    for (const ep of episodes) {
      done.push(ep.id);
      const entries = entriesFor(done);
      const tb = trialBalance(entries, coa);
      expect(tb.balanced, `ميزان المراجعة بعد ${ep.id}: ${tb.totalDebit} ≠ ${tb.totalCredit}`).toBe(true);
      expect(balanceSheet(entries, coa).balanced, `المركز المالي بعد ${ep.id}`).toBe(true);
    }
  });

  it('أرصدة نهاية الجزء الأول تطابق الأرقام المذكورة في المحتوى', () => {
    const entries = entriesFor(part1);
    const tb = trialBalance(entries, coa);
    const bal = (code: string) => {
      const r = tb.rows.find((x) => x.code === code);
      return r ? r.debit - r.credit : 0;
    };
    expect(tb.totalDebit).toBe(311_945_000);
    expect(bal('1250')).toBe(229_100_000);
    expect(bal('1101')).toBe(46_350_000);
    expect(bal('1203')).toBe(4_000_000);
    expect(bal('1210')).toBe(2_000_000);
    expect(bal('1220')).toBe(1_650_000);
    expect(bal('1251')).toBe(115_000);
    expect(bal('1230')).toBe(0);
    expect(bal('2201')).toBe(-5_500_000);
    expect(bal('2202')).toBe(0);
    expect(bal('2203')).toBe(-445_000);

    const is = incomeStatement(entries, coa);
    expect(is.revenue.total).toBe(6_000_000);
    expect(is.grossProfit).toBe(2_000_000);
    expect(is.netProfit).toBe(-2_130_000);

    const bs = balanceSheet(entries, coa);
    expect(bs.totalAssets).toBe(303_215_000);
    expect(bs.totalLiabilities).toBe(5_945_000);
    expect(bs.totalEquity).toBe(297_270_000);
  });

  it('أرصدة البنك المذكورة في نهاية كل حلقة صحيحة', () => {
    const expected: Record<string, number> = {
      p1e1: 298_550_000,
      p1e2: 297_700_000,
      p1e3: 231_350_000,
      p1e4: 227_850_000,
      p1e5: 229_100_000,
      p1e6: 229_100_000,
      p2e1: 63_450_000,
      p2e2: 63_450_000,
      p2e3: 63_450_000,
      p2e4: 55_250_000,
      p2e5: 52_750_000,
      p2e6: 52_750_000,
    };
    const done: string[] = [];
    for (const ep of episodes) {
      done.push(ep.id);
      const row = trialBalance(entriesFor(done), coa).rows.find((r) => r.code === '1250');
      expect(row?.debit, ep.id).toBe(expected[ep.id]);
    }
  });

  it('قبل التسويات (نهاية الحلقة 5) ميزان المراجعة = 311,500,000', () => {
    const tb = trialBalance(entriesFor(episodes.slice(0, 5).map((e) => e.id)), coa);
    expect(tb.totalDebit).toBe(311_500_000);
    expect(incomeStatement(entriesFor(episodes.slice(0, 5).map((e) => e.id)), coa).netProfit).toBe(-1_535_000);
  });

  it('أرصدة نهاية الجزء الثاني تطابق الأرقام المذكورة في المحتوى', () => {
    const entries = entriesFor([...part1, ...part2]);
    const tb = trialBalance(entries, coa);
    const bal = (code: string) => {
      const r = tb.rows.find((x) => x.code === code);
      return r ? r.debit - r.credit : 0;
    };
    expect(bal('1101')).toBe(58_000_000);
    expect(bal('1102')).toBe(84_000_000);
    expect(bal('1103')).toBe(101_000_000);
    expect(bal('1182')).toBe(-175_000);
    expect(bal('1183')).toBe(-800_000);
    expect(bal('1189')).toBe(-2_450_000);
    expect(bal('1190')).toBe(61_400_000);
    expect(bal('1150')).toBe(6_000_000);
    expect(bal('1151')).toBe(1_300_000);
    expect(bal('1159')).toBe(-100_000);
    expect(bal('1160')).toBe(8_712_963);
    expect(bal('1169')).toBe(-145_216);
    expect(bal('1220')).toBe(900_000);
    expect(bal('1240')).toBe(1_350_000);
    expect(bal('1260')).toBe(90_000_000);
    expect(bal('2101')).toBe(-120_000_000);
    expect(bal('2102')).toBe(-6_316_512);
    expect(bal('2206')).toBe(-30_000_000);
    expect(bal('2207')).toBe(-2_750_000);
    expect(bal('3105')).toBe(-11_650_000);

    const is = incomeStatement(entries, coa);
    expect(is.financeCosts.total).toBe(103_549);
    expect(is.totalOci).toBe(11_650_000);
    expect(is.totalComprehensiveIncome).toBe(is.netProfit + 11_650_000);
    expect(is.netProfit).toBe(-8_203_765);
    const bs = balanceSheet(entries, coa);
    expect(bs.balanced).toBe(true);
    expect(bs.totalAssets).toBe(467_857_747);
    expect(bs.totalLiabilities).toBe(165_011_512);
    expect(bs.totalEquity).toBe(302_846_235);
  });

  it('رصيد مشروعات تحت التنفيذ قبل التحويل = 185,000,000 ويصفر بعده', () => {
    const ep = episodes.find((e) => e.id === 'p2e1')!;
    const before = entriesFor(part1).concat(ep.application.entries.filter((e) => e.id !== 'p2e1-j10'));
    expect(trialBalance(before, coa).rows.find((r) => r.code === '1190')?.debit).toBe(185_000_000);
    const after = entriesFor([...part1, 'p2e1']);
    expect(trialBalance(after, coa).rows.find((r) => r.code === '1190')).toBeUndefined();
  });

  it('القيود التوضيحية (post: false) لا تُرحَّل', () => {
    const all = entriesFor(episodes.map((e) => e.id));
    expect(all.some((e) => e.id === 'p1e6-demo-close')).toBe(false);
  });
});

// أنواع البيانات المشتركة بين المحتوى (ملفات JSON) والكود.
// أي ملف محتوى جديد لازم يلتزم بالأشكال دي، والاختبارات بتتحقق منها.

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type Side = 'debit' | 'credit';

export interface AccountGroup {
  id: string;
  name: string;
  nameEn: string;
  type: AccountType;
  /** مكان المجموعة في القوائم المالية */
  statement: 'balance-sheet' | 'income-statement';
  order: number;
}

export interface Account {
  code: string;
  name: string;
  nameEn: string;
  type: AccountType;
  group: string;
  normal: Side;
  /** حساب مقابل (مثل مجمع الإهلاك أو تكاليف إصدار الأسهم) يُخصم من مجموعته */
  contra?: boolean;
  /** احتياطي يتكوّن من الدخل الشامل الآخر (مثل فائض إعادة التقييم) */
  oci?: boolean;
  description?: string;
  /** الجزء الذي يظهر فيه الحساب لأول مرة (للعرض فقط) */
  introducedIn?: number;
}

export interface ChartOfAccounts {
  groups: AccountGroup[];
  accounts: Account[];
}

export interface EntryLine {
  account: string;
  debit?: number;
  credit?: number;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  lines: EntryLine[];
  /** خطوات الحساب/الشرح التي تظهر تحت القيد */
  steps?: string[];
  /** false = قيد توضيحي لا يُرحَّل لدفاتر الشركة */
  post?: boolean;
}

/** فقرة نصية (تدعم **غامق** و {{id|نص}} و {{review:V01}}) أو كتلة منظمة */
export type Block =
  | string
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | { type: 'callout'; tone: 'info' | 'warning' | 'success' | 'law'; title?: string; text: string | string[] }
  | { type: 'entry'; entryId: string };

export interface RuleRef {
  /** معرف مرتبط بقاموس المصطلحات، مثل eas:1 أو law:159-1981:art32 */
  id: string;
  title: string;
  /** المعيار الدولي أو المرجع المقابل */
  counterpart?: string;
  text: string;
  /** معرف بند في VERIFY.md لو المعلومة تحتاج مراجعة */
  review?: string;
}

export interface QuizOption {
  text: string;
  correct?: boolean;
  explanation: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
}

export interface EntryExercise {
  id: string;
  prompt: string;
  date: string;
  /** القيد الصحيح المتوقع */
  solution: EntryLine[];
  hints?: string[];
  /** شرح يظهر بعد الحل الصحيح */
  explanation?: string;
}

export interface Episode {
  id: string;
  part: number;
  number: number;
  title: string;
  subtitle: string;
  period: string;
  minutes: number;
  objectives: string[];
  situation: Block[];
  explanation: Block[];
  rule: { intro?: Block[]; refs: RuleRef[] };
  application: { intro?: Block[]; entries: JournalEntry[]; outro?: Block[] };
  mistake: { title: string; blocks: Block[] };
  quiz: { questions: QuizQuestion[]; exercises: EntryExercise[] };
  /** ملخص الأرصدة بعد الحلقة (للعرض؛ الأرقام الفعلية تُحسب من القيود) */
  takeaways: string[];
}

export interface EpisodeRef {
  id: string;
  number: number;
  title: string;
  file: string;
}

export interface Part {
  number: number;
  title: string;
  description: string;
  status: 'available' | 'coming-soon';
  topics: string[];
  episodes: EpisodeRef[];
}

export interface Program {
  title: string;
  parts: Part[];
}

export interface GlossaryItem {
  id: string;
  ar: string;
  en?: string;
  kind: 'term' | 'eas' | 'ifrs' | 'law' | 'org';
  short: string;
  review?: string;
}

export interface Company {
  name: string;
  nameEn: string;
  legalForm: string;
  description: string;
  facts: { label: string; value: string }[];
  related: { name: string; relation: string; description: string }[];
  timeline: { date: string; event: string }[];
  simplifications: string[];
}

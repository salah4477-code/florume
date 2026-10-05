// قراءة وكتابة localStorage بأمان: ممكن يكون مقفول (وضع خاص، إعدادات المتصفح)

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // التخزين غير متاح؛ التطبيق يكمل من غير حفظ
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // تجاهل
  }
}

/** كتابة نص خام (يُقرأ من السكربت الصغير في index.html قبل تحميل التطبيق) */
export function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // تجاهل
  }
}

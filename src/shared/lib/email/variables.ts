/**
 * メールテンプレートの変数差し込みエンジン
 *
 * Mustache 風の {{placeholder}} 形式で変数を置換する。
 * HTML エスケープは行わない（呼び出し側の React Email / Resend が処理する）。
 */

const PLACEHOLDER_PATTERN = /\{\{\s*([^}\s]+)\s*\}\}/g;

export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    const value = variables[key];
    return value ?? "";
  });
}

export function extractPlaceholders(template: string): string[] {
  const matches = Array.from(template.matchAll(PLACEHOLDER_PATTERN));
  return Array.from(new Set(matches.map((m) => m[1] ?? "")));
}

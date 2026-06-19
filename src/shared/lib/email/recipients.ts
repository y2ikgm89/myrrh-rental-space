/**
 * 通知先メールアドレスの結合・重複除去（純粋ロジック）
 *
 * 送信時に「スタッフ由来メール」と「カスタムメール」を結合する。prisma/next-cache に
 * 依存しないよう純粋関数として切り出し、単体テスト可能にする。
 *
 * @module shared/lib/email/recipients
 */

/**
 * スタッフ由来メールとカスタムメールを結合し、大文字小文字を無視して重複除去する。
 * スタッフを優先し、入力順を保持し、空要素は除去する。
 */
export function mergeRecipients(
  staffEmails: readonly string[],
  customEmails: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of [...staffEmails, ...customEmails]) {
    const email = raw.trim();
    if (email.length === 0) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }
  return result;
}

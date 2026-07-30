/**
 * 匿名化で null 化される PII フィールド名（`anonymizeCustomerCommand` と同期）。
 *
 * 「何が消えたか」の forensic 記録に値そのものは含めない — 匿名化イベントの
 * AuditLog に生 PII を永続保存すると、削除自体の趣旨（データ最小化）と衝突するため。
 *
 * **`"use server"` ファイルに置かないこと。** Next.js は `"use server"` ファイルの
 * export を async 関数だけに制限しており、配列 (object) を export するとモジュール評価が
 * 実行時に throw して同ファイルの Server Action が全滅する
 * (`A "use server" file can only export async functions, found object.`)。
 * ビルドは通り unit テストも mock で通るため、production build を実際に叩くまで
 * 顕在化しない（実害: 2026-07-30 の full CI dispatch で `/admin/customers/new` の
 * customer:create action が 500）。
 * gate: `__tests__/unit/architecture/use-server-exports.test.ts`
 */
export const ANONYMIZED_CUSTOMER_FIELDS = [
  "email",
  "emailCanonical",
  "lastName",
  "firstName",
  "lastNameKana",
  "firstNameKana",
  "phoneNumber",
  "companyName",
  "postalCode",
  "prefecture",
  "city",
  "streetAddress",
  "building",
  "notes",
  "isActive",
  "marketingOptIn",
  "phoneContactOptIn",
  "userId",
] as const;

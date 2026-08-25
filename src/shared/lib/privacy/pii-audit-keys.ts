/**
 * 監査 JSON（`oldValue` / `newValue` / `metadata`）に載せていけない顧客 PII のキー。
 *
 * schema.prisma から導いていない。manifest との一致 gate も置かない。
 * スキーマに同名フィールドがあるキーは `@pii-model` が付いた model にだけ属する
 * （`filename` / `note` / `query` はスキーマ照合から除外する）。
 *
 * 意図的に入れないもの:
 * - `name` / `title` — 表示名・カタログ見出しで、顧客連絡先そのものではない
 * - `ipAddress` — 監査のリクエスト文脈（forensic）として残す
 *
 * 型で止められないもの: ネストした値、`as`、`targetEmail` のような別名。
 */
export const PII_AUDIT_KEYS = [
  "lastName",
  "firstName",
  "lastNameKana",
  "firstNameKana",
  "companyName",
  "email",
  "emailCanonical",
  "newEmail",
  "newEmailCanonical",
  "guestEmail",
  "guestLastName",
  "guestFirstName",
  "guestCompanyName",
  "guestPhone",
  "phone",
  "phoneNumber",
  "postalCode",
  "prefecture",
  "city",
  "streetAddress",
  "building",
  "recipientName",
  "filename",
  "notes",
  "note",
  "query",
] as const;

export type PiiAuditKey = (typeof PII_AUDIT_KEYS)[number];

export type AuditJsonPayload = Record<string, unknown> &
  Partial<Record<PiiAuditKey, never>>;

import { isRecord } from "@/shared/lib/serialize";

/**
 * ログ出力前の PII / secret redaction ユーティリティ。
 *
 * 呼び出し側 (Server Component / Server Action / instrumentation.ts) が
 * `logError` / `logger.*` に渡す context / requestUrl を、Cloud Logging へ
 * 直流しにする前に本モジュールでマスクする。
 *
 * ## 契約
 *
 * - **redaction は emit の直前で行い、caller の元オブジェクトは変更しない**
 *   (deep clone → mask)。log を経由しないビジネスロジックには影響しない。
 * - **本番のみ redact する運用にはしない**。Cloud Logging に流れた時点で
 *   Log Explorer 権限保持者に PII が晒される単一障害点になる。dev/test でも
 *   同じ redaction を通す (ログ画面の readability を守るためマスクは長さを
 *   保った "[REDACTED:kind]" 表記にする)。
 * - **失敗時は fail-open ではなく fail-safe**。redaction 自体が throw する
 *   ような病理ケースでは元 value を "[REDACTED:ERROR]" に置き換える。
 *
 * ## 検出対象
 *
 * - キー名で判定 (case-insensitive): `authorization`, `cookie`, `set-cookie`,
 *   `password`, `token`, `access_token`, `refresh_token`, `id_token`,
 *   `session_token`, `secret`, `api_key`, `apiKey`, `apiToken`, `hash`,
 *   `signature`, `x-api-key`, `bearer`, `credentials`
 * - 値のパターンで判定: メール、日本の電話番号 (03/090/080/070/固定桁)、
 *   Bearer トークン、JWT (`eyJ...`)、長い hex/base64 (>= 32 char)、
 *   Stripe secret (`sk_live_` / `sk_test_`), OpenAI (`sk-`), GitHub PAT
 *   (`ghp_` / `ghs_` / `gho_` / `github_pat_`)
 *
 * ## URL の redaction
 *
 * `redactRequestUrl` は query string を必ず `?[redacted]` に置き換える。
 * path 部分にはトークン埋め込み URL (例 /reservations/[id]/cancel?token=...)
 * が入る可能性があるが、path のセグメント値 (UUID 等) は log として保持する
 * ほうが調査に有用なので触らない。
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDACTED_KIND = {
  email: "[REDACTED:email]",
  phone: "[REDACTED:phone]",
  jwt: "[REDACTED:jwt]",
  bearer: "[REDACTED:bearer]",
  secret: "[REDACTED:secret]",
  keyBased: "[REDACTED]",
  error: "[REDACTED:ERROR]",
} as const;

const REDACTION_KEY_PATTERNS: ReadonlyArray<RegExp> = [
  /^authorization$/i,
  /^cookie$/i,
  /^set[-_]?cookie$/i,
  /password/i,
  /(^|[_-])token($|s$)/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /id[_-]?token/i,
  /session[_-]?token/i,
  /^secret$/i,
  /_secret$/i,
  /^api[_-]?key$/i,
  /apikey/i,
  /apitoken/i,
  /bearer/i,
  /credential/i,
  /(^|[_-])hash($|_)/i,
  /signature/i,
  /^x-api-key$/i,
];

const RECURSION_MAX_DEPTH = 6;

/**
 * https://cloud.google.com/logging/quotas – payload size cap. 個別 context field で
 * 巨大 base64 blob を丸ごと持ち続けても意味がないので、長い string は
 * 頭尾を残して中央を切り詰める (最初/最後の 4 文字は debug に有用)。
 *
 * top-level log message / stack_trace は `redactString(value, { maxLength })` で
 * 個別に緩めた閾値を指定する (現行: 2048 for message, 8192 for stack)。
 */
const MAX_VALUE_LENGTH = 512;

// ---------------------------------------------------------------------------
// Value pattern matchers
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// 日本の電話番号: 03-1234-5678, 0312345678, 090-1234-5678, +81 3-1234-5678
// および 3-4-4 / 3-3-4 / 2-4-4 の通常書式。国際番号もカバー。
const PHONE_PATTERN = /(?:\+?\d[\s-]?){1,3}\d{1,4}[\s-]?\d{2,4}[\s-]?\d{3,4}/g;

// Bearer <token>: value は必ずマスク。header 経由でも context 経由でも同じ。
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

// JWT: header.payload.signature, base64url
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g;

// Stripe secret keys / OpenAI keys / GitHub PATs
const KNOWN_SECRET_PREFIX_PATTERN =
  /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

// 40+ hex or base64ish — high entropy string ("token-ish")。UUID 全体は
// 事前に UUID_ANY_PATTERN で除外済みなので、ここでの再検査は不要。
const HIGH_ENTROPY_PATTERN = /\b[A-Za-z0-9+/=_-]{40,}\b/g;

// redactString 内で UUID を先に「予約」して phone / high-entropy パターンから
// 隠すために使う。value 途中に埋まっている全 UUID を一括抽出する用の pattern。
const UUID_ANY_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const UUID_PLACEHOLDER_PATTERN = /UUID_(\d+)/g;

// ---------------------------------------------------------------------------
// String-level redaction
// ---------------------------------------------------------------------------

export interface RedactStringOptions {
  /**
   * 最終出力の最大長。redaction 後にこの長さを超えた場合、末尾を切り詰めて
   * `…[truncated]` を付与する。default は個別 context field 向けの
   * {@link MAX_VALUE_LENGTH} (512)。log の top-level `message` / `stack_trace`
   * には caller 側で長めの値を渡す。
   */
  maxLength?: number;
}

/**
 * 単一 string の redaction。純関数。
 *
 * ## 順序
 *
 * 1. UUID を先に「予約」して phone / high-entropy から隠す (UUID の末尾 12 桁は
 *    phone にも high-entropy にも見えるため、隔離しないと誤検知する)
 * 2. prefix 明示的な known secret (Stripe / OpenAI / GitHub PAT)
 * 3. JWT (`eyJ...`)
 * 4. Bearer <token>
 * 5. Email → phone → 高エントロピー汎用置換
 * 6. UUID の復元
 */
export function redactString(
  value: string,
  options?: RedactStringOptions,
): string {
  if (!value) return value;
  const maxLength = options?.maxLength ?? MAX_VALUE_LENGTH;

  // Step 1: UUID を placeholder に隔離
  const uuidMatches: string[] = [];
  let result = value.replace(UUID_ANY_PATTERN, (match) => {
    uuidMatches.push(match);
    return `UUID_${uuidMatches.length - 1}`;
  });

  // Step 2-5: 通常の redaction
  //
  // Bearer は JWT より先に走らせる: "Authorization: Bearer <jwt>" の場合、
  // Bearer プレフィクスと JWT 本体を一括で "[REDACTED:bearer]" にできて意味論的に
  // 素直。逆順だと "Bearer [REDACTED:jwt]" が残り、Bearer 側のパターンが
  // 再マッチしなくなる (Bearer の値部分の文字クラスに "[" が入っていないため)。
  result = result.replace(KNOWN_SECRET_PREFIX_PATTERN, REDACTED_KIND.secret);
  result = result.replace(BEARER_PATTERN, REDACTED_KIND.bearer);
  result = result.replace(JWT_PATTERN, REDACTED_KIND.jwt);
  result = result.replace(EMAIL_PATTERN, REDACTED_KIND.email);
  result = result.replace(PHONE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 9 ? REDACTED_KIND.phone : match;
  });
  result = result.replace(HIGH_ENTROPY_PATTERN, REDACTED_KIND.secret);

  // Step 6: UUID を復元
  result = result.replace(UUID_PLACEHOLDER_PATTERN, (_, index: string) => {
    const idx = Number.parseInt(index, 10);
    return uuidMatches[idx] ?? `UUID_${index}`;
  });

  if (result.length > maxLength) {
    result = `${result.slice(0, maxLength)}…[truncated]`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// URL redaction
// ---------------------------------------------------------------------------

/**
 * requestUrl の query string を必ず落とす。path の UUID / slug は残す。
 *
 * URL parse 失敗時は fail-safe に query 区切り以降を捨てる文字列操作に落とす。
 */
export function redactRequestUrl(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const hasQuery = parsed.search.length > 0 || parsed.searchParams.size > 0;
    parsed.search = hasQuery ? "?[redacted]" : "";
    // hash も query 相当の危険度なので落とす
    if (parsed.hash) parsed.hash = "";
    return parsed.toString();
  } catch {
    const [pathOnly] = url.split(/[?#]/);
    return pathOnly ?? url;
  }
}

// ---------------------------------------------------------------------------
// Deep object redaction
// ---------------------------------------------------------------------------

function isKeyRedacted(key: string): boolean {
  for (const pattern of REDACTION_KEY_PATTERNS) {
    if (pattern.test(key)) return true;
  }
  return false;
}

function redactUnknown(value: unknown, depth: number): unknown {
  if (depth > RECURSION_MAX_DEPTH) return "[REDACTED:depth-exceeded]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, depth + 1));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (isKeyRedacted(key)) {
        result[key] = REDACTED_KIND.keyBased;
        continue;
      }
      result[key] = redactUnknown(value[key], depth + 1);
    }
    return result;
  }
  // function / symbol 等
  return "[REDACTED:non-serializable]";
}

/**
 * ログ用 context の deep clone + redaction。純関数。caller の元 object は
 * mutate しない (Cloud Logging に流したあと、caller 側のビジネス処理が context
 * を再利用するケースを想定)。
 */
export function redactContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (context === undefined) return undefined;
  try {
    const result = redactUnknown(context, 0);
    if (isRecord(result)) return result;
    // 通常ここへは到達しない (input が Record なので output も Record) が、
    // 型 narrowing の contract を破らないため defensive に fallback する。
    return { value: result };
  } catch {
    // 何が起きても error object を持ち込まないよう safe 化する
    return { redactionError: REDACTED_KIND.error };
  }
}

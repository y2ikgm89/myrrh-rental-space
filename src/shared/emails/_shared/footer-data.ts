/**
 * メールフッター用データ取得
 *
 * 全テンプレに統一して挿入する事業者情報・法的リンク・お問い合わせ窓口を集約する。
 * 特定電子メール法上、取引メール（予約確認・キャンセル通知等）はオプトアウト不要だが、
 * 送信者の身元（事業者名・所在地・連絡先）と関連規約への参照は信頼醸成・特商法表記の
 * 一貫性確保のため全テンプレで提供する。
 *
 * 取引メール vs 配信メールの区別:
 *   現状このプロジェクトはマーケティング配信メールを送らない（全て取引通知）。
 *   将来 newsletter を追加する場合はフッターに opt-out URL を生やすこと。
 *
 * URL スキーム allowlist:
 *   `legalLinks[].href` / `siteUrl` は `http(s):`、`contactEmail` は `mailto:` のみ
 *   許可する defense-in-depth。現状の入力境界（Terms.slug の正規表現・Settings.email の
 *   Zod 検証）で `javascript:` 等は構造的に到達不能だが、将来 admin が footer URL を
 *   直接編集できる UI を増やした際の preview iframe / 受信メールクライアント側 XSS 経路
 *   を遮断するため。
 */

import "server-only";

import { getFooterTerms } from "@/shared/domain/terms/queries";
import { getPublicBusinessSettings } from "@/shared/domain/settings/queries/organization";
import { getBaseUrl } from "@/shared/lib/constants";
import { SITE_DEFAULTS } from "@/shared/lib/constants";

export interface EmailFooterLink {
  /** フッターに出すラベル（例: 「利用規約」） */
  label: string;
  /** 絶対 URL（http(s): のみ） */
  href: string;
}

export interface EmailFooterData {
  /** 事業者名（フォールバック: SITE_DEFAULTS.name） */
  businessName: string;
  /** 全角の所在地行（郵便番号 + 都道府県 + 市区町村 + 番地 + 建物。空文字なら表示しない） */
  address: string;
  /** 電話番号（null なら表示しない） */
  phoneNumber: string | null;
  /** お問い合わせ用メールアドレス（null なら表示しない・mailto: に組み立て可能なローカル+ドメイン形式） */
  contactEmail: string | null;
  /** ©︎ ラインに出すサイト名 */
  siteName: string;
  /** 公開サイトのトップ URL（http(s): のみ・不正なら null） */
  siteUrl: string | null;
  /** フッター表示対象の規約リンク（footerOrder 順・不正 URL は除外済） */
  legalLinks: EmailFooterLink[];
}

const NON_EMPTY = (s: string | null | undefined): s is string =>
  typeof s === "string" && s.trim().length > 0;

/** EmailFooter で実際にリンク化される全 href を許可する scheme allowlist。 */
const ALLOWED_HTTP_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

function isSafeHttpUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return ALLOWED_HTTP_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

/** RFC 5321 完全準拠ではないが mailto: 化に十分な軽量検証（`local@domain.tld`）。 */
const EMAIL_LIKE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

function isSafeContactEmail(email: string): boolean {
  return EMAIL_LIKE.test(email);
}

function composeAddress(parts: {
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
}): string {
  const segments: string[] = [];
  if (NON_EMPTY(parts.postalCode)) segments.push(`〒${parts.postalCode}`);
  const main = [
    parts.prefecture,
    parts.city,
    parts.streetAddress,
    parts.buildingName,
  ]
    .filter(NON_EMPTY)
    .join(" ");
  if (main.length > 0) segments.push(main);
  return segments.join(" ");
}

/**
 * メールフッター用データを返す。送信側 `*-emails.ts` から呼び、テンプレに props で流す。
 *
 * 失敗時（DB unreachable 等）はサイト名のみのフォールバックを返す。fallback の意図は
 * 「フッター欠落でメール送信自体は止めない」（取引メールは法令上送信義務に近い）。
 */
export async function getEmailFooterData(): Promise<EmailFooterData> {
  const [settings, terms] = await Promise.all([
    getPublicBusinessSettings(),
    getFooterTerms(),
  ]);

  const baseUrl = getBaseUrl();
  const siteUrl = isSafeHttpUrl(baseUrl) ? baseUrl : null;

  const businessName =
    (NON_EMPTY(settings?.businessName) ? settings.businessName : null) ??
    (NON_EMPTY(settings?.siteName) ? settings.siteName : null) ??
    SITE_DEFAULTS.name;

  const siteName =
    (NON_EMPTY(settings?.siteName) ? settings.siteName : null) ?? businessName;

  const address = settings
    ? composeAddress({
        postalCode: settings.postalCode,
        prefecture: settings.prefecture,
        city: settings.city,
        streetAddress: settings.streetAddress,
        buildingName: settings.buildingName,
      })
    : "";

  const phoneNumber = NON_EMPTY(settings?.phoneNumber)
    ? settings.phoneNumber
    : null;

  const rawContact = NON_EMPTY(settings?.email) ? settings.email : null;
  const contactEmail =
    rawContact && isSafeContactEmail(rawContact) ? rawContact : null;

  const legalLinks: EmailFooterLink[] = siteUrl
    ? terms
        .map((t) => ({
          label: t.title,
          href: `${siteUrl}/terms/${t.slug}`,
        }))
        .filter((link) => isSafeHttpUrl(link.href))
    : [];

  return {
    businessName,
    address,
    phoneNumber,
    contactEmail,
    siteName,
    siteUrl,
    legalLinks,
  };
}

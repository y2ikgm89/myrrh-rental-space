/**
 * 規約テンプレート定義
 *
 * 規約バージョン作成時に使用できるテンプレートを提供
 */

import { TermsType } from "@generated/prisma/enums";

export interface TermsTemplate {
  id: string;
  label: string;
  description: string;
  content: string;
}

/**
 * 利用規約テンプレート
 */
const TERMS_OF_USE_TEMPLATE: TermsTemplate = {
  id: "terms-of-use",
  label: "レンタルスペース利用規約",
  description: "レンタルスペースの基本的な利用規約テンプレート",
  content: `<h2>事業者情報</h2>
<p>【事業者名を入力してください】<br>
所在地：【住所を入力してください】<br>
連絡先：【メールアドレス/電話番号を入力してください】</p>

<h2>第1条（適用）</h2>
<p>本規約は、当施設が提供するレンタルスペースサービス（以下「本サービス」といいます）の利用に関する条件を定めるものです。利用者は、本規約に同意の上、本サービスをご利用ください。</p>

<h2>第2条（利用申込み）</h2>
<ol>
<li>本サービスの利用を希望する方は、当施設所定の方法により利用申込みを行うものとします。</li>
<li>当施設は、利用申込みを承諾した場合、利用者に対して予約確認を通知します。</li>
<li>予約の成立は、当施設からの予約確認通知をもって完了するものとします。</li>
</ol>

<h2>第3条（利用料金）</h2>
<ol>
<li>利用者は、当施設が定める利用料金を支払うものとします。</li>
<li>利用料金の支払方法は、当施設が指定する方法によるものとします。</li>
<li>一度支払われた利用料金は、当施設のキャンセルポリシーに従って取り扱われます。</li>
</ol>

<h2>第4条（利用上の注意）</h2>
<p>利用者は、本サービスの利用にあたり、以下の事項を遵守するものとします。</p>
<ul>
<li>予約時間を厳守すること</li>
<li>スペース内の設備・備品を丁寧に取り扱うこと</li>
<li>他の利用者や近隣への迷惑となる行為をしないこと</li>
<li>法令および公序良俗に反する行為をしないこと</li>
<li>利用終了時は原状回復を行うこと</li>
</ul>

<h2>第5条（禁止事項）</h2>
<p>利用者は、以下の行為を行ってはなりません。</p>
<ul>
<li>危険物の持ち込み</li>
<li>喫煙（指定場所を除く）</li>
<li>騒音を発する行為</li>
<li>設備・備品の持ち出し</li>
<li>無断での第三者への転貸</li>
<li>その他、当施設が不適切と判断する行為</li>
</ul>

<h2>第6条（損害賠償）</h2>
<ol>
<li>利用者が故意または過失により当施設の設備・備品等を破損・紛失した場合、その損害を賠償する責任を負います。</li>
<li>利用者の行為により第三者に損害を与えた場合、利用者が一切の責任を負うものとします。</li>
</ol>

<h2>第7条（免責事項）</h2>
<ol>
<li>当施設は、天災、停電、システム障害その他の不可抗力により生じた損害について、責任を負いません。</li>
<li>利用者の私物の盗難・紛失について、当施設は責任を負いません。</li>
</ol>

<h2>第8条（規約の変更）</h2>
<p>当施設は、必要に応じて本規約を変更することがあります。変更後の規約は、当施設ウェブサイトに掲載した時点から効力を生じるものとします。</p>

<h2>第9条（準拠法・管轄）</h2>
<p>本規約の解釈および適用は日本法に準拠し、本規約に関する紛争については、当施設の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>

<h2>第10条（お問い合わせ）</h2>
<p>本規約に関するお問い合わせは、上記連絡先までご連絡ください。</p>`,
};

/**
 * プライバシーポリシーテンプレート
 */
const PRIVACY_POLICY_TEMPLATE: TermsTemplate = {
  id: "privacy-policy",
  label: "プライバシーポリシー",
  description:
    "個人情報の取り扱いに関するポリシーテンプレート（外部サービス対応）",
  content: `<h2>1. 事業者情報</h2>
<p>【事業者名を入力してください】<br>
所在地：【住所を入力してください】<br>
連絡先：【メールアドレス/電話番号を入力してください】</p>

<h2>2. 個人情報の収集</h2>
<p>当施設は、サービスの提供にあたり、以下の個人情報を収集することがあります。</p>
<ul>
<li>氏名</li>
<li>メールアドレス</li>
<li>電話番号</li>
<li>住所</li>
<li>決済に必要な情報（クレジットカード情報は決済代行会社が管理）</li>
<li>その他、サービス利用に必要な情報</li>
</ul>

<h2>3. 個人情報の利用目的</h2>
<p>収集した個人情報は、以下の目的で利用します。</p>
<ul>
<li>予約の受付・管理</li>
<li>サービスに関するご連絡</li>
<li>料金の請求・決済処理</li>
<li>お問い合わせへの対応</li>
<li>サービスの改善・新サービスの開発</li>
<li>法令に基づく対応</li>
</ul>

<h2>4. 個人情報の第三者提供</h2>
<p>当施設は、以下の場合を除き、個人情報を第三者に提供しません。</p>
<ul>
<li>利用者の同意がある場合</li>
<li>法令に基づく場合</li>
<li>人の生命、身体または財産の保護のために必要な場合</li>
<li>業務委託先に必要な範囲で提供する場合（守秘義務を課した上で）</li>
</ul>

<h2>5. 外部サービスの利用</h2>
<p>当施設では、以下の外部サービスを利用しています。各サービスのプライバシーポリシーもご確認ください。</p>

<h3>決済サービス（Stripe）</h3>
<p>オンライン決済にStripe, Inc.のサービスを利用しています。クレジットカード情報は当施設のサーバーには保存されず、Stripeが安全に管理します。</p>
<ul>
<li>Stripeプライバシーポリシー：https://stripe.com/jp/privacy</li>
</ul>

<h3>アクセス解析（Google Analytics）</h3>
<p>サービス向上のため、Google LLCが提供するGoogle Analyticsを利用してアクセス情報を収集しています。収集される情報は匿名化されており、個人を特定することはできません。</p>
<ul>
<li>Googleプライバシーポリシー：https://policies.google.com/privacy</li>
<li>Google Analyticsオプトアウト：https://tools.google.com/dlpage/gaoptout</li>
</ul>

<h3>セキュリティ対策（Cloudflare Turnstile）</h3>
<p>不正アクセス防止のため、Cloudflare, Inc.が提供するTurnstileを利用しています。</p>
<ul>
<li>Cloudflareプライバシーポリシー：https://www.cloudflare.com/privacypolicy/</li>
</ul>

<h2>6. アクセスログ</h2>
<p>当施設のウェブサイトでは、以下の情報を自動的に収集・記録しています。</p>
<ul>
<li>IPアドレス</li>
<li>ブラウザの種類・バージョン</li>
<li>アクセス日時</li>
<li>閲覧したページ</li>
</ul>
<p>これらの情報は、サービスの安定運用、セキュリティ対策、利用状況の分析のために使用します。</p>

<h2>7. Cookieの使用</h2>
<p>当施設のウェブサイトでは、以下の目的でCookieを使用しています。</p>
<ul>
<li>ログイン状態の維持</li>
<li>アクセス解析</li>
<li>セキュリティ対策</li>
</ul>
<p>ブラウザの設定により、Cookieの受け入れを拒否することも可能ですが、一部のサービスが利用できなくなる場合があります。</p>

<h2>8. 個人情報の管理</h2>
<p>当施設は、個人情報保護法その他の関連法令を遵守し、個人情報の漏洩、滅失、毀損を防止するため、適切な安全管理措置を講じます。</p>

<h2>9. 個人情報の開示・訂正・削除</h2>
<p>利用者は、当施設が保有する自己の個人情報について、開示・訂正・削除を請求することができます。請求があった場合、本人確認の上、合理的な期間内に対応します。</p>

<h2>10. お問い合わせ</h2>
<p>個人情報の取り扱いに関するお問い合わせは、上記連絡先までご連絡ください。</p>

<h2>11. プライバシーポリシーの変更</h2>
<p>当施設は、必要に応じて本プライバシーポリシーを変更することがあります。重要な変更がある場合は、ウェブサイト上でお知らせします。変更後のポリシーは、当施設ウェブサイトに掲載した時点から効力を生じるものとします。</p>`,
};

/**
 * キャンセルポリシーテンプレート
 */
const CANCELLATION_POLICY_TEMPLATE: TermsTemplate = {
  id: "cancellation-policy",
  label: "キャンセルポリシー",
  description: "予約キャンセルに関するポリシーテンプレート",
  content: `<h2>事業者情報</h2>
<p>【事業者名を入力してください】<br>
所在地：【住所を入力してください】<br>
連絡先：【メールアドレス/電話番号を入力してください】</p>

<h2>キャンセル料金について</h2>
<p>ご予約のキャンセルには、以下のキャンセル料金が発生します。</p>

<table>
<thead>
<tr>
<th>キャンセル時期</th>
<th>キャンセル料</th>
</tr>
</thead>
<tbody>
<tr>
<td>ご利用日の7日前まで</td>
<td>無料</td>
</tr>
<tr>
<td>ご利用日の3日前〜6日前</td>
<td>利用料金の30%</td>
</tr>
<tr>
<td>ご利用日の前日〜2日前</td>
<td>利用料金の50%</td>
</tr>
<tr>
<td>ご利用日当日</td>
<td>利用料金の100%</td>
</tr>
<tr>
<td>無断キャンセル</td>
<td>利用料金の100%</td>
</tr>
</tbody>
</table>

<h2>キャンセル方法</h2>
<ol>
<li>予約のキャンセルは、マイページまたはお電話にて承ります。</li>
<li>キャンセルの受付は、営業時間内（平日9:00〜18:00）とさせていただきます。</li>
<li>営業時間外に送信されたキャンセル連絡は、翌営業日の受付となります。</li>
</ol>

<h2>返金について</h2>
<ul>
<li>クレジットカード決済の場合：キャンセル料を差し引いた金額を、カード会社を通じて返金いたします。返金時期はカード会社により異なります。</li>
<li>銀行振込の場合：キャンセル料および振込手数料を差し引いた金額を、指定の口座に返金いたします。</li>
</ul>

<h2>予約変更について</h2>
<ul>
<li>日時変更は、キャンセル扱いとなり、新規予約として承ります。</li>
<li>空き状況により、ご希望の日時に変更できない場合があります。</li>
</ul>

<h2>当施設都合によるキャンセル</h2>
<p>天災、設備故障その他やむを得ない事情により、当施設がサービスを提供できない場合は、利用料金の全額を返金いたします。この場合、キャンセル料は発生しません。</p>

<h2>注意事項</h2>
<ul>
<li>遅刻による利用時間の短縮は、キャンセル・返金の対象外です。</li>
<li>予約時間の延長は、後続の予約状況により承れない場合があります。</li>
</ul>

<h2>お問い合わせ</h2>
<p>キャンセルに関するお問い合わせは、上記連絡先までご連絡ください。</p>`,
};

/**
 * 支払い規約テンプレート
 */
const PAYMENT_TERMS_TEMPLATE: TermsTemplate = {
  id: "payment-terms",
  label: "支払い規約",
  description: "料金・支払いに関する規約テンプレート",
  content: `<h2>事業者情報</h2>
<p>【事業者名を入力してください】<br>
所在地：【住所を入力してください】<br>
連絡先：【メールアドレス/電話番号を入力してください】</p>

<h2>1. 料金体系</h2>
<h3>基本料金</h3>
<ul>
<li>利用料金は、スペースごとに設定された時間単価に利用時間を乗じて算出されます。</li>
<li>料金には消費税が含まれています（税込表示）。</li>
</ul>

<h3>オプション料金</h3>
<p>以下のオプションサービスは、別途料金が発生します。</p>
<ul>
<li>延長利用</li>
<li>追加備品のレンタル</li>
<li>清掃サービス</li>
<li>その他、各スペースで定めるオプションサービス</li>
</ul>

<h2>2. 支払方法</h2>
<p>以下の支払方法をご利用いただけます。</p>
<ul>
<li>クレジットカード（VISA、Mastercard、JCB、American Express）</li>
<li>銀行振込（前払い）</li>
</ul>

<h2>3. 支払時期</h2>
<h3>クレジットカード決済</h3>
<p>予約確定時に決済が行われます。</p>

<h3>銀行振込</h3>
<ul>
<li>予約確定後、3営業日以内にお振込みください。</li>
<li>振込手数料はお客様のご負担となります。</li>
<li>入金確認をもって予約完了となります。</li>
<li>期日までにお振込みがない場合、予約は自動的にキャンセルとなります。</li>
</ul>

<h2>4. 領収書</h2>
<ul>
<li>領収書は、マイページからダウンロードいただけます。</li>
<li>宛名の変更が必要な場合は、お問い合わせください。</li>
</ul>

<h2>5. 追加料金</h2>
<p>以下の場合、追加料金が発生することがあります。</p>
<ul>
<li>利用時間の延長</li>
<li>清掃が必要な場合（通常を超える汚損）</li>
<li>設備・備品の破損・紛失</li>
</ul>

<h2>6. 返金</h2>
<p>返金が発生する場合の取り扱いは、キャンセルポリシーに準じます。</p>

<h2>7. 料金の改定</h2>
<p>当施設は、経済状況の変化等により、料金を改定することがあります。改定後の料金は、改定日以降の新規予約に適用されます。</p>

<h2>8. お問い合わせ</h2>
<p>お支払いに関するお問い合わせは、上記連絡先までご連絡ください。</p>`,
};

/**
 * 規約タイプごとのテンプレート定義
 */
export const TERMS_TEMPLATES: Record<TermsType, TermsTemplate[]> = {
  [TermsType.TERMS_OF_USE]: [TERMS_OF_USE_TEMPLATE],
  [TermsType.PRIVACY_POLICY]: [PRIVACY_POLICY_TEMPLATE],
  [TermsType.CANCELLATION]: [CANCELLATION_POLICY_TEMPLATE],
  [TermsType.PAYMENT]: [PAYMENT_TERMS_TEMPLATE],
  [TermsType.CUSTOM]: [], // カスタム規約はテンプレートなし
};

/**
 * 規約タイプに対応するテンプレートを取得
 */
export function getTemplatesForType(termsType: TermsType): TermsTemplate[] {
  return TERMS_TEMPLATES[termsType] ?? [];
}

/**
 * テンプレートIDからテンプレートを取得
 */
export function getTemplateById(
  termsType: TermsType,
  templateId: string,
): TermsTemplate | undefined {
  const templates = getTemplatesForType(termsType);
  return templates.find((t) => t.id === templateId);
}

/**
 * テンプレートに埋め込む事業者情報
 */
export interface BusinessInfo {
  businessName: string | null;
  email: string | null;
  phoneNumber: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
}

/**
 * 住所を組み立てる
 */
function buildAddress(info: BusinessInfo): string {
  const parts = [
    info.postalCode ? `〒${info.postalCode}` : null,
    info.prefecture,
    info.city,
    info.streetAddress,
    info.buildingName,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : "【住所を入力してください】";
}

/**
 * 連絡先を組み立てる
 */
function buildContact(info: BusinessInfo): string {
  const parts = [];
  if (info.email) parts.push(info.email);
  if (info.phoneNumber) parts.push(`TEL: ${info.phoneNumber}`);

  return parts.length > 0
    ? parts.join(" / ")
    : "【メールアドレス/電話番号を入力してください】";
}

/**
 * テンプレートのプレースホルダーを事業者情報で置換
 */
export function applyBusinessInfo(content: string, info: BusinessInfo): string {
  const replacements: Record<string, string> = {
    "【事業者名を入力してください】":
      info.businessName || "【事業者名を入力してください】",
    "【住所を入力してください】": buildAddress(info),
    "【メールアドレス/電話番号を入力してください】": buildContact(info),
  };

  let result = content;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(placeholder, value);
  }

  return result;
}

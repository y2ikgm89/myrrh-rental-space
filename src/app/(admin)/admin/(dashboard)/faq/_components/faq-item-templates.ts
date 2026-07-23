/**
 * FAQ質問追加ダイアログ用の雛形（例文）データ。
 * DBを持たない静的コンテンツ。選択後は管理者が内容を編集する前提のため、
 * 事業者固有の条件（金額・料率・具体的な手段名等）は「◯」で表現する。
 */

export const FAQ_ITEM_TEMPLATE_GROUPS = [
  "予約・キャンセル",
  "支払い",
  "設備・利用",
  "アクセス・その他",
] as const;

export type FaqItemTemplateGroup = (typeof FAQ_ITEM_TEMPLATE_GROUPS)[number];

export const FAQ_ITEM_TEMPLATES = [
  {
    id: "cancel-policy",
    group: "予約・キャンセル",
    question: "予約はいつまでキャンセルできますか？",
    answer:
      "利用日の◯日前までは無料でキャンセルいただけます。それ以降のキャンセルにはキャンセル料が発生します。詳細は予約確認メールをご確認ください。",
  },
  {
    id: "reservation-change",
    group: "予約・キャンセル",
    question: "予約内容を変更したいのですが可能ですか？",
    answer:
      "利用日の◯日前までであれば、マイページまたはお問い合わせフォームより変更を承ります。当日変更はお問い合わせください。",
  },
  {
    id: "reservation-confirm-timing",
    group: "予約・キャンセル",
    question: "予約はいつ確定しますか？",
    answer:
      "お申し込み後、内容確認のうえ確定次第、確認メールをお送りします。通常◯営業日以内にご連絡します。",
  },
  {
    id: "reservation-late-arrival",
    group: "予約・キャンセル",
    question: "予約時間に遅れそうな場合はどうすればいいですか？",
    answer:
      "事前にお電話またはお問い合わせフォームよりご連絡ください。連絡なく大幅に遅れた場合、利用時間は予約時間どおり終了となります。",
  },
  {
    id: "payment-methods",
    group: "支払い",
    question: "支払い方法を教えてください",
    answer:
      "クレジットカード決済に対応しています。詳細はご予約手続き画面でご確認ください。",
  },
  {
    id: "receipt-issue",
    group: "支払い",
    question: "領収書は発行してもらえますか？",
    answer:
      "マイページの予約詳細画面から領収書をダウンロードいただけます。宛名の指定が必要な場合はお問い合わせください。",
  },
  {
    id: "extension-fee",
    group: "支払い",
    question: "利用時間を延長した場合の追加料金はどうなりますか？",
    answer:
      "延長料金は1時間あたり◯円です。当日空きがある場合のみ延長を承ります。",
  },
  {
    id: "wifi-equipment",
    group: "設備・利用",
    question: "Wi-Fiや設備は利用できますか？",
    answer:
      "Wi-Fi・プロジェクター等の設備を無料でご利用いただけます。詳細はスペースごとの設備一覧をご確認ください。",
  },
  {
    id: "food-drink-policy",
    group: "設備・利用",
    question: "飲食は可能ですか？",
    answer:
      "飲食可能です。ゴミはお持ち帰りいただくか、備え付けのゴミ箱にお捨てください。",
  },
  {
    id: "capacity-over",
    group: "設備・利用",
    question: "予約人数より多い人数で利用できますか？",
    answer:
      "定員を超えるご利用はお断りしております。人数変更がある場合は事前にご連絡ください。",
  },
  {
    id: "damage-policy",
    group: "設備・利用",
    question: "設備を破損した場合はどうなりますか？",
    answer:
      "速やかにスタッフまでご連絡ください。故意・過失による破損の場合、修理費用をご請求する場合があります。",
  },
  {
    id: "parking-availability",
    group: "アクセス・その他",
    question: "駐車場はありますか？",
    answer:
      "敷地内に◯台分の駐車スペースがございます。満車の場合は近隣のコインパーキングをご利用ください。",
  },
  {
    id: "station-access",
    group: "アクセス・その他",
    question: "最寄り駅からのアクセスを教えてください",
    answer: "◯駅から徒歩◯分です。詳細な道順はアクセスページをご確認ください。",
  },
  {
    id: "entry-method",
    group: "アクセス・その他",
    question: "当日の入館方法を教えてください",
    answer:
      "予約確認メールに記載の入館コードをご利用ください。不明な場合はお問い合わせください。",
  },
] as const;

export type FaqItemTemplate = (typeof FAQ_ITEM_TEMPLATES)[number];

/** id から雛形を解決する。未知の id は undefined を返す。 */
export function resolveFaqItemTemplateById(
  id: string,
): FaqItemTemplate | undefined {
  return FAQ_ITEM_TEMPLATES.find((template) => template.id === id);
}

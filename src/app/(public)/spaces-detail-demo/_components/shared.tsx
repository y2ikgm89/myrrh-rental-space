export interface VariantMeta {
  readonly id: "a" | "b" | "c" | "d" | "e";
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly reference: string;
}

export const VARIANTS: readonly VariantMeta[] = [
  {
    id: "a",
    name: "Airbnb Photo Mosaic",
    tagline: "Gallery-first / Sticky pricing",
    description:
      "全幅 4-grid mosaic gallery で部屋の魅力を最大化、その下に description / amenities / location を縦長 scroll、右に sticky pricing widget。Airbnb / Vrbo / Booking.com の国際標準パターン。",
    pros: [
      "Gallery が main visual で第一印象が強い",
      "国際標準で訪問者の mental model と一致",
      "Sticky widget で常時予約導線可視",
    ],
    cons: [
      "Gallery 画像が複数枚必要 (1 枚のみだと寂しい印象)",
      "Above-the-fold が画像中心で text 情報が少ない",
    ],
    reference: "Airbnb / Vrbo / Booking.com / Hotels.com listing detail",
  },
  {
    id: "b",
    name: "Booking.com Hero + Side Widget",
    tagline: "Immediate booking / Hero-row pricing",
    description:
      "Hero gallery 全幅 + 価格・予約 widget が hero 内右側にすぐ表示。ユーザーが scroll する前に料金と予約 CTA を確認できる即予約志向 UX。",
    pros: [
      "Above-the-fold で価格・予約 CTA が即可視",
      "scroll friction 最低、CVR 最大化",
      "Booking.com の世界トップシェア UX を踏襲",
    ],
    cons: [
      "Hero 情報密度が高く editorial brand と乖離",
      "Mobile では widget が積み重なって縦長化",
    ],
    reference: "Booking.com / Hotels.com / Expedia property page",
  },
  {
    id: "c",
    name: "Editorial Magazine 改良",
    tagline: "Brand-first / Whitespace-driven",
    description:
      "現状の Kinfolk hairline パターンをベースに、タイポ精緻化 + 余白 + section divider で editorial 雑誌風を徹底。serif heading + drop-cap で「読ませる」UX。",
    pros: [
      "Editorial Magazine brand と完全整合",
      "Whitespace で luxury 感",
      "serif heading の typography 活用",
    ],
    cons: [
      "即予約 friction 高 (scroll 必要)",
      "Gallery インパクトが控えめ",
      "業界主流 (Airbnb) から外れる独自路線",
    ],
    reference: "Kinfolk / Cereal Magazine / The Gentlewoman",
  },
  {
    id: "e",
    name: "Booking × Editorial Hybrid",
    tagline: "Booking.com 構造 × Kinfolk brand",
    description:
      "B の即予約 UX 構造 (hero gallery 全幅 + price widget hero 内右) に C の Editorial Magazine brand (hairline / serif heading / italic / 余白 / accent bronze / pull quote) を注入したハイブリッド。CVR と brand integrity の両立を試みる。",
    pros: [
      "即予約 CTA が above-the-fold で可視 (B の CVR 強み)",
      "Kinfolk brand 整合 (serif heading / hairline / italic / accent)",
      "Editorial 余白 + Booking.com 情報密度のバランス",
      "国際標準構造 (Booking.com) と独自 brand の両立",
    ],
    cons: [
      "B 単独より情報密度がやや控えめ (editorial 余白優先)",
      "Editorial 純度は C より低い",
      "ハイブリッドゆえ単一明確な業界 reference がない",
    ],
    reference: "Booking.com 構造 × Kinfolk / Cereal brand 解釈",
  },
  {
    id: "d",
    name: "Tab Navigation (国内 Spacemarket 風)",
    tagline: "Tabbed sections / Compact scroll",
    description:
      "cover + price widget 同行 + tab で「概要 / 設備 / アクセス / 口コミ」切替。情報密度を保ちつつ scroll friction を低減する国内スペース予約サービスの慣習パターン。",
    pros: [
      "国内ユーザー馴染みのある UX",
      "Scroll friction 低、欲しい情報に直アクセス",
      "情報整理されて視認性高",
    ],
    cons: [
      "Tab 切替 = SPA 感が brand と合わない",
      "SEO 上 tab 内コンテンツが下位扱いされる可能性",
      "ARIA Tabs 実装の a11y 工数",
    ],
    reference: "Spacemarket / インスタベース / Airb 国内競合",
  },
];

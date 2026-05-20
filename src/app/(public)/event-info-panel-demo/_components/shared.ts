export interface EventInfoSample {
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly venueName: string;
  readonly capacity: number;
  readonly remaining: number;
  readonly price: number;
  readonly status: "open" | "full" | "deadline-passed" | "closed";
  readonly registerHref: string;
}

export const SAMPLE: EventInfoSample = {
  title: "ヨガ＆マインドフルネス体験会",
  startTime: "2026年5月15日(金) 10:00 - 12:00",
  endTime: "12:00",
  venueName: "スタジオA",
  capacity: 15,
  remaining: 12,
  price: 2000,
  status: "open",
  registerHref: "#event-register",
} as const;

export interface VariantMeta {
  readonly id: "a" | "b" | "c" | "d" | "e" | "f";
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
}

export const VARIANTS: readonly VariantMeta[] = [
  {
    id: "a",
    name: "Hero Price + Compact",
    tagline: "price hero · ticket panel UX",
    description:
      "参加費を最上部の hero element として大型表示し、メタ情報は compact icon + value rows で凝縮。Eventbrite / Peatix の ticket panel と同パターンで、申込導線（価格認知 → CTA）を最優先化。",
    pros: [
      "価格認知が最速で、CV ファネルが明確",
      "ticket 系業界標準で UX 学習コストゼロ",
      "Status → 価格 → CTA の縦 flow が strong",
    ],
    cons: [
      "editorial magazine トーンから商業的方向へシフト",
      "「価格 > 体験」の印象が出やすい",
    ],
  },
  {
    id: "b",
    name: "Editorial Sequenced",
    tagline: "01 / 02 / 03 · serif italic",
    description:
      "Kinfolk Journal 風の序数（01/02/03/04）+ Cormorant Garamond italic ラベル。アイコンを排し、活字体の格調と余白で情報を構造化。Myrrh の editorial magazine トーンと最も整合。",
    pros: [
      "ブランドトーン (Editorial Magazine) と完全整合",
      "差別化された格調高い印象",
      "アイコン無しで視覚ノイズが少ない",
    ],
    cons: [
      "icon 無しで scan 速度がやや劣る",
      "情報量が多い場合に窮屈になりうる",
    ],
  },
  {
    id: "c",
    name: "Split Hero Card",
    tagline: "surface hero block + compact list",
    description:
      "上半分: bg-surface の hero block に Status + 大型価格 + 締切日を集約。下半分: bg-background の compact メタ情報 list。Lu.ma / Cal.com の現代 booking widget パターン。視覚的 2 ゾーン分離。",
    pros: [
      "明確な視覚ヒエラルキー (hero → details)",
      "現代 booking widget の業界標準で学習コスト低",
      "Status と価格を一塊で訴求",
    ],
    cons: [
      "bg-surface との切替で warm 感が崩れる可能性",
      "editorial トーンより SaaS 寄り",
    ],
  },
  {
    id: "d",
    name: "Minimal Whitespace",
    tagline: "borderless · typography rhythm",
    description:
      "Apple / Stripe / Notion booking 風の極限ミニマル。border / hairline を最小限にし、typographic rhythm（uppercase eyebrow + 値）と white space のみで構造化。Luxury White × Bronze と最も親和。",
    pros: [
      "白基調 brand と最も調和",
      "Luxury / Minimal トーンを最大化",
      "情報がスッキリ scan しやすい",
    ],
    cons: [
      "パネルの「枠」感が弱く、CTA との関係が薄れる",
      "視覚的境界が無いため周囲レイアウトに依存",
    ],
  },
  {
    id: "e",
    name: "Timeline Vertical",
    tagline: "vertical hairline + icon spots",
    description:
      "縦の hairline + icon spot で「準備 → 当日」のイベント流れを暗示する timeline 構造。Notion / Linear / GitHub Issues タイムラインと同パターン。イベントの「時系列性」を視覚的に強調。",
    pros: [
      "イベントの「流れ」を visual metaphor で表現",
      "icon spot の rhythm が editorial 感",
      "差別化されたアイコニックな panel",
    ],
    cons: [
      "本来 timeline ではない情報を timeline 化する違和感",
      "縦長になり sticky 配置で sidebar が長くなる",
    ],
  },
  {
    id: "f",
    name: "Bento Grid",
    tagline: "2×2 cards + price hero",
    description:
      "現代 SaaS dashboard 風の Bento Grid。4 メタ情報を 2×2 grid のカードに分割、価格は full-width の hero card として最上部に。視覚インパクト最大、各情報が独立した「タイル」として知覚される。",
    pros: [
      "視覚インパクト最大、スキャン性最高",
      "現代的でテクニカル / 高解像度な印象",
      "情報の塊感が明確",
    ],
    cons: [
      "editorial magazine トーンから完全に離脱",
      "余白が少なく情報密度が高いため疲労感",
    ],
  },
];

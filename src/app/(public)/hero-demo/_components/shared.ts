export interface HeroDemoImage {
  readonly url: string;
  readonly alt: string;
}

export const DEMO_IMAGES: readonly HeroDemoImage[] = [
  {
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
    alt: "自然光が差し込む開放的なレンタルスペース",
  },
  {
    url: "https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=1200&q=80",
    alt: "木の質感が美しいワークスペース",
  },
  {
    url: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80",
    alt: "モダンなデザインのコワーキングスペース",
  },
];

export const COPY = {
  label: "Volume One — Spring 2026",
  title: "Where silence works.",
  description:
    "静けさが仕事をする場所。Myrrh は光と余白を大切にした、思考のためのレンタルスペースです。",
  buttonText: "Reserve a space",
  buttonUrl: "/reservation",
} as const;

export interface VariantMeta {
  readonly id: "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k";
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
}

export const VARIANTS: readonly VariantMeta[] = [
  {
    id: "a",
    name: "Editorial Sandwich",
    tagline: "text → image → text",
    description:
      "雑誌記事のような流れ。見出しと本文の間に画像が挟まる editorial sandwich パターン。画像が text の文脈に組み込まれる。",
    pros: [
      "画像が text context に組み込まれる",
      "ページ上部に title+label が来るので識別が早い",
      "雑誌的フォーマットに忠実",
    ],
    cons: [
      "CTA が画像の下で fold 外になりやすい",
      "画像高さ (portrait 4:5) が大きく見える",
    ],
  },
  {
    id: "b",
    name: "Typography First",
    tagline: "text block + gallery",
    description:
      "タイポグラフィを主役にし、画像は gallery として下部に配置。swipe + 番号 pagination で mobile-native な操作。CTA が first view に収まりやすい。",
    pros: [
      "CTA が fold 内に収まる",
      "ブランドメッセージ優先の editorial トーン",
      "swipe + dots + numbered の 3 入力経路で a11y 良好",
    ],
    cons: ["画像のインパクトが弱い", "rental space の「空間」訴求が遅れる"],
  },
  {
    id: "c",
    name: "Magazine Cover",
    tagline: "masthead · centered · inset",
    description:
      "印刷雑誌カバー構造の再現。上下に masthead/credit band、センターに serif 見出し、inset image with side margins で mounted photo 感を演出。",
    pros: [
      "他案と最も差別化できる editorial 感",
      "印刷物のような上品な佇まい",
      "BRAND 名が masthead で強調される",
    ],
    cons: [
      "見出しが短い必要がある（長文だと崩れる）",
      "CTA の存在感が弱く conversion に劣る",
    ],
  },
  {
    id: "d",
    name: "Vertical Gallery",
    tagline: "text + 3 stacked images",
    description:
      "hero text の下に 3 枚の画像を異なる aspect ratio で stack。landscape (3:2) → portrait (4:5) → wide (16:10) のリズムで誌面的変化。",
    pros: [
      "全画像を一度に見られる（carousel 操作不要）",
      "各画像が独立した作品として成立",
      "aspect ratio の変化が視覚リズムを生む",
    ],
    cons: [
      "ページが非常に縦長になる",
      "CTA は最上部のみで再度 scroll 誘導が必要",
    ],
  },
  {
    id: "e",
    name: "Horizontal Peek",
    tagline: "text + side-scroll gallery",
    description:
      "hero text の下に横スクロール gallery。現在 image 85% + 次 image 10% peek 表示で、IG Stories 的な mobile-native 操作。",
    pros: [
      "IG Stories 準拠の mobile-native UX",
      "横スワイプが自然",
      "複数画像を一覧性高く表示",
    ],
    cons: [
      "横スクロールは縦スクロールと混同されがち",
      "縦に vertical scrollbar と横軸の操作が同居",
    ],
  },
  {
    id: "f",
    name: "Folio Dominance",
    tagline: 'large "01" as design anchor',
    description:
      "Kinfolk 風 Issue 番号を巨大 serif italic で配置。タイトルは controlled、番号が視覚のアンカーとなる号冊号スタイル。",
    pros: [
      "記憶に残るアイコニックな hero",
      "ブランドの「版」としての位置付け",
      "editorial の格調高さ",
    ],
    cons: [
      "タイトル自体の主張は弱まる",
      "コンテンツ量に合わせた再利用が難しい",
    ],
  },
  {
    id: "g",
    name: "Photo Overlay",
    tagline: "text over image (Aesop / Myrrh original style)",
    description:
      "90svh full-bleed 画像にテキストをオーバーレイ。上下 subtle scrim（foreground 透過）で可読性確保、CTA は画像内の underline link として配置。Myrrh 本体サイト・Aesop・Kinfolk モバイルの王道パターン。",
    pros: [
      "画像＝商品価値（rental space）を最も強く訴求",
      "first view で brand + image を同時提示",
      "Aesop / 高級 editorial の定番で認識負荷が低い",
      "本体サイト (total-therapy-myrrh.net) と視覚トーン統合",
    ],
    cons: [
      "画像の明度ムラで可読性が変動する（素材選定が重要）",
      "scrim 強度調整がシビア",
      "text が画像の上なので色覚特性で読みづらいユーザーへの配慮必要",
    ],
  },
  {
    id: "h",
    name: "Catch Copy Dominance",
    tagline: "Japanese catch copy first (SWELL流)",
    description:
      "日本語キャッチコピー「静けさが、仕事をする。」を巨大 serif で配置し、英語 sub + 控えめな画像 + scroll indicator で SWELL / Japanese corporate editorial の構造を踏襲。本文コピーライティングが主役。",
    pros: [
      "日本語コピーが first view の主役になる",
      "SWELL / JIN:R 系日本サイト訪問者に既視感",
      "OS 標準 serif の英語 sub と system-ui 本文の対比が映える",
      "scroll indicator で下への誘導が明示",
    ],
    cons: [
      "翻訳不要な日本語ブランドに最適化、英語サイトと両立しにくい",
      "画像が controlled で「空間」訴求は弱い",
    ],
  },
  {
    id: "i",
    name: "Warm Wellness Card",
    tagline: "bg-surface + framed image (spa/therapy industry)",
    description:
      "wellness/spa 業界標準の温かいクリーム背景（bg-surface）+ 金フレーム画像 + serif 見出し。Luxury White × Bronze をやや warm 寄りに振り、therapy brand との視覚統合を狙う。",
    pros: [
      "wellness/spa 業界の標準トーン",
      "bg-surface が warm なので brand accent（bronze）と調和",
      "画像フレーム（bronze border）が editorial 格調を演出",
      "本体サイトが therapy 領域であることと整合",
    ],
    cons: [
      "ホームページ全体の白基調から浮く可能性（section 背景設計と調整必要）",
      "frame 装飾は minimal 原則との折衝",
    ],
  },
  {
    id: "j",
    name: "Hero Pair (Reference Style)",
    tagline: "landscape image top + text below, no overlay",
    description:
      "Myrrh 本体サイト（total-therapy-myrrh.net）の実装パターンに最も忠実。landscape (3:2) 全幅画像を上、text + CTA を画像下の白背景ブロックに配置。overlay なしの juxtaposed (並置) 構造。",
    pros: [
      "本体サイトと最も integrated（同じ視覚語彙）",
      "overlay なしで text 可読性が常に保証される",
      "画像と text の役割分担が明快",
      "landscape 3:2 は横長の「空間」を見せるのに適する",
    ],
    cons: [
      "G（overlay）に比べると editorial 感は控えめ",
      "他案に比べ visual impact がやや控えめ",
    ],
  },
  {
    id: "k",
    name: "Photo Overlay — Landscape",
    tagline: "landscape image + overlay text (G の横長版)",
    description:
      "G（Photo Overlay）の横長バージョン。aspect-[3/2] の landscape 画像に minimal overlay（label + title + divider）を配置、description + CTA は画像下の白背景ブロックへ。画像が縦に伸びすぎず、横長の「空間」を見せる印象を保ちつつ text 可読性を確保。",
    pros: [
      "G より画像高さがコンパクトで first view が見やすい",
      "landscape 3:2 で空間の広がりを自然に表現",
      "overlay text は最小限、description/CTA は白背景で可読性最大",
      "カルーセル + swipe + dots + 番号の editorial UX を継承",
    ],
    cons: [
      "画像の visual impact は G より穏やか（full-bleed ではない）",
      "overlay area が 281px しかないため、長いタイトルは収まらない",
    ],
  },
];

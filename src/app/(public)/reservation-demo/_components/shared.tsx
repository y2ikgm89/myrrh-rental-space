/**
 * /reservation-demo — variant メタデータ SSoT
 */

export type VariantMeta = {
  readonly id: "a" | "b" | "c" | "d" | "e" | "f" | "g";
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly reference: string;
};

export const VARIANTS: readonly VariantMeta[] = [
  {
    id: "a",
    name: "Compact Grid",
    tagline: "現状改善 / 横長カード密度向上",
    description:
      "現状の縦長カードを横長 (画像左 + テキスト右) に変更し、3 列グリッドで密度を上げる。Sticky 下部に選択中の要約を常時表示。最小変更で操作性を改善するアプローチ。",
    pros: [
      "現状からの移行コストが最小",
      "1 画面に多くのスペースが収まる",
      "選択状態が常時可視",
    ],
    cons: [
      "デザインのインパクトが弱い",
      "スペース数が多いと依然スクロールが必要",
    ],
    reference: "Stripe Checkout / Notion Calendly",
  },
  {
    id: "b",
    name: "Sidebar Wizard",
    tagline: "左ステップ / 右常時要約",
    description:
      "デスクトップで左にウィザード本体、右に常時表示の予約サマリーを配置。各ステップ進行とともに右パネルが充実していく。Airbnb / Booking.com の予約 UX に近い。",
    pros: [
      "次に何をするか常に見える",
      "予約内容のレビューが容易",
      "戻り・編集動線が分かりやすい",
    ],
    cons: ["モバイルではサマリーを別表現にする必要", "実装複雑度が高い"],
    reference: "Airbnb / Booking.com",
  },
  {
    id: "c",
    name: "Single Page Scroll",
    tagline: "ステップ分割なし / 縦スクロール完結",
    description:
      "ステップウィザードを撤廃し、1 画面の縦スクロールで「スペース → 日時 → 情報入力」を完結。各セクションが選択完了で次セクションを展開する accordion 風。",
    pros: [
      "離脱率が低い (戻る操作不要)",
      "進捗が縦位置で可視化される",
      "モバイル親和性が高い",
    ],
    cons: ["前セクションの編集導線設計が必要", "1 画面の情報量が増える"],
    reference: "Calendly / Cal.com one-page flow",
  },
  {
    id: "d",
    name: "Calendar First",
    tagline: "大カレンダー中心 / 時間スロット視認性最大",
    description:
      "カレンダー (週ビュー) を画面中央に大きく配置し、左にスペース選択リスト、上に日付タブ、本体にタイムスロットを格子表示。空き状況の可視性を最大化。",
    pros: [
      "空き枠が一目で分かる",
      "複数日の比較が容易",
      "Cal.com / Google Calendar UX の業界標準",
    ],
    cons: [
      "モバイルではレイアウト圧縮が必要",
      "スペース数が多いと左リストが圧迫",
    ],
    reference: "Cal.com / Google Calendar Appointment",
  },
  {
    id: "e",
    name: "Editorial Magazine",
    tagline: "大余白セリフ見出し / 1 ステップ 1 画面",
    description:
      "各ステップを 1 画面全体を使った editorial composition に。セリフフォントの大型 hero、大きな写真、ステップ間の遷移はフルページ。ホテル系・高級不動産系。",
    pros: [
      "ブランド体験が強い",
      "プレミアム感を演出できる",
      "1 画面の情報密度を抑制",
    ],
    cons: ["ステップ数 = 画面遷移数 (4-5 タップ)", "操作回数は最多"],
    reference: "Aman Resorts / Hoshinoya / 高級ホテル予約",
  },
  {
    id: "g",
    name: "Step Wizard Improved (推奨)",
    tagline: "ステップ方式維持 / 密度改善 / sticky 要約強化",
    description:
      "現行 3 ステップ方式を温存しつつ、Step 1 を横長カード 3 列で 1 画面に密度収納、Step 2 で sticky 下部バーに選択中サマリーを常時表示。A + B のハイブリッドで「ステップの安心感」「スクロール量最小化」「ブランド体験」の三立を目指す。",
    pros: [
      "現行 reducer / StepIndicator を維持できる (移行コスト最小)",
      "進捗・戻り操作が明確 (ステップ方式の安心感)",
      "Step 1 を 1 画面に収納してスクロール最小化",
      "sticky 要約で選択内容を常時確認可能",
    ],
    cons: [
      "スペース数が 10+ の場合は密度限界",
      "デスクトップ右サイドバー型 (B) ほどの情報量はない",
    ],
    reference: "Airbnb / 一休 / Booking.com (modal predictable-step UX)",
  },
  {
    id: "f",
    name: "Marketplace Split",
    tagline: "左一覧 / 右詳細スプリット",
    description:
      "左カラムにスペース一覧 (縦並びサムネカード)、右カラムに選択中スペースの大きな詳細パネル + 予約フォーム。Airbnb の listing detail / Yelp / 不動産マーケットプレイス UX。",
    pros: [
      "スペース選択と詳細確認が同時",
      "比較検討に強い",
      "予約と詳細閲覧が分離しない",
    ],
    cons: [
      "モバイルでは別レイアウト必須",
      "1 拠点 / スペース数少のサイトには過剰",
    ],
    reference: "Airbnb listing / Spacemarket detail",
  },
];

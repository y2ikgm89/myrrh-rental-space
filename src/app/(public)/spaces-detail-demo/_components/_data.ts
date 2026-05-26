/**
 * Demo 用固定ダミーデータ。本番 DB に依存せず variant 比較の同条件評価を可能にする。
 */

export interface DemoSpace {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly location: string;
  readonly capacity: number;
  readonly area: number;
  readonly hourlyPrice: number;
  readonly dailyPrice: number;
  readonly addressLine: string;
  readonly descriptionLead: string;
  readonly descriptionParagraphs: readonly string[];
  readonly mainImage: string;
  readonly subImages: readonly string[];
  readonly facilities: readonly {
    readonly name: string;
    readonly icon: string;
  }[];
  readonly accessLines: readonly string[];
  readonly parkingInfo: string;
  readonly reviews: {
    readonly averageRating: number;
    readonly totalCount: number;
    readonly items: readonly {
      readonly id: string;
      readonly authorName: string;
      readonly rating: number;
      readonly comment: string;
      readonly createdAt: string;
    }[];
  };
}

export const DEMO_SPACE: DemoSpace = {
  id: "demo-space-1",
  name: "コワーキングスペース青山",
  category: "コワーキング",
  location: "渋谷店",
  capacity: 8,
  area: 25,
  hourlyPrice: 1100,
  dailyPrice: 6600,
  addressLine: "東京都渋谷区青山1-2-3 ミルラビル 3F",
  descriptionLead:
    "自然光があふれる落ち着いた空間で、集中したい仕事から少人数のミーティングまで幅広く活用いただけます。",
  descriptionParagraphs: [
    "南向きの大きな窓から差し込む自然光と、無垢材のテーブルが醸し出す温かみが特徴のコワーキングスペースです。リモートワーカーやフリーランス、少人数のチームミーティング、ワークショップ開催など多用途に対応します。",
    "高速 Wi-Fi、4K モニター、ホワイトボード、各種文房具を完備。ドリップコーヒーや紅茶は飲み放題です。最寄駅から徒歩 3 分の立地で、商談や打ち合わせのアクセスも良好。",
    "壁面には選書したアートブックを並べ、休憩時のインスピレーション源としてもご活用いただけます。週末は写真撮影会やトークイベント等の貸し切り利用も承ります。",
  ],
  mainImage: "/images/seed/coworking.svg",
  subImages: [
    "/images/seed/meeting-room.svg",
    "/images/seed/blog.svg",
    "/images/seed/blog-case-study.svg",
  ],
  facilities: [
    { name: "高速 Wi-Fi", icon: "IconWifi" },
    { name: "4K モニター", icon: "IconDeviceDesktop" },
    { name: "ホワイトボード", icon: "IconPencil" },
    { name: "プロジェクター", icon: "IconDeviceProjector" },
    { name: "コーヒー無料", icon: "IconCoffee" },
    { name: "防音", icon: "IconHeadphones" },
    { name: "エアコン", icon: "IconAirConditioning" },
    { name: "電源各席", icon: "IconPlug" },
  ],
  accessLines: [
    "東京メトロ銀座線「外苑前駅」徒歩 3 分",
    "東京メトロ千代田線「表参道駅」徒歩 8 分",
    "JR 山手線「渋谷駅」徒歩 15 分",
  ],
  parkingInfo:
    "近隣にコインパーキングあり (徒歩 1 分)。提携駐車場はございません。",
  reviews: {
    averageRating: 4.7,
    totalCount: 23,
    items: [
      {
        id: "r1",
        authorName: "佐藤 K.",
        rating: 5,
        comment:
          "自然光が気持ちよく、集中して作業できました。Wi-Fi も高速で快適でした。",
        createdAt: "2026-04-20T00:00:00Z",
      },
      {
        id: "r2",
        authorName: "山田 M.",
        rating: 5,
        comment:
          "少人数ミーティングで利用。広さも音響も丁度よく、また使いたいです。",
        createdAt: "2026-04-12T00:00:00Z",
      },
      {
        id: "r3",
        authorName: "Tanaka",
        rating: 4,
        comment: "落ち着いた雰囲気で素晴らしいスペース。コーヒーが美味しい。",
        createdAt: "2026-03-28T00:00:00Z",
      },
    ],
  },
};

export function formatPrice(price: number): string {
  return `¥${price.toLocaleString()}`;
}

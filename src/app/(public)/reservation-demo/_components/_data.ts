/**
 * /reservation-demo — 共通ダミーデータ
 *
 * 全 variant が同じ条件で UI 比較できるよう、固定スペース 3 件 / 固定時間スロット
 * を hardcoded。DB / fetch 依存なし。
 */

export type DemoSpace = {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly capacity: number;
  readonly area: number;
  readonly hourlyPrice: number;
  readonly imageUrl: string;
  readonly facilities: readonly string[];
};

export const DEMO_SPACES: readonly DemoSpace[] = [
  {
    id: "seminar",
    name: "セミナールーム",
    tagline: "落ち着いた研修・講演空間",
    capacity: 30,
    area: 60,
    hourlyPrice: 8800,
    imageUrl: "/images/seed/seminar-room.svg",
    facilities: ["プロジェクター", "ホワイトボード", "Wi-Fi", "マイク"],
  },
  {
    id: "meeting-a",
    name: "ミーティングルーム A",
    tagline: "少人数の打合せ向き",
    capacity: 8,
    area: 25.5,
    hourlyPrice: 3300,
    imageUrl: "/images/seed/meeting-room.svg",
    facilities: ["モニター", "ホワイトボード", "Wi-Fi"],
  },
  {
    id: "meeting-b",
    name: "ミーティングルーム B",
    tagline: "ワークショップに最適",
    capacity: 12,
    area: 32,
    hourlyPrice: 4400,
    imageUrl: "/images/seed/meeting-room.svg",
    facilities: ["モニター", "ホワイトボード", "Wi-Fi", "可動式デスク"],
  },
];

export const DEMO_TIME_SLOTS: readonly string[] = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

export const DEMO_DURATIONS: readonly { value: number; label: string }[] = [
  { value: 60, label: "1時間" },
  { value: 120, label: "2時間" },
  { value: 180, label: "3時間" },
  { value: 240, label: "4時間" },
];

export function formatPrice(yen: number): string {
  return `¥${yen.toLocaleString("ja-JP")}`;
}

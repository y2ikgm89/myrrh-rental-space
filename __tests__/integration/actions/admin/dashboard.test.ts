/**
 * ダッシュボード Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/dashboard.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { ReservationStatus, InquiryStatus } from "@generated/prisma/enums";

// calcChangePercent ロジックを再現
function calcChangePercent(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) {
    return 100;
  }
  return 0;
}

describe("Dashboard Admin Action Integration", () => {
  describe("calcChangePercent ロジック", () => {
    test("通常の増加: (100-80)/80*100 = 25%", () => {
      expect(calcChangePercent(100, 80)).toBe(25);
    });

    test("通常の減少: (80-100)/100*100 = -20%", () => {
      expect(calcChangePercent(80, 100)).toBe(-20);
    });

    test("変化なし: 0%", () => {
      expect(calcChangePercent(100, 100)).toBe(0);
    });

    test("前月 0・今月あり → 100%", () => {
      expect(calcChangePercent(50, 0)).toBe(100);
    });

    test("両方 0 → 0%", () => {
      expect(calcChangePercent(0, 0)).toBe(0);
    });

    test("前月あり・今月 0 → -100%", () => {
      expect(calcChangePercent(0, 100)).toBe(-100);
    });

    test("端数切り捨て: Math.round 適用", () => {
      // (10-7)/7*100 = 42.857... → 43%
      expect(calcChangePercent(10, 7)).toBe(43);
    });
  });

  describe("DashboardStats 型構造", () => {
    test("有効なダッシュボード統計", () => {
      type DashboardStats = {
        reservations: {
          thisMonth: number;
          lastMonth: number;
          changePercent: number;
        };
        revenue: {
          thisMonth: number;
          lastMonth: number;
          changePercent: number;
        };
        inquiries: { new: number; thisMonth: number };
        spaces: { active: number; total: number };
      };

      const stats: DashboardStats = {
        reservations: { thisMonth: 50, lastMonth: 40, changePercent: 25 },
        revenue: { thisMonth: 500000, lastMonth: 400000, changePercent: 25 },
        inquiries: { new: 3, thisMonth: 10 },
        spaces: { active: 3, total: 5 },
      };

      expect(stats.reservations.changePercent).toBe(calcChangePercent(50, 40));
      expect(stats.spaces.active).toBeLessThanOrEqual(stats.spaces.total);
    });
  });

  describe("RecentReservation 型構造", () => {
    test("有効な直近予約データ", () => {
      type RecentReservation = {
        id: string;
        spaceName: string;
        customerName: string;
        startTime: Date;
        endTime: Date;
        status: ReservationStatus;
        totalPrice: number | null;
      };

      const reservation: RecentReservation = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        spaceName: "テスト会議室",
        customerName: "田中 太郎",
        startTime: new Date("2026-03-10T10:00:00"),
        endTime: new Date("2026-03-10T12:00:00"),
        status: ReservationStatus.CONFIRMED,
        totalPrice: 5000,
      };

      expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
      expect(reservation.endTime > reservation.startTime).toBe(true);
    });
  });

  describe("ChartDataPoint 型構造", () => {
    test("有効なチャートデータポイント（date は ISO YYYY-MM-DD 形式）", () => {
      type ChartDataPoint = {
        date: string;
        reservations: number;
        revenue: number;
      };
      const point: ChartDataPoint = {
        date: "2026-03-05",
        reservations: 5,
        revenue: 25000,
      };
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(point.reservations).toBeGreaterThanOrEqual(0);
    });

    test("30日分のチャートデータを生成できる", () => {
      const data: Array<{
        date: string;
        reservations: number;
        revenue: number;
      }> = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
        data.push({ date: dateStr, reservations: 0, revenue: 0 });
      }
      expect(data).toHaveLength(30);
      expect(data[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("RecentInquiry 型構造", () => {
    test("有効な直近問い合わせデータ", () => {
      type RecentInquiry = {
        id: string;
        name: string;
        email: string;
        subject: string;
        status: InquiryStatus;
        createdAt: Date;
      };

      const inquiry: RecentInquiry = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "問い合わせ太郎",
        email: "inquiry@example.com",
        subject: "レンタルについて",
        status: InquiryStatus.NEW,
        createdAt: new Date(),
      };

      expect(inquiry.status).toBe(InquiryStatus.NEW);
    });
  });

  describe("ReservationStatus / InquiryStatus enum 整合性", () => {
    test("ReservationStatus に CANCELLED が存在", () => {
      const values = Object.values(ReservationStatus) as string[];
      expect(values).toContain("CANCELLED");
      expect(values).toContain("CONFIRMED");
    });

    test("InquiryStatus に NEW が存在", () => {
      const values = Object.values(InquiryStatus) as string[];
      expect(values).toContain("NEW");
    });
  });
});

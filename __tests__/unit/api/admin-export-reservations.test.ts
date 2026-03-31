import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetReservationsForExport = mock();
const mockGenerateCsv = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/reservations/export-queries", () => ({
  getReservationsForExport: (
    ...args: Parameters<typeof mockGetReservationsForExport>
  ) => mockGetReservationsForExport(...args),
}));

mock.module("@/shared/lib/csv", () => ({
  generateCsv: (...args: Parameters<typeof mockGenerateCsv>) =>
    mockGenerateCsv(...args),
}));

// 実際のモジュールを re-export し、テストで必要なラベルのみオーバーライド
// （不完全なモックは他テストファイルの import を壊す — Bun 既知制限）
const actualHelpers = await import("@/shared/lib/validations/enums/helpers");
mock.module("@/shared/lib/validations/enums/helpers", () => ({
  ...actualHelpers,
  RESERVATION_STATUS_LABELS: {
    PENDING: "仮予約",
    CONFIRMED: "確定",
    CANCELLED: "キャンセル",
    COMPLETED: "完了",
    NO_SHOW: "未来",
  },
  PAYMENT_STATUS_LABELS: {
    UNPAID: "未払い",
    PAID: "支払い済み",
    REFUNDED: "返金済み",
    FAILED: "失敗",
  },
}));

const { GET } = await import("@/app/api/admin/export/reservations/route");

describe("GET /api/admin/export/reservations", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetReservationsForExport.mockReset();
    mockGenerateCsv.mockReset();
  });

  test("権限なしの場合は 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { error: "権限がありません" },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/export/reservations"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "権限がありません" });
    expect(mockGetReservationsForExport).not.toHaveBeenCalled();
    expect(mockGenerateCsv).not.toHaveBeenCalled();
  });

  test("正常時は CSV レスポンスを返す（Content-Type と Content-Disposition ヘッダー付き）", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "ADMIN" },
    });
    mockGetReservationsForExport.mockResolvedValue([]);
    mockGenerateCsv.mockReturnValue("\uFEFF予約ID,スペース\r\n");

    const response = await GET(
      new Request("http://localhost/api/admin/export/reservations"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    const contentDisposition = response.headers.get("Content-Disposition");
    expect(contentDisposition).toMatch(
      /^attachment; filename="reservations-\d{8}\.csv"$/,
    );
  });

  test("checkPermission に reservation:read を渡す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "ADMIN" },
    });
    mockGetReservationsForExport.mockResolvedValue([]);
    mockGenerateCsv.mockReturnValue("\uFEFF予約ID\r\n");

    const request = new Request(
      "http://localhost/api/admin/export/reservations",
    );
    await GET(request);

    expect(mockCheckPermission).toHaveBeenCalledWith(
      "reservation",
      "read",
      expect.any(Headers),
    );
  });

  test("generateCsv が予約データと 17 列のカラム定義を受け取る", async () => {
    const testReservation = {
      id: "abc12345-0000-0000-0000-000000000000",
      startTime: new Date("2024-01-15T09:00:00Z"),
      endTime: new Date("2024-01-15T11:00:00Z"),
      status: "CONFIRMED",
      paymentStatus: "PAID",
      totalPrice: 10000,
      basePrice: 10000,
      couponDiscountAmount: 0,
      durationDiscountAmount: 0,
      spaceDiscountAmount: 0,
      notes: null,
      createdAt: new Date("2024-01-10T10:00:00Z"),
      space: { name: "メインホール" },
      customer: {
        lastName: "田中",
        firstName: "太郎",
        email: "tanaka@example.com",
        phoneNumber: "090-1234-5678",
        companyName: "株式会社テスト",
      },
      coupon: null,
    };

    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "ADMIN" },
    });
    mockGetReservationsForExport.mockResolvedValue([testReservation]);
    mockGenerateCsv.mockReturnValue(
      "\uFEFF予約ID,スペース\r\nABC12345,メインホール\r\n",
    );

    await GET(new Request("http://localhost/api/admin/export/reservations"));

    expect(mockGenerateCsv).toHaveBeenCalledTimes(1);

    const [rows, columns] = mockGenerateCsv.mock.calls[0] as [
      unknown[],
      Array<{ header: string }>,
    ];

    // 予約データが渡される
    expect(rows).toEqual([testReservation]);

    // 17 列のカラム定義が渡される
    expect(columns).toHaveLength(17);

    // ヘッダー名の検証
    const headers = columns.map((c) => c.header);
    expect(headers).toEqual([
      "予約ID",
      "スペース",
      "顧客名",
      "会社名",
      "メール",
      "電話番号",
      "利用日",
      "開始",
      "終了",
      "基本料金",
      "割引額",
      "合計",
      "クーポン",
      "予約ステータス",
      "決済ステータス",
      "備考",
      "作成日",
    ]);
  });
});

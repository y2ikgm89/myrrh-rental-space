import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetCustomersForExport = mock();
type CsvColumn = { header: string; accessor?: (row: unknown) => unknown };
const mockGenerateCsv = mock<(rows: unknown[], columns: CsvColumn[]) => string>(
  () => "",
);

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/customers/export-queries", () => ({
  getCustomersForExport: (
    ...args: Parameters<typeof mockGetCustomersForExport>
  ) => mockGetCustomersForExport(...args),
}));

mock.module("@/shared/lib/csv", () => ({
  generateCsv: (...args: Parameters<typeof mockGenerateCsv>) =>
    mockGenerateCsv(...args),
}));

const { GET } = await import("@/app/api/admin/export/customers/route");

describe("GET /api/admin/export/customers", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetCustomersForExport.mockReset();
    mockGenerateCsv.mockReset();
  });

  describe("正常系", () => {
    test("CSV レスポンスを返す（Content-Type と Content-Disposition ヘッダー付き）", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "user-1", role: "ADMIN" },
      });
      mockGetCustomersForExport.mockResolvedValue([]);
      mockGenerateCsv.mockReturnValue("顧客ID,姓,名\r\n");

      const response = await GET(
        new Request("http://localhost/api/admin/export/customers"),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/csv; charset=utf-8",
      );
      const contentDisposition = response.headers.get("Content-Disposition");
      expect(contentDisposition).toMatch(
        /^attachment; filename="customers-\d{8}\.csv"$/,
      );
    });

    test("checkPermission に customer:read を渡す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "user-1", role: "ADMIN" },
      });
      mockGetCustomersForExport.mockResolvedValue([]);
      mockGenerateCsv.mockReturnValue("顧客ID\r\n");

      const request = new Request(
        "http://localhost/api/admin/export/customers",
      );
      await GET(request);

      expect(mockCheckPermission).toHaveBeenCalledWith(
        "customer",
        "read",
        expect.any(Headers),
      );
    });

    test("generateCsv が顧客データと 22 列のカラム定義を受け取る", async () => {
      const testCustomer = {
        id: "abc12345-0000-0000-0000-000000000000",
        lastName: "田中",
        firstName: "太郎",
        lastNameKana: "タナカ",
        firstNameKana: "タロウ",
        companyName: "株式会社テスト",
        email: "tanaka@example.com",
        phoneNumber: "090-1234-5678",
        // 住所は構造化フィールド SSoT に移行済（旧 `address` カラムは廃止）
        postalCode: "150-0001",
        prefecture: "東京都",
        city: "渋谷区",
        streetAddress: "神宮前1-2-3",
        building: "テストビル 5F",
        status: "REGULAR",
        totalReservations: 5,
        totalSpent: 50000,
        marketingOptIn: true,
        phoneContactOptIn: false,
        lastReservationAt: new Date("2024-01-15T12:00:00Z"),
        firstReservationAt: new Date("2023-06-01T12:00:00Z"),
        isActive: true,
        createdAt: new Date("2023-05-01T12:00:00Z"),
      };

      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "user-1", role: "ADMIN" },
      });
      mockGetCustomersForExport.mockResolvedValue([testCustomer]);
      mockGenerateCsv.mockReturnValue("顧客ID,姓,名\r\nABC12345,田中,太郎\r\n");

      await GET(new Request("http://localhost/api/admin/export/customers"));

      expect(mockGenerateCsv).toHaveBeenCalledTimes(1);

      const firstCall = mockGenerateCsv.mock.calls[0];
      expect(firstCall).toBeDefined();
      if (firstCall === undefined) {
        throw new Error("generateCsv must be called");
      }
      const [rows, columns] = firstCall;

      expect(rows).toEqual([testCustomer]);
      expect(columns).toHaveLength(23);

      const headers = columns.map((c) => c.header);
      expect(headers).toEqual([
        "顧客ID",
        "姓",
        "名",
        "姓カナ",
        "名カナ",
        "会社名",
        "顧客タイプ",
        "メール",
        "電話番号",
        "郵便番号",
        "都道府県",
        "市区町村",
        "町名・番地",
        "建物名",
        "ステータス",
        "予約回数",
        "利用総額",
        "メルマガ受信",
        "電話連絡",
        "最終予約日",
        "初回予約日",
        "有効",
        "登録日",
      ]);
    });

    test("顧客ID は先頭8文字を大文字で出力する", async () => {
      const testCustomer = {
        id: "abcdefgh-0000-0000-0000-000000000000",
        lastName: "山田",
        firstName: "花子",
        lastNameKana: "ヤマダ",
        firstNameKana: "ハナコ",
        companyName: null,
        email: "yamada@example.com",
        phoneNumber: null,
        address: null,
        status: "NEW",
        totalReservations: 1,
        totalSpent: 10000,
        lastReservationAt: null,
        firstReservationAt: null,
        isActive: true,
        createdAt: new Date("2024-01-01T12:00:00Z"),
      };

      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "user-1", role: "ADMIN" },
      });
      mockGetCustomersForExport.mockResolvedValue([testCustomer]);
      mockGenerateCsv.mockImplementation(
        (_rows: unknown[], columns: CsvColumn[]) => {
          const idColumn = columns[0];
          const idValue = idColumn?.accessor?.(testCustomer);
          return `${idValue}\r\n`;
        },
      );

      await GET(new Request("http://localhost/api/admin/export/customers"));

      const csvBody = await (
        await GET(new Request("http://localhost/api/admin/export/customers"))
      ).text();
      expect(csvBody).toBe("ABCDEFGH\r\n");
    });

    test("isActive が true の場合は「はい」、false の場合は「いいえ」を出力する", async () => {
      const activeCustomer = {
        id: "customer-active-00000000000000000000",
        lastName: "有効",
        firstName: "太郎",
        lastNameKana: "ユウコウ",
        firstNameKana: "タロウ",
        companyName: null,
        email: "active@example.com",
        phoneNumber: null,
        address: null,
        status: "NEW",
        totalReservations: 0,
        totalSpent: 0,
        lastReservationAt: null,
        firstReservationAt: null,
        isActive: true,
        createdAt: new Date("2024-01-01T12:00:00Z"),
      };

      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "user-1", role: "ADMIN" },
      });
      mockGetCustomersForExport.mockResolvedValue([activeCustomer]);

      let capturedColumns: CsvColumn[] = [];
      mockGenerateCsv.mockImplementation(
        (_rows: unknown[], columns: CsvColumn[]) => {
          capturedColumns = columns;
          return "";
        },
      );

      await GET(new Request("http://localhost/api/admin/export/customers"));

      const isActiveColumn = capturedColumns.find((c) => c.header === "有効");
      expect(
        isActiveColumn?.accessor?.({ ...activeCustomer, isActive: true }),
      ).toBe("はい");
      expect(
        isActiveColumn?.accessor?.({ ...activeCustomer, isActive: false }),
      ).toBe("いいえ");
    });

    test("lastReservationAt が null の場合は空文字を出力する", async () => {
      const customerNoReservation = {
        id: "customer-nores-000000000000000000000",
        lastName: "未予約",
        firstName: "次郎",
        lastNameKana: "ミヨヤク",
        firstNameKana: "ジロウ",
        companyName: null,
        email: "nores@example.com",
        phoneNumber: null,
        address: null,
        status: "NEW",
        totalReservations: 0,
        totalSpent: 0,
        lastReservationAt: null,
        firstReservationAt: null,
        isActive: true,
        createdAt: new Date("2024-01-01T12:00:00Z"),
      };

      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "user-1", role: "ADMIN" },
      });
      mockGetCustomersForExport.mockResolvedValue([customerNoReservation]);

      let capturedColumns: CsvColumn[] = [];
      mockGenerateCsv.mockImplementation(
        (_rows: unknown[], columns: CsvColumn[]) => {
          capturedColumns = columns;
          return "";
        },
      );

      await GET(new Request("http://localhost/api/admin/export/customers"));

      const lastReservationColumn = capturedColumns.find(
        (c) => c.header === "最終予約日",
      );
      expect(
        lastReservationColumn?.accessor?.({
          ...customerNoReservation,
          lastReservationAt: null,
        }),
      ).toBe("");

      const firstReservationColumn = capturedColumns.find(
        (c) => c.header === "初回予約日",
      );
      expect(
        firstReservationColumn?.accessor?.({
          ...customerNoReservation,
          firstReservationAt: null,
        }),
      ).toBe("");
    });
  });

  describe("異常系", () => {
    test("権限なしの場合は 403 を返す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: false,
        error: { error: "権限がありません" },
      });

      const response = await GET(
        new Request("http://localhost/api/admin/export/customers"),
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({ error: "権限がありません" });
      expect(mockGetCustomersForExport).not.toHaveBeenCalled();
      expect(mockGenerateCsv).not.toHaveBeenCalled();
    });
  });
});

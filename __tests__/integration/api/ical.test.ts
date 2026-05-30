/**
 * iCal Feed API Route Tests
 *
 * /api/ical/[token] の behavioral テスト。
 * settings / token / reservations を mock して GET を実呼び出しし、
 * 403/404/410 の状態分岐 + 正常時の Content-Type / Content-Disposition /
 * Cache-Control header + buildICalFeed への引数を検証する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type MockSettings = { enabled: boolean; includeCustomerInfo: boolean };
type MockToken = {
  id: string;
  spaceId: string | null;
  spaceName: string | null;
  name: string | null;
  expiresAt: Date | null;
};
type MockReservation = {
  id: string;
  startTime: Date;
  endTime: Date;
  customerLastName: string;
  customerFirstName: string;
  spaceName: string;
  spaceAddress: string | null;
  icsSequence: number;
};

const mockGetSettings = mock<() => Promise<MockSettings>>(() =>
  Promise.resolve({ enabled: true, includeCustomerInfo: false }),
);
const mockGetToken = mock<() => Promise<MockToken | null>>(() =>
  Promise.resolve(null),
);
const mockGetReservations = mock<() => Promise<MockReservation[]>>(() =>
  Promise.resolve([]),
);
const mockMarkTokenUsed = mock<() => Promise<void>>(() => Promise.resolve());
const mockBuildICalFeed = mock<() => string>(
  () => "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR",
);
const mockBuildReservationUid = mock<() => string>(() => "uid@example.com");
const mockFireAndForget = mock<() => void>(() => {});
const mockLogError = mock<() => void>(() => {});

mock.module("@/shared/domain/ical/queries", () => ({
  getICalFeedRuntimeSettings: mockGetSettings,
  getICalReservations: mockGetReservations,
  getICalTokenByValue: mockGetToken,
}));

mock.module("@/shared/domain/ical/commands", () => ({
  markICalTokenUsed: mockMarkTokenUsed,
}));

mock.module("@/shared/lib/ical", () => ({
  buildICalFeed: mockBuildICalFeed,
  buildReservationUid: mockBuildReservationUid,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: mock(() => {}),
}));

const { GET } = await import("@/app/api/ical/[token]/route");

function makeRequest(token: string): Request {
  return new Request(`http://localhost/api/ical/${token}`);
}

describe("GET /api/ical/[token]", () => {
  beforeEach(() => {
    mockGetSettings.mockReset();
    mockGetToken.mockReset();
    mockGetReservations.mockReset();
    mockMarkTokenUsed.mockReset();
    mockBuildICalFeed.mockReset();
    mockBuildReservationUid.mockReset();
    mockFireAndForget.mockReset();
    mockLogError.mockReset();
    mockBuildReservationUid.mockReturnValue("uid@example.com");
    mockBuildICalFeed.mockReturnValue(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR",
    );
  });

  describe("認可・状態分岐", () => {
    test("iCal 機能が無効なら 403 を返す", async () => {
      mockGetSettings.mockResolvedValueOnce({
        enabled: false,
        includeCustomerInfo: false,
      });

      const response = await GET(makeRequest("any"), {
        params: Promise.resolve({ token: "any" }),
      });

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("iCal feed is disabled");
    });

    test("無効なトークンは 404 を返す", async () => {
      mockGetSettings.mockResolvedValueOnce({
        enabled: true,
        includeCustomerInfo: false,
      });
      mockGetToken.mockResolvedValueOnce(null);

      const response = await GET(makeRequest("invalid"), {
        params: Promise.resolve({ token: "invalid" }),
      });

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Invalid token");
    });

    test("期限切れトークンは 410 を返す", async () => {
      mockGetSettings.mockResolvedValueOnce({
        enabled: true,
        includeCustomerInfo: false,
      });
      mockGetToken.mockResolvedValueOnce({
        id: "token-1",
        spaceId: null,
        spaceName: null,
        name: null,
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      });

      const response = await GET(makeRequest("expired"), {
        params: Promise.resolve({ token: "expired" }),
      });

      expect(response.status).toBe(410);
      expect(await response.text()).toBe("Token expired");
    });
  });

  describe("正常系", () => {
    const validToken: MockToken = {
      id: "token-1",
      spaceId: null,
      spaceName: "会議室A",
      name: "予約カレンダー",
      expiresAt: null,
    };
    const reservation: MockReservation = {
      id: "abcdef1234567890abcdef1234567890",
      startTime: new Date("2026-06-01T01:00:00.000Z"),
      endTime: new Date("2026-06-01T03:00:00.000Z"),
      customerLastName: "山田",
      customerFirstName: "太郎",
      spaceName: "会議室A",
      spaceAddress: "東京都渋谷区...",
      icsSequence: 0,
    };

    test("有効なトークンで 200 + iCal Content-Type を返す", async () => {
      mockGetSettings.mockResolvedValueOnce({
        enabled: true,
        includeCustomerInfo: false,
      });
      mockGetToken.mockResolvedValueOnce(validToken);
      mockGetReservations.mockResolvedValueOnce([reservation]);

      const response = await GET(makeRequest("token-1"), {
        params: Promise.resolve({ token: "token-1" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/calendar; charset=utf-8",
      );
      expect(response.headers.get("Cache-Control")).toBe(
        "private, max-age=3600",
      );
      const body = await response.text();
      expect(body).toContain("VCALENDAR");
    });

    test("Content-Disposition に inline + filename を含む", async () => {
      mockGetSettings.mockResolvedValueOnce({
        enabled: true,
        includeCustomerInfo: false,
      });
      mockGetToken.mockResolvedValueOnce(validToken);
      mockGetReservations.mockResolvedValueOnce([]);

      const response = await GET(makeRequest("token-1"), {
        params: Promise.resolve({ token: "token-1" }),
      });

      const disposition = response.headers.get("Content-Disposition");
      expect(disposition).toContain("inline");
      expect(disposition).toContain("filename");
    });

    test("カレンダー名を spaceName から組み立てて buildICalFeed に渡す", async () => {
      mockGetSettings.mockResolvedValueOnce({
        enabled: true,
        includeCustomerInfo: true,
      });
      mockGetToken.mockResolvedValueOnce(validToken);
      mockGetReservations.mockResolvedValueOnce([reservation]);

      await GET(makeRequest("token-1"), {
        params: Promise.resolve({ token: "token-1" }),
      });

      expect(mockBuildICalFeed).toHaveBeenCalledWith(
        expect.objectContaining({ calendarName: "会議室A - 予約カレンダー" }),
        expect.any(String),
      );
    });

    test("トークン使用を fireAndForget で記録する", async () => {
      mockGetSettings.mockResolvedValueOnce({
        enabled: true,
        includeCustomerInfo: false,
      });
      mockGetToken.mockResolvedValueOnce(validToken);
      mockGetReservations.mockResolvedValueOnce([]);

      await GET(makeRequest("token-1"), {
        params: Promise.resolve({ token: "token-1" }),
      });

      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    });
  });
});

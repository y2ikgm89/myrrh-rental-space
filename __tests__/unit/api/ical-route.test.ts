import { describe, expect, mock, test } from "bun:test";

const mockGetICalFeedRuntimeSettings = mock(() =>
  Promise.resolve({ enabled: true, includeCustomerInfo: false }),
);
const mockGetICalTokenByValue = mock((_token: string) =>
  Promise.resolve({
    id: "token-1",
    name: 'calendar\r\n"admin"/feed',
    expiresAt: null,
    spaceId: null,
    spaceName: null,
  }),
);
const mockGetICalReservations = mock(() => Promise.resolve([]));
const mockMarkICalTokenUsed = mock((_id: string) => Promise.resolve());
const mockBuildICalFeed = mock(() => "BEGIN:VCALENDAR\r\nEND:VCALENDAR");

mock.module("@/shared/domain/ical/queries", () => ({
  getICalFeedRuntimeSettings: mockGetICalFeedRuntimeSettings,
  getICalReservations: mockGetICalReservations,
  getICalTokenByValue: mockGetICalTokenByValue,
}));

mock.module("@/shared/domain/ical/commands", () => ({
  markICalTokenUsed: mockMarkICalTokenUsed,
}));

mock.module("@/shared/lib/ical", () => ({
  buildICalFeed: mockBuildICalFeed,
  buildReservationUid: (_id: string, _host: string) =>
    "reservation@example.test",
}));

mock.module("@/shared/lib/constants", () => ({
  getAppHost: () => "example.test",
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise;
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM" },
  logError: mock(() => {}),
  normalizeError: (error: unknown) => error,
}));

import { GET } from "@/app/api/ical/[token]/route";

describe("GET /api/ical/[token]", () => {
  test("Content-Disposition の filename を安全な値に正規化する", async () => {
    const response = await GET(new Request("https://app.example.test"), {
      params: Promise.resolve({ token: "token-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      "inline; filename=\"calendar_admin_feed.ics\"; filename*=UTF-8''calendar_admin_feed.ics",
    );
  });
});

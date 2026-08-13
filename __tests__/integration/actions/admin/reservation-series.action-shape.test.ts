/**
 * 繰返し予約 Server Action — action shape & schema 統合テスト
 *
 * **scope**: `createRecurringReservationAction` の input validation /
 * RRULE 組み立て → domain command への引数伝搬 /
 * **conform へ返す `SubmissionResult` の形**を実 import で検証する。
 * `executeAdminMutationResult` は mock しており auth / RBAC / cache 無効化の中身 /
 * 監査ログは検証しない（`_executeAdminMutationResult-rbac.test.ts` を参照）。
 *
 * `reservation.action-shape.test.ts` が「conform 系は副作用が多いので後続タスクで
 * 分離 test 化」と保留していた分の 1 本。フォーム送信経路は E2E でも未カバーで
 * （`create-recurring-reservation.spec.ts` は送信ボタンを押さない）、この action は
 * 単体でも E2E でも検証されていなかった。
 *
 * **返り値の形を固定する理由**: `executeConformMutation` の成功時 reply は
 * `{ initialValue: null }` だけで `status` を持たない。消費側が
 * `status === "success"` で成功判定すると永久に発火せず、予約は作られたのに
 * トーストも遷移も出ない（PR #2186 で 3 画面が実際にその状態だった）。
 * `successMessage` も action 側が組み立てているので、件数がここで壊れると
 * 管理者に「何件作られたか」が伝わらなくなる。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mock(() => Promise.resolve(true)),
  requireFeatureEnabled: mock(() => Promise.resolve()),
  assertAdminFeatureCreateAllowed: mock(() => Promise.resolve()),
  ADMIN_FEATURE_CREATE_FORBIDDEN_MESSAGE:
    "この機能は公開面で無効のため新規作成できません",
}));

const mockGetMaxRecurrenceInstances = mock(() => Promise.resolve(52));
mock.module("@/shared/domain/reservations/payloads", () => ({
  getMaxRecurrenceInstances: mockGetMaxRecurrenceInstances,
}));

type CreateSeriesArgs = {
  rrule: string;
  dtstart: Date;
  duration: number;
  couponCode: string | null;
  templateData: Record<string, unknown>;
};
const mockCreateSeries = mock<
  (args: CreateSeriesArgs) => Promise<{
    series: { id: string; instanceCount: number };
    instanceIds: string[];
  }>
>(() =>
  Promise.resolve({
    series: { id: "series-1", instanceCount: 4 },
    instanceIds: ["i1", "i2", "i3", "i4"],
  }),
);
const mockCancelSeries = mock(() =>
  Promise.resolve({ cancelledCount: 0, cancelledReservationIds: [] }),
);
mock.module("@/shared/domain/reservations/series-commands", () => ({
  createReservationSeriesCommand: mockCreateSeries,
  cancelReservationSeriesCommand: mockCancelSeries,
}));

mock.module(
  "@/shared/domain/reservations/reservation-calendar-outbound",
  () => ({
    syncReservationSeriesToCalendar: mock(() =>
      Promise.resolve({ success: true }),
    ),
  }),
);

mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => {}),
  invalidateReservationSeriesCaches: mock(() => {}),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(
    (promise: Promise<unknown>) => void promise.catch(() => undefined),
  ),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: mock(() =>
    Promise.resolve({ ipAddress: null, userAgent: null }),
  ),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
  resolveAuditResourceId?: (data: T) => string | undefined;
};

let executeOptions: ExecuteOpts<unknown> | undefined;
/** `{ error }` を返させたいテストだけ true にする。 */
let executeShouldFail = false;

const mockExecute = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  executeOptions = opts as ExecuteOpts<unknown>;
  if (executeShouldFail) {
    return { error: "権限がありません" };
  }
  const data = await opts.execute({ id: "admin", role: "SUPER_ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const { createRecurringReservationAction } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/series");

const CUSTOMER_ID = "019ff32d-f34f-719d-8cc5-b2ad5c999846";
const SPACE_ID = "019ff32d-900e-7599-91d2-0c42e968f1e0";

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values: Record<string, string> = {
    customerId: CUSTOMER_ID,
    spaceId: SPACE_ID,
    date: "2027-03-02",
    startTime: "10:00",
    endTime: "12:00",
    couponCode: "",
    freq: "WEEKLY",
    interval: "1",
    endMode: "count",
    count: "4",
    until: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    fd.set(key, value);
  }
  // byday は配列 field（`overrides.byday` で明示的に空にできる）
  if (overrides["byday"] !== "") {
    fd.append("byday", overrides["byday"] ?? "TU");
  }
  return fd;
}

describe("createRecurringReservationAction (action shape)", () => {
  beforeEach(() => {
    executeOptions = undefined;
    executeShouldFail = false;
    mockCreateSeries.mockClear();
  });

  test("正常系: RRULE を組み立てて command へ渡し、conform には successMessage 付きの成功 reply を返す", async () => {
    const result = await createRecurringReservationAction(
      undefined,
      buildFormData(),
    );

    expect(executeOptions?.resource).toBe("reservation");
    expect(executeOptions?.action).toBe("create");

    const args = mockCreateSeries.mock.calls[0]?.[0];
    expect(args?.rrule).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;COUNT=4");
    // 10:00-12:00 JST = 120 分
    expect(args?.duration).toBe(120);

    // **成功 reply は `initialValue === null` だけで `status` を持たない。**
    // ここが変わると全消費側の成功ハンドラが黙って止まる（PR #2186）。
    expect(result.initialValue).toBeNull();
    expect("status" in result).toBe(false);
    expect((result as { successMessage?: string }).successMessage).toBe(
      "4 件の予約を作成しました",
    );
  });

  test("料金は action で確定しない: templateData に価格を載せず couponCode をそのまま渡す", async () => {
    await createRecurringReservationAction(
      undefined,
      buildFormData({ couponCode: "SERIES500" }),
    );

    const args = mockCreateSeries.mock.calls[0]?.[0];
    // 旧実装は action 側で pricing preview を 1 回だけ解決し、その結果を
    // templateData に載せて全 instance へコピーさせていた。rate plan は
    // 日付で変わるので、解決できるのは全 instance の日時を知る command だけ。
    expect(args?.templateData).toEqual({});
    // クーポンは検証済み id ではなくコードのまま渡す（検証と適用は command 側）。
    expect(args?.couponCode).toBe("SERIES500");
  });

  test("couponCode 未入力は null として渡す（空文字を流さない）", async () => {
    await createRecurringReservationAction(undefined, buildFormData());

    expect(mockCreateSeries.mock.calls[0]?.[0]?.couponCode).toBeNull();
  });

  test("WEEKLY で曜日未選択は field error（command を呼ばない）", async () => {
    const result = await createRecurringReservationAction(
      undefined,
      buildFormData({ byday: "" }),
    );

    expect(mockCreateSeries).not.toHaveBeenCalled();
    expect(result.error?.["byday"]).toEqual([
      "曜日を 1 つ以上選択してください",
    ]);
  });
});

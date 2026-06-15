import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS } from "@/shared/lib/constants";

const updateTagMock = mock<(tag: string) => void>(() => {});
mock.module("next/cache", () => ({ updateTag: updateTagMock }));

const { invalidateEventCaches } =
  await import("@/shared/lib/cache/event-cache");

describe("invalidateEventCaches", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
  });

  test("基本: EVENTS collection タグのみを無効化する", () => {
    invalidateEventCaches();

    // イベント公開ページ（一覧・詳細）の唯一の cacheTag が EVENTS のため、
    // これ一つで全イベントページが更新される。
    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.EVENTS);
    expect(updateTagMock).toHaveBeenCalledTimes(1);
  });

  test("notifications 指定時は NOTIFICATIONS も無効化する", () => {
    invalidateEventCaches({ notifications: true });

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.EVENTS);
    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.NOTIFICATIONS);
    expect(updateTagMock).toHaveBeenCalledTimes(2);
  });

  test("notifications false なら NOTIFICATIONS を無効化しない", () => {
    invalidateEventCaches({ notifications: false });

    expect(updateTagMock).not.toHaveBeenCalledWith(CACHE_TAGS.NOTIFICATIONS);
    expect(updateTagMock).toHaveBeenCalledTimes(1);
  });
});

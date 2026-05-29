import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

const updateTagMock = mock<(tag: string) => void>(() => {});
mock.module("next/cache", () => ({ updateTag: updateTagMock }));

const { invalidateEventCaches } =
  await import("@/shared/lib/cache/event-cache");

const EVENT_ID = "evt-1";
const EVENT_SLUG = "summer-festival";

describe("invalidateEventCaches", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
  });

  test("基本: EVENTS + events.detail を無効化する（slug なし）", () => {
    invalidateEventCaches(EVENT_ID, null);

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.EVENTS);
    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.events.detail(EVENT_ID),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(2);
  });

  test("slug 指定時は events.slug も無効化する（公開ページ用）", () => {
    invalidateEventCaches(EVENT_ID, EVENT_SLUG);

    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.events.slug(EVENT_SLUG),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(3);
  });

  test("slug が undefined でも無効化しない（null と同じ挙動）", () => {
    invalidateEventCaches(EVENT_ID, undefined);

    expect(updateTagMock).toHaveBeenCalledTimes(2);
  });

  test("options.registrations で eventRegistrations.list を追加無効化する", () => {
    invalidateEventCaches(EVENT_ID, EVENT_SLUG, { registrations: true });

    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.eventRegistrations.list(EVENT_ID),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(4);
  });

  test("全オプション有効時は 5 タグを無効化する", () => {
    invalidateEventCaches(EVENT_ID, EVENT_SLUG, {
      registrations: true,
      notifications: true,
    });

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.NOTIFICATIONS);
    expect(updateTagMock).toHaveBeenCalledTimes(5);
  });
});

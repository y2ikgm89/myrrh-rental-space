import { describe, expect, test } from "bun:test";
import {
  EVENT_LIST_TABS,
  isEventListTab,
} from "@/shared/domain/events/event-list-tab";

describe("isEventListTab", () => {
  test("upcoming/past は true", () => {
    expect(isEventListTab("upcoming")).toBe(true);
    expect(isEventListTab("past")).toBe(true);
  });

  test("それ以外の文字列は false", () => {
    expect(isEventListTab("draft")).toBe(false);
    expect(isEventListTab("")).toBe(false);
    expect(isEventListTab("UPCOMING")).toBe(false);
  });

  test("EVENT_LIST_TABS は upcoming/past の2値", () => {
    expect(EVENT_LIST_TABS).toEqual(["upcoming", "past"]);
  });
});

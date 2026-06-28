import { describe, test, expect, beforeEach } from "bun:test";
import { installJSDOMForTests } from "../../setup-dom";
import {
  dismissBar,
  STORAGE_KEY,
} from "@/public/components/announcement-bar/use-dismissed-bars";

function readStoredIds(): string[] {
  const parsed: unknown = JSON.parse(
    sessionStorage.getItem(STORAGE_KEY) ?? "[]",
  );
  expect(Array.isArray(parsed)).toBe(true);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error("stored announcement bar ids must be a string array");
  }
  return parsed;
}

describe("dismissBar", () => {
  beforeEach(() => {
    installJSDOMForTests();
    sessionStorage.clear();
  });

  test("バーIDをsessionStorageに保存する", () => {
    dismissBar("bar-1");
    const stored = readStoredIds();
    expect(stored).toEqual(["bar-1"]);
  });

  test("複数のバーIDを蓄積する", () => {
    dismissBar("bar-1");
    dismissBar("bar-2");
    const stored = readStoredIds();
    expect(stored).toEqual(["bar-1", "bar-2"]);
  });

  test("同じIDの重複追加を防ぐ", () => {
    dismissBar("bar-1");
    dismissBar("bar-1");
    const stored = readStoredIds();
    expect(stored).toEqual(["bar-1"]);
  });

  test("カスタムイベントをディスパッチする", () => {
    let dispatched = false;
    const handler = () => {
      dispatched = true;
    };
    window.addEventListener("announcement-bar-dismissed", handler);
    dismissBar("bar-1");
    window.removeEventListener("announcement-bar-dismissed", handler);
    expect(dispatched).toBe(true);
  });
});

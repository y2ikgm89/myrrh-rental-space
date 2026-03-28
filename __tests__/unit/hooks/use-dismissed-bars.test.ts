import { describe, test, expect, beforeEach } from "bun:test";
import {
  dismissBar,
  STORAGE_KEY,
} from "@/public/components/announcement-bar/use-dismissed-bars";

describe("dismissBar", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("バーIDをsessionStorageに保存する", () => {
    dismissBar("bar-1");
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as string[];
    expect(stored).toEqual(["bar-1"]);
  });

  test("複数のバーIDを蓄積する", () => {
    dismissBar("bar-1");
    dismissBar("bar-2");
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as string[];
    expect(stored).toEqual(["bar-1", "bar-2"]);
  });

  test("同じIDの重複追加を防ぐ", () => {
    dismissBar("bar-1");
    dismissBar("bar-1");
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as string[];
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

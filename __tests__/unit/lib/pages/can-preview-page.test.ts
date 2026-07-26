import { describe, expect, test } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { canPreviewPageByPublishState } from "@/shared/lib/pages/can-preview-page";

describe("canPreviewPageByPublishState", () => {
  describe("公開済みページ", () => {
    test("VIEWER はプレビュー可", () => {
      expect(canPreviewPageByPublishState(Role.VIEWER, true)).toBe(true);
    });

    test("EDITOR はプレビュー可", () => {
      expect(canPreviewPageByPublishState(Role.EDITOR, true)).toBe(true);
    });

    test("ADMIN はプレビュー可", () => {
      expect(canPreviewPageByPublishState(Role.ADMIN, true)).toBe(true);
    });
  });

  describe("未公開ページ", () => {
    test("VIEWER は page:read のみのため不可", () => {
      expect(canPreviewPageByPublishState(Role.VIEWER, false)).toBe(false);
    });

    test("EDITOR は page:update があるため可", () => {
      expect(canPreviewPageByPublishState(Role.EDITOR, false)).toBe(true);
    });

    test("ADMIN は page:publish があるため可", () => {
      expect(canPreviewPageByPublishState(Role.ADMIN, false)).toBe(true);
    });

    test("SUPER_ADMIN は可", () => {
      expect(canPreviewPageByPublishState(Role.SUPER_ADMIN, false)).toBe(true);
    });
  });
});

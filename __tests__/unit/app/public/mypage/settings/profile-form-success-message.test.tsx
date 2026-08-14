/**
 * F-108 / F-110: 初回メール登録の successMessage を profile-form が表示すること。
 *
 * updateProfileAction は確認メール送信後に
 * `successMessage: "確認メールを送信しました…"` を返す。フォームがこれを捨てて
 * 固定文言「プロフィールを更新しました」だけを出すと、利用者は認証リンクを
 * 踏む必要に気付けない。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
// useActionState を差し替えるため実モジュールを spread する。named import だと
// 制限対象の forwardRef / useMemo に触れないが、namespace は触る。
// eslint-disable-next-line no-restricted-imports -- mock.module で react を広げるため
import * as React from "react";

import { installJSDOMForTests } from "../../../../../setup-dom";
import { definite } from "../../../../../support/definite";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const EMAIL_VERIFICATION_SENT_MESSAGE =
  "確認メールを送信しました。メールに記載された URL をクリックして登録を完了してください。";

const GENERIC_PROFILE_UPDATED_MESSAGE = "プロフィールを更新しました";

const actionState: {
  lastResult:
    | {
        status: "success";
        successMessage?: string;
      }
    | undefined;
} = { lastResult: undefined };

mock.module("react", () => ({
  ...React,
  useActionState: () => [actionState.lastResult, () => {}, false],
}));

mock.module("@/app/(public)/mypage/_shared/actions/profile", () => ({
  updateProfileAction: async () => undefined,
}));

mock.module("@/shared/components/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
}));

mock.module("@/public/components/ui/customer-type-toggle", () => ({
  CustomerTypeToggle: () => <div data-testid="customer-type-toggle" />,
}));

mock.module("@/public/components/design-system/input", () => ({
  Input: ({ label }: { label?: string }) => (
    <label>
      {label}
      <input />
    </label>
  ),
}));

mock.module("@/public/components/design-system/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => (
    <button type="submit">{children}</button>
  ),
}));

const { ProfileForm } =
  await import("@/app/(public)/mypage/settings/_components/profile-form");

describe("ProfileForm successMessage (F-108 / F-110)", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    actionState.lastResult = undefined;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("shows action successMessage instead of generic update copy", () => {
    actionState.lastResult = {
      status: "success",
      successMessage: EMAIL_VERIFICATION_SENT_MESSAGE,
    };

    if (!root) throw new Error("root missing");
    act(() => {
      root?.render(
        <ProfileForm
          defaultValues={{
            customerType: CustomerType.PERSONAL,
            lastName: "山田",
            firstName: "太郎",
            companyName: "",
            email: "",
            phoneNumber: "",
            marketingOptIn: false,
          }}
          turnstileSiteKey={null}
        />,
      );
    });

    const status = definite(
      container?.querySelector('[role="status"]'),
      'role="status"',
    );
    expect(status.textContent).toBe(EMAIL_VERIFICATION_SENT_MESSAGE);
    expect(status.textContent).not.toBe(GENERIC_PROFILE_UPDATED_MESSAGE);
  });
});

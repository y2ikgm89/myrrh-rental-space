import type { ReactElement } from "react";
import Link from "next/link";
import { Stack } from "@/public/components/design-system/stack";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { StatusHubShell } from "./status-hub-shell";

type StatusHubInvalidLinkViewProps = {
  readonly mypageHref: "/mypage" | "/mypage/events";
  readonly memberResourceLabel: "予約" | "申込";
};

export function StatusHubInvalidLinkView({
  mypageHref,
  memberResourceLabel,
}: StatusHubInvalidLinkViewProps): ReactElement {
  return (
    <StatusHubShell>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          リンクが無効または期限切れです
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクが正しくないか、有効期限が切れている可能性があります。
        </p>
        <Stack gap="sm" className="mt-4 text-sm text-muted-foreground">
          <p>
            会員の方は
            <Link
              href={toAppRoute(mypageHref)}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              マイページ
            </Link>
            から{memberResourceLabel}を確認できます。
          </p>
          <p>
            会員でない方は
            <Link
              href={toAppRoute("/contact")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              お問い合わせ
            </Link>
            よりご連絡ください。
          </p>
        </Stack>
      </div>
    </StatusHubShell>
  );
}

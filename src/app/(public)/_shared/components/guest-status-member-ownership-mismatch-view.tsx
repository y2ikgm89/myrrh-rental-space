import type { ReactElement } from "react";
import Link from "next/link";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { toAppRoute } from "@/shared/lib/typed-routes";

type GuestStatusMemberOwnershipMismatchViewProps = {
  readonly message: string;
  readonly mypageHref: "/mypage" | "/mypage/events";
};

export function GuestStatusMemberOwnershipMismatchView({
  message,
  mypageHref,
}: GuestStatusMemberOwnershipMismatchViewProps): ReactElement {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-base font-medium text-foreground">{message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link
              href={toAppRoute(mypageHref)}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              マイページ
            </Link>
            からご確認ください。
          </p>
        </div>
      </Stack>
    </PageLayout>
  );
}

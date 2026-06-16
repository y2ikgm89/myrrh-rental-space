"use client";

import { Button } from "@/public/components/design-system/button";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

export default function ReservationCompleteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container>
      <div className="flex min-h-[60svh] items-center justify-center">
        <Stack gap="md" className="text-center">
          <Heading level={1}>完了ページを表示できません</Heading>
          <p className="text-muted-foreground">
            ご予約は受け付けております。確認メールをご確認ください。
            <br />
            この画面が繰り返し表示される場合はお問い合わせください。
          </p>
          <Button variant="editorial" onClick={reset}>
            もう一度試す
          </Button>
        </Stack>
      </div>
    </Container>
  );
}

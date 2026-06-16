"use client";

import { Button } from "@/public/components/design-system/button";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

export default function MypageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container>
      <div className="flex min-h-[60svh] items-center justify-center">
        <Stack gap="md" className="text-center">
          <Heading level={1}>マイページを表示できません</Heading>
          <p className="text-muted-foreground">
            一時的な問題が発生しました。しばらくしてからもう一度お試しください。
          </p>
          <Button variant="editorial" onClick={reset}>
            もう一度試す
          </Button>
        </Stack>
      </div>
    </Container>
  );
}

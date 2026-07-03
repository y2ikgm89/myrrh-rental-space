"use client";

import type { ErrorInfo } from "next/error";

import { Button } from "@/public/components/design-system/button";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

export default function ReservationError({ unstable_retry }: ErrorInfo) {
  return (
    <Container>
      <div className="flex min-h-[60svh] items-center justify-center">
        <Stack gap="md" className="text-center">
          <Heading level={1}>予約ページを表示できません</Heading>
          <p className="text-muted-foreground">
            一時的な問題が発生しました。しばらくしてからもう一度お試しください。
          </p>
          <Button variant="editorial" onClick={() => unstable_retry()}>
            もう一度試す
          </Button>
        </Stack>
      </div>
    </Container>
  );
}

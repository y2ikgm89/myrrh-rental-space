"use client";

import type { ErrorInfo } from "next/error";

import { Container } from "@/public/components/design-system/container";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";

export default function AccessError({ unstable_retry }: ErrorInfo) {
  return (
    <div>
      <Container>
        <div className="flex min-h-[60svh] flex-col items-center justify-center space-y-6 text-center">
          <Heading level={1}>アクセスページの読み込みに失敗しました</Heading>
          <p className="text-muted-foreground">
            しばらく経ってから再度お試しください。
          </p>
          <Button variant="editorial" onClick={() => unstable_retry()}>
            再試行
          </Button>
        </div>
      </Container>
    </div>
  );
}

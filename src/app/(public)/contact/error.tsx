"use client";

import { Container } from "@/public/components/design-system/container";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";

export default function ContactError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content">
      <Container>
        <div className="flex min-h-[60svh] flex-col items-center justify-center space-y-6 text-center">
          <Heading level={1}>
            お問い合わせページの読み込みに失敗しました
          </Heading>
          <p className="text-muted-foreground">
            しばらく経ってから再度お試しください。
          </p>
          <Button variant="editorial" onClick={reset}>
            再試行
          </Button>
        </div>
      </Container>
    </main>
  );
}

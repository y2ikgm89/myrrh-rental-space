import type { Metadata } from "next";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";

export const metadata: Metadata = {
  title: "ページが見つかりません",
  description: "お探しのページは存在しないか、移動した可能性があります。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PublicNotFound() {
  return (
    <main id="main-content">
      <Container>
        <div className="flex min-h-[60vh] flex-col items-center justify-center py-[var(--spacing-section)]">
          <Stack gap="lg" className="items-center text-center">
            <span className="font-heading text-8xl font-bold text-border">
              404
            </span>

            <Heading level={1}>ページが見つかりません</Heading>

            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              お探しのページは存在しないか、
              <br />
              移動した可能性があります。
            </p>

            <Stack
              direction="horizontal"
              gap="sm"
              className="flex-col sm:flex-row"
            >
              <Button href="/" variant="editorial">
                ホームに戻る
              </Button>
              <Button href="/spaces" variant="secondary">
                スペース一覧を見る
              </Button>
            </Stack>
          </Stack>
        </div>
      </Container>
    </main>
  );
}

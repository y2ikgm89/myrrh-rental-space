import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { Button } from "@/public/components/design-system/button";

export default function LocationNotFound(): ReactElement {
  return (
    <Container>
      <div className="py-20 text-center">
        <h1 className="text-h2">拠点が見つかりません</h1>
        <p className="mt-4 text-muted-foreground">
          指定された拠点は存在しないか、現在公開されていません。
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button href="/access" variant="editorial">
            アクセス一覧へ
          </Button>
          <Button href="/" variant="ghost">
            ホームへ戻る
          </Button>
        </div>
      </div>
    </Container>
  );
}

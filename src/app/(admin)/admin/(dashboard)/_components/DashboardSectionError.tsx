import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";

type DashboardSectionErrorProps = {
  readonly title?: string;
};

/**
 * ダッシュボード各セクションの読み込み失敗時フォールバック。
 * ルート全体を落とさず、静かなメッセージだけ出す。
 */
export function DashboardSectionError({ title }: DashboardSectionErrorProps) {
  return (
    <Card>
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent>
        <p className="text-sm text-muted-foreground">
          このセクションを読み込めませんでした
        </p>
      </CardContent>
    </Card>
  );
}

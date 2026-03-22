"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/admin/contexts/confirm-context";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/admin/components/ui/accordion";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  updateRobotsTxtSettings,
  resetRobotsTxtToDefault,
} from "@/admin/actions/settings";
import type { RobotsTxtData } from "@/shared/domain/settings/types";
import { checkRobotsTxtWarnings } from "@/admin/actions/settings/schemas/basic";
import { isMutationError } from "@/shared/lib/mutation-result";
import { AlertTriangle, RotateCcw } from "lucide-react";

async function fetchRobotsTxtSettings(): Promise<RobotsTxtData> {
  return fetchAdminJson("/admin/api/settings/robots-txt");
}

export function RobotsTxtSection() {
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<RobotsTxtData | null>(null);
  const [formData, setFormData] = useState({
    robotsTxtEnabled: false,
    robotsTxtCustom: "",
  });
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    fetchRobotsTxtSettings()
      .then((result) => {
        setData(result);
        setFormData({
          robotsTxtEnabled: result.robotsTxtEnabled,
          robotsTxtCustom: result.robotsTxtCustom ?? result.defaultRobotsTxt,
        });
        setWarnings(result.warnings);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  function handleTextChange(text: string) {
    setFormData({ ...formData, robotsTxtCustom: text });
    setWarnings(checkRobotsTxtWarnings(text));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateRobotsTxtSettings({
        robotsTxtEnabled: formData.robotsTxtEnabled,
        robotsTxtCustom: formData.robotsTxtEnabled
          ? formData.robotsTxtCustom
          : null,
      });
      if (!isMutationError(result)) {
        setWarnings(result.warnings);
      }
      if (isMutationError(result)) {
        toast.error(result.error || "保存に失敗しました");
      } else {
        toast.success("robots.txt設定を更新しました");
        router.refresh();
      }
    });
  }

  async function handleReset() {
    if (!data) return;
    const confirmed = await confirm({
      title: "robots.txtをリセットしますか？",
      description:
        "robots.txtをデフォルトに戻しますか？カスタム設定は削除されます。",
      confirmLabel: "リセット",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await resetRobotsTxtToDefault();
      if (!isMutationError(result)) {
        setFormData({
          robotsTxtEnabled: false,
          robotsTxtCustom: data.defaultRobotsTxt,
        });
        setWarnings([]);
      }
      if (isMutationError(result)) {
        toast.error(result.error || "保存に失敗しました");
      } else {
        toast.success("robots.txt設定をデフォルトに戻しました");
        router.refresh();
      }
    });
  }

  function handleToggle(checked: boolean) {
    if (checked && !formData.robotsTxtCustom && data) {
      setFormData({
        robotsTxtEnabled: checked,
        robotsTxtCustom: data.defaultRobotsTxt,
      });
    } else {
      setFormData({ ...formData, robotsTxtEnabled: checked });
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>robots.txt設定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-40 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>robots.txt設定</CardTitle>
        <CardDescription>
          検索エンジンのクローラーに対する指示を設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex items-center justify-between rounded-lg border p-4 ${
            formData.robotsTxtEnabled ? "border-primary bg-primary/5" : ""
          }`}
        >
          <div className="space-y-0.5">
            <Label htmlFor="robotsTxtEnabled" className="font-medium">
              カスタムrobots.txtを使用
            </Label>
            <p className="text-xs text-muted-foreground">
              無効の場合、デフォルトのrobots.txtが使用されます
            </p>
          </div>
          <Switch
            id="robotsTxtEnabled"
            checked={formData.robotsTxtEnabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
          />
        </div>

        {formData.robotsTxtEnabled && warnings.length > 0 && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-warning">
                  設定に関する警告
                </p>
                <ul className="text-xs text-warning/80 list-disc list-inside space-y-1">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="robotsTxtCustom">
              {formData.robotsTxtEnabled
                ? "robots.txt内容"
                : "デフォルトrobots.txt（参照用）"}
            </Label>
            {formData.robotsTxtEnabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isPending}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                デフォルトに戻す
              </Button>
            )}
          </div>
          <Textarea
            id="robotsTxtCustom"
            value={formData.robotsTxtCustom}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={data?.defaultRobotsTxt}
            rows={16}
            disabled={isPending || !formData.robotsTxtEnabled}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {formData.robotsTxtCustom.length} 文字（最大 10,000 文字）
          </p>
        </div>

        <Accordion type="single" collapsible>
          <AccordionItem
            value="robots-help"
            className="rounded-lg border bg-muted/50 px-4 border-b last:border-b"
          >
            <AccordionTrigger className="text-sm">
              robots.txt の書き方
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                <li>
                  <code className="bg-muted px-1 rounded">User-agent: *</code> -
                  すべてのクローラーに適用
                </li>
                <li>
                  <code className="bg-muted px-1 rounded">
                    Disallow: /path/
                  </code>{" "}
                  - 指定パスのクロールを禁止
                </li>
                <li>
                  <code className="bg-muted px-1 rounded">Allow: /path/</code> -
                  指定パスのクロールを許可
                </li>
                <li>
                  <code className="bg-muted px-1 rounded">Sitemap:</code> -
                  サイトマップのURLを指定
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex justify-end pt-2">
          <SubmitButton
            isPending={isPending}
            onClick={handleSave}
            label="robots.txt設定を保存"
            pendingLabel="保存中..."
          />
        </div>
      </CardContent>
    </Card>
  );
}

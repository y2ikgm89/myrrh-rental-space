"use client";

import { useState, useTransition, useEffect } from "react";
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
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  updateRobotsTxtSettings,
  resetRobotsTxtToDefault,
} from "@/admin/actions/settings";
import type { RobotsTxtData } from "@/shared/domain/settings/types";
import { checkRobotsTxtWarnings } from "@/admin/actions/settings/schemas";
import { useRefreshOnSuccess } from "../hooks";
import { isMutationError } from "@/shared/lib/mutation-result";
import { AlertTriangle, RotateCcw, Info } from "lucide-react";

async function fetchRobotsTxtSettings(): Promise<RobotsTxtData> {
  return fetchAdminJson("/admin/api/settings/robots-txt");
}

export function RobotsTxtSection() {
  const confirm = useConfirm();
  const { handleResult } = useRefreshOnSuccess();
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
      handleResult(result, "robots.txt設定を更新しました");
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
      handleResult(result, "robots.txt設定をデフォルトに戻しました");
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

        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-start gap-2">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">robots.txtについて</p>
              <ul className="list-disc list-inside space-y-0.5">
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
            </div>
          </div>
        </div>

        <SubmitButton
          isPending={isPending}
          onClick={handleSave}
          label="robots.txt設定を保存"
          pendingLabel="保存中..."
        />
      </CardContent>
    </Card>
  );
}

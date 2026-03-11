"use client";

/**
 * メンテナンス設定セクション
 *
 * メンテナンスモードの有効/無効、メッセージ設定
 */

import { useState, useTransition } from "react";
import {
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
import { updateMaintenanceSettings } from "@/admin/actions/settings";
import type { SettingsData } from "@/admin/actions/settings";
import { useRefreshOnSuccess } from "../hooks";

interface MaintenanceSectionProps {
  settings: SettingsData;
}

export function MaintenanceSection({ settings }: MaintenanceSectionProps) {
  const { handleResult } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage || "",
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateMaintenanceSettings({
        maintenanceMode: formData.maintenanceMode,
        maintenanceMessage: formData.maintenanceMessage || null,
      });
      handleResult(result, "メンテナンス設定を保存しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>メンテナンス設定</CardTitle>
        <CardDescription>
          サイトのメンテナンスモードを設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex items-center justify-between rounded-lg border p-4 ${
            formData.maintenanceMode
              ? "border-destructive bg-destructive/5"
              : ""
          }`}
        >
          <div className="space-y-0.5">
            <Label htmlFor="maintenanceMode" className="font-medium">
              メンテナンスモード
            </Label>
            <p className="text-xs text-muted-foreground">
              有効にすると、公開ページにメンテナンス画面が表示されます
            </p>
          </div>
          <Switch
            id="maintenanceMode"
            checked={formData.maintenanceMode}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, maintenanceMode: checked })
            }
            disabled={isPending}
          />
        </div>

        {formData.maintenanceMode && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              メンテナンスモードが有効です
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              公開ページにアクセスするとメンテナンス画面が表示されます。
              管理画面は引き続き利用可能です。
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="maintenanceMessage">メンテナンスメッセージ</Label>
          <Textarea
            id="maintenanceMessage"
            value={formData.maintenanceMessage}
            onChange={(e) =>
              setFormData({ ...formData, maintenanceMessage: e.target.value })
            }
            placeholder="現在メンテナンス中です。

ご不便をおかけして申し訳ございません。
メンテナンス完了までしばらくお待ちください。"
            rows={5}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            メンテナンス画面に表示するメッセージ
          </p>
        </div>

        <SubmitButton
          isPending={isPending}
          onClick={handleSave}
          label="メンテナンス設定を保存"
          pendingLabel="保存中..."
        />
      </CardContent>
    </Card>
  );
}

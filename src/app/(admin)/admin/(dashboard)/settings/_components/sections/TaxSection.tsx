"use client";

/**
 * 消費税設定セクション
 *
 * 税率と価格表示モードの設定
 */

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import {
  updateTaxSettings,
  type TaxSettingsData,
} from "@/admin/actions/settings";
import { useRefreshOnSuccess } from "../hooks";
import { TaxDisplayMode, TaxInputMode } from "@/shared/db/enums";

interface TaxSectionProps {
  settings: TaxSettingsData;
}

export function TaxSection({ settings }: TaxSectionProps) {
  const { handleResult } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    taxStandardRate: settings.standardRate,
    taxReducedRate: settings.reducedRate,
    taxDisplayModeAdmin: settings.displayModeAdmin,
    taxDisplayModePublic: settings.displayModePublic,
    taxInputMode: settings.inputMode,
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateTaxSettings(formData);
      handleResult(result, "消費税設定を更新しました");
    });
  };

  return (
    <div className="space-y-6">
      {/* 税率設定 */}
      <Card>
        <CardHeader>
          <CardTitle>税率設定</CardTitle>
          <CardDescription>標準税率と軽減税率を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="taxStandardRate">標準税率</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="taxStandardRate"
                  type="number"
                  value={formData.taxStandardRate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      taxStandardRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-24"
                  disabled={isPending}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                通常の商品・サービスに適用される税率です
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxReducedRate">軽減税率</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="taxReducedRate"
                  type="number"
                  value={formData.taxReducedRate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      taxReducedRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-24"
                  disabled={isPending}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                飲食料品など軽減税率対象に適用される税率です
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 価格入力モード */}
      <Card>
        <CardHeader>
          <CardTitle>価格入力モード</CardTitle>
          <CardDescription>
            管理画面での価格入力方法を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>価格の入力方法</Label>
            <Select
              value={formData.taxInputMode}
              onValueChange={(value: TaxInputMode) =>
                setFormData({ ...formData, taxInputMode: value })
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TaxInputMode.tax_excluded}>
                  税抜き価格で入力
                </SelectItem>
                <SelectItem value={TaxInputMode.tax_included}>
                  税込み価格で入力
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.taxInputMode === TaxInputMode.tax_excluded
                ? "入力した価格は税抜き価格として保存され、表示時に税込み価格が計算されます"
                : "入力した価格は税込み価格として扱われ、内部で税抜き価格に換算して保存されます"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 価格表示モード */}
      <Card>
        <CardHeader>
          <CardTitle>価格表示設定</CardTitle>
          <CardDescription>
            管理画面と公開ページでの価格表示方法を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>管理画面での価格表示</Label>
            <Select
              value={formData.taxDisplayModeAdmin}
              onValueChange={(value: TaxDisplayMode) =>
                setFormData({ ...formData, taxDisplayModeAdmin: value })
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TaxDisplayMode.tax_excluded}>
                  税抜き価格のみ
                </SelectItem>
                <SelectItem value={TaxDisplayMode.tax_included}>
                  税込み価格のみ
                </SelectItem>
                <SelectItem value={TaxDisplayMode.both}>両方表示</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>公開ページでの価格表示</Label>
            <Select
              value={formData.taxDisplayModePublic}
              onValueChange={(value: TaxDisplayMode) =>
                setFormData({ ...formData, taxDisplayModePublic: value })
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TaxDisplayMode.tax_excluded}>
                  税抜き価格のみ
                </SelectItem>
                <SelectItem value={TaxDisplayMode.tax_included}>
                  税込み価格のみ
                </SelectItem>
                <SelectItem value={TaxDisplayMode.both}>両方表示</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              お客様が閲覧する公開ページでの価格表示形式です
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <SubmitButton
        isPending={isPending}
        onClick={handleSave}
        label="消費税設定を保存"
        pendingLabel="保存中..."
      />
    </div>
  );
}

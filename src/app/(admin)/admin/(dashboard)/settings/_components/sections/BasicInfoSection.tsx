"use client";

/**
 * 基本情報セクション
 *
 * サイト名、ロゴ、ファビコン、OGP画像などの基本設定
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
  Switch,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { updateBasicInfo } from "@/admin/actions/settings";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { useRefreshOnSuccess } from "../hooks";

interface BasicInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function BasicInfoSection({ settings }: BasicInfoSectionProps) {
  const { handleResult } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    siteName: settings.siteName || "",
    siteDescription: settings.siteDescription || "",
    faviconUrl: settings.faviconUrl || "",
    defaultOgpImageUrl: settings.defaultOgpImageUrl || "",
    headerLogoUrl: settings.headerLogoUrl || "",
    footerLogoUrl: settings.footerLogoUrl || "",
    footerCopyright: settings.footerCopyright || "",
    useHeaderLogo: settings.useHeaderLogo,
    useFooterLogo: settings.useFooterLogo,
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateBasicInfo({
        siteName: formData.siteName || null,
        siteDescription: formData.siteDescription || null,
        faviconUrl: formData.faviconUrl || null,
        defaultOgpImageUrl: formData.defaultOgpImageUrl || null,
        headerLogoUrl: formData.headerLogoUrl || null,
        footerLogoUrl: formData.footerLogoUrl || null,
        footerCopyright: formData.footerCopyright || null,
        useHeaderLogo: formData.useHeaderLogo,
        useFooterLogo: formData.useFooterLogo,
      });
      handleResult(result, "基本情報を保存しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>基本情報</CardTitle>
        <CardDescription>サイトの基本的な情報を設定します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="siteName">サイト名</Label>
            <Input
              id="siteName"
              value={formData.siteName}
              onChange={(e) =>
                setFormData({ ...formData, siteName: e.target.value })
              }
              placeholder="Myrrh Rental Space"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footerCopyright">フッターコピーライト</Label>
            <Input
              id="footerCopyright"
              value={formData.footerCopyright}
              onChange={(e) =>
                setFormData({ ...formData, footerCopyright: e.target.value })
              }
              placeholder="2024 Myrrh Rental Space"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="siteDescription">サイト説明</Label>
          <Textarea
            id="siteDescription"
            value={formData.siteDescription}
            onChange={(e) =>
              setFormData({ ...formData, siteDescription: e.target.value })
            }
            placeholder="サイトの説明文"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="headerLogoUrl">ヘッダーロゴURL</Label>
            <Input
              id="headerLogoUrl"
              value={formData.headerLogoUrl}
              onChange={(e) =>
                setFormData({ ...formData, headerLogoUrl: e.target.value })
              }
              placeholder="/images/logo.svg"
              disabled={isPending}
            />
            <div className="flex items-center justify-between pt-1">
              <Label
                htmlFor="useHeaderLogo"
                className="text-sm text-muted-foreground"
              >
                ヘッダーでロゴを使用
              </Label>
              <Switch
                id="useHeaderLogo"
                checked={formData.useHeaderLogo}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, useHeaderLogo: checked }))
                }
                disabled={isPending}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              OFF時またはロゴ未設定時はサイト名をテキスト表示
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="footerLogoUrl">フッターロゴURL</Label>
            <Input
              id="footerLogoUrl"
              value={formData.footerLogoUrl}
              onChange={(e) =>
                setFormData({ ...formData, footerLogoUrl: e.target.value })
              }
              placeholder="/images/logo-footer.svg"
              disabled={isPending}
            />
            <div className="flex items-center justify-between pt-1">
              <Label
                htmlFor="useFooterLogo"
                className="text-sm text-muted-foreground"
              >
                フッターでロゴを使用
              </Label>
              <Switch
                id="useFooterLogo"
                checked={formData.useFooterLogo}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, useFooterLogo: checked }))
                }
                disabled={isPending}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              OFF時またはロゴ未設定時はサイト名をテキスト表示
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="faviconUrl">ファビコンURL</Label>
            <Input
              id="faviconUrl"
              value={formData.faviconUrl}
              onChange={(e) =>
                setFormData({ ...formData, faviconUrl: e.target.value })
              }
              placeholder="/favicon.ico"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultOgpImageUrl">OGP画像URL</Label>
            <Input
              id="defaultOgpImageUrl"
              value={formData.defaultOgpImageUrl}
              onChange={(e) =>
                setFormData({ ...formData, defaultOgpImageUrl: e.target.value })
              }
              placeholder="/images/ogp.jpg"
              disabled={isPending}
            />
          </div>
        </div>

        <SubmitButton
          isPending={isPending}
          onClick={handleSave}
          label="基本情報を保存"
          pendingLabel="保存中..."
        />
      </CardContent>
    </Card>
  );
}

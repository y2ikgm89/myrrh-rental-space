"use client";

/**
 * フッター設定セクション
 *
 * フッターの表示テキスト・SNSリンク表示・テーマカラーを設定
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { updateFooterSettings } from "@/admin/actions/settings";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface FooterSectionProps {
  settings: {
    footerTagline: string | null;
    footerNavigationLabel: string;
    footerContactLabel: string;
    footerHoursLabel: string;
    footerShowSocialLinks: boolean;
    themeColor: string;
  };
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TAGLINE =
  "洗練された空間で、特別なひとときを。\n厳選されたレンタルスペースをご案内します。";

// =============================================================================
// Component
// =============================================================================

export function FooterSection({ settings }: FooterSectionProps) {
  const [isPending, startTransition] = useTransition();

  const [tagline, setTagline] = useState(settings.footerTagline ?? "");
  const [navigationLabel, setNavigationLabel] = useState(
    settings.footerNavigationLabel,
  );
  const [contactLabel, setContactLabel] = useState(settings.footerContactLabel);
  const [hoursLabel, setHoursLabel] = useState(settings.footerHoursLabel);
  const [showSocialLinks, setShowSocialLinks] = useState(
    settings.footerShowSocialLinks,
  );
  const [themeColor, setThemeColor] = useState(settings.themeColor);

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateFooterSettings({
        footerTagline: tagline.trim() || null,
        footerNavigationLabel: navigationLabel,
        footerContactLabel: contactLabel,
        footerHoursLabel: hoursLabel,
        footerShowSocialLinks: showSocialLinks,
        themeColor,
      });

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("フッター設定を保存しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>フッター設定</CardTitle>
        <CardDescription>
          フッターの表示テキスト、SNSリンク表示、ブラウザテーマカラーを設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="footer-tagline">ブランド説明文</Label>
          <Textarea
            id="footer-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder={DEFAULT_TAGLINE}
            rows={3}
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground">
            空欄の場合はデフォルトの説明文が表示されます
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="footer-nav-label">ナビゲーション見出し</Label>
            <Input
              id="footer-nav-label"
              value={navigationLabel}
              onChange={(e) => setNavigationLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-contact-label">連絡先見出し</Label>
            <Input
              id="footer-contact-label"
              value={contactLabel}
              onChange={(e) => setContactLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-hours-label">営業時間見出し</Label>
            <Input
              id="footer-hours-label"
              value={hoursLabel}
              onChange={(e) => setHoursLabel(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="footer-social-links">SNSリンクを表示</Label>
            <p className="text-xs text-muted-foreground">
              ナビゲーション設定で登録したSNSリンクをフッターに表示します
            </p>
          </div>
          <Switch
            id="footer-social-links"
            checked={showSocialLinks}
            onCheckedChange={setShowSocialLinks}
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="footer-theme-color">ブラウザテーマカラー</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="footer-theme-color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-input"
            />
            <Input
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              placeholder="#fafafa"
              className="max-w-[10rem]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            モバイルブラウザのアドレスバーの色に反映されます
          </p>
        </div>

        <SubmitButton isPending={isPending} onClick={handleSave} label="保存" />
      </CardContent>
    </Card>
  );
}

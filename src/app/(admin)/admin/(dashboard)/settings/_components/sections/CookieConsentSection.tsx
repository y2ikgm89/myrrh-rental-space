"use client";

/**
 * Cookie同意バナー設定セクション
 *
 * GDPR対応のCookie同意バナーの表示設定
 */

import { useState, useTransition } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { updateCookieConsentSettings } from "@/admin/actions/settings";
import type { SettingsData } from "@/admin/actions/settings";
import { useRefreshOnSuccess } from "../hooks";

// デフォルト値
const DEFAULT_MESSAGE =
  "当サイトでは、サービス向上のためにCookieを使用しています。Cookieの使用に同意いただける場合は「同意する」をクリックしてください。";
const DEFAULT_ACCEPT_TEXT = "同意する";
const DEFAULT_REJECT_TEXT = "拒否する";
const DEFAULT_POLICY_URL = "/privacy";

interface CookieConsentSectionProps {
  settings: SettingsData;
}

export function CookieConsentSection({ settings }: CookieConsentSectionProps) {
  const { handleResult } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    cookieConsentEnabled: settings.cookieConsentEnabled,
    cookieConsentMessage: settings.cookieConsentMessage || "",
    cookieConsentAcceptText: settings.cookieConsentAcceptText || "",
    cookieConsentRejectText: settings.cookieConsentRejectText || "",
    cookieConsentPolicyUrl: settings.cookieConsentPolicyUrl || "",
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateCookieConsentSettings({
        cookieConsentEnabled: formData.cookieConsentEnabled,
        cookieConsentMessage: formData.cookieConsentMessage || null,
        cookieConsentAcceptText: formData.cookieConsentAcceptText || null,
        cookieConsentRejectText: formData.cookieConsentRejectText || null,
        cookieConsentPolicyUrl: formData.cookieConsentPolicyUrl || null,
      });
      handleResult(result, "Cookie同意設定を保存しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cookie同意バナー</CardTitle>
        <CardDescription>
          GDPR対応のCookie同意バナーを表示します。グローバル展開時に有効にしてください。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="cookieConsentEnabled" className="font-medium">
              Cookie同意バナーを表示
            </Label>
            <p className="text-xs text-muted-foreground">
              有効にすると、初回訪問時にCookie同意バナーが表示されます
            </p>
          </div>
          <Switch
            id="cookieConsentEnabled"
            checked={formData.cookieConsentEnabled}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, cookieConsentEnabled: checked })
            }
            disabled={isPending}
          />
        </div>

        {formData.cookieConsentEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="cookieConsentMessage">バナーメッセージ</Label>
              <Textarea
                id="cookieConsentMessage"
                value={formData.cookieConsentMessage}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cookieConsentMessage: e.target.value,
                  })
                }
                placeholder={DEFAULT_MESSAGE}
                rows={3}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                空欄の場合はデフォルトメッセージが表示されます
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cookieConsentAcceptText">
                  同意ボタンテキスト
                </Label>
                <Input
                  id="cookieConsentAcceptText"
                  value={formData.cookieConsentAcceptText}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cookieConsentAcceptText: e.target.value,
                    })
                  }
                  placeholder={DEFAULT_ACCEPT_TEXT}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cookieConsentRejectText">
                  拒否ボタンテキスト
                </Label>
                <Input
                  id="cookieConsentRejectText"
                  value={formData.cookieConsentRejectText}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cookieConsentRejectText: e.target.value,
                    })
                  }
                  placeholder={DEFAULT_REJECT_TEXT}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cookieConsentPolicyUrl">
                プライバシーポリシーURL
              </Label>
              <Input
                id="cookieConsentPolicyUrl"
                value={formData.cookieConsentPolicyUrl}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cookieConsentPolicyUrl: e.target.value,
                  })
                }
                placeholder={DEFAULT_POLICY_URL}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                「詳細」リンクのリンク先URL
              </p>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "保存中..." : "Cookie同意設定を保存"}
        </Button>
      </CardContent>
    </Card>
  );
}

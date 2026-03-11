"use client";

/**
 * メール設定セクション
 *
 * 送信者情報、返信先、通知先メールアドレスの設定
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
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { updateEmailSettings } from "@/admin/actions/settings";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { useRefreshOnSuccess } from "../hooks";

interface EmailSectionProps {
  settings: Serialized<SettingsData>;
}

export function EmailSection({ settings }: EmailSectionProps) {
  const { handleResult } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    senderEmail: settings.senderEmail || "",
    senderName: settings.senderName || "",
    replyToEmail: settings.replyToEmail || "",
    sendReservationConfirmationEmail: settings.sendReservationConfirmationEmail,
    sendAdminNotificationEmail: settings.sendAdminNotificationEmail,
    notificationEmailAddresses: settings.notificationEmailAddresses || "",
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateEmailSettings({
        senderEmail: formData.senderEmail || null,
        senderName: formData.senderName || null,
        replyToEmail: formData.replyToEmail || null,
        sendReservationConfirmationEmail:
          formData.sendReservationConfirmationEmail,
        sendAdminNotificationEmail: formData.sendAdminNotificationEmail,
        notificationEmailAddresses: formData.notificationEmailAddresses || null,
      });
      handleResult(result, "メール設定を更新しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>メール設定</CardTitle>
        <CardDescription>メール送信に関する設定を行います</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="senderEmail">送信元メールアドレス</Label>
            <Input
              id="senderEmail"
              type="email"
              value={formData.senderEmail}
              onChange={(e) =>
                setFormData({ ...formData, senderEmail: e.target.value })
              }
              placeholder="noreply@example.com"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senderName">送信者名</Label>
            <Input
              id="senderName"
              value={formData.senderName}
              onChange={(e) =>
                setFormData({ ...formData, senderName: e.target.value })
              }
              placeholder="Myrrh Rental Space"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replyToEmail">返信先メールアドレス</Label>
            <Input
              id="replyToEmail"
              type="email"
              value={formData.replyToEmail}
              onChange={(e) =>
                setFormData({ ...formData, replyToEmail: e.target.value })
              }
              placeholder="info@example.com"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notificationEmailAddresses">
            通知先メールアドレス
          </Label>
          <Input
            id="notificationEmailAddresses"
            value={formData.notificationEmailAddresses}
            onChange={(e) =>
              setFormData({
                ...formData,
                notificationEmailAddresses: e.target.value,
              })
            }
            placeholder="admin1@example.com, admin2@example.com"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            カンマ区切りで複数指定可能。予約・お問い合わせの通知を受け取るアドレス
          </p>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <h4 className="font-medium">送信設定</h4>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="sendReservationConfirmationEmail"
                checked={formData.sendReservationConfirmationEmail}
                onCheckedChange={(checked) =>
                  setFormData({
                    ...formData,
                    sendReservationConfirmationEmail: checked,
                  })
                }
                disabled={isPending}
              />
              <Label htmlFor="sendReservationConfirmationEmail">
                予約確認メールを送信
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="sendAdminNotificationEmail"
                checked={formData.sendAdminNotificationEmail}
                onCheckedChange={(checked) =>
                  setFormData({
                    ...formData,
                    sendAdminNotificationEmail: checked,
                  })
                }
                disabled={isPending}
              />
              <Label htmlFor="sendAdminNotificationEmail">
                管理者通知メールを送信
              </Label>
            </div>
          </div>
        </div>

        <SubmitButton
          isPending={isPending}
          onClick={handleSave}
          label="メール設定を保存"
          pendingLabel="保存中..."
        />
      </CardContent>
    </Card>
  );
}

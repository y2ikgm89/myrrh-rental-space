"use client";

/**
 * 連絡先情報セクション
 *
 * 電話番号、メールアドレス、住所などの連絡先設定
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
  Textarea,
} from "@/admin/components/ui";
import { updateContactInfo } from "@/admin/actions/settings";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { useRefreshOnSuccess } from "../hooks";

interface ContactInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function ContactInfoSection({ settings }: ContactInfoSectionProps) {
  const { handleResult } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    phoneNumber: settings.phoneNumber || "",
    faxNumber: settings.faxNumber || "",
    email: settings.email || "",
    address: settings.address || "",
    postalCode: settings.postalCode || "",
    prefecture: settings.prefecture || "",
    city: settings.city || "",
    streetAddress: settings.streetAddress || "",
    buildingName: settings.buildingName || "",
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateContactInfo({
        phoneNumber: formData.phoneNumber || null,
        faxNumber: formData.faxNumber || null,
        email: formData.email || null,
        address: formData.address || null,
        postalCode: formData.postalCode || null,
        prefecture: formData.prefecture || null,
        city: formData.city || null,
        streetAddress: formData.streetAddress || null,
        buildingName: formData.buildingName || null,
      });
      handleResult(result, "連絡先情報を保存しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>連絡先情報</CardTitle>
        <CardDescription>サイトに表示する連絡先を設定します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">電話番号</Label>
            <Input
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) =>
                setFormData({ ...formData, phoneNumber: e.target.value })
              }
              placeholder="03-1234-5678"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="faxNumber">FAX番号</Label>
            <Input
              id="faxNumber"
              value={formData.faxNumber}
              onChange={(e) =>
                setFormData({ ...formData, faxNumber: e.target.value })
              }
              placeholder="03-1234-5679"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactEmail">メールアドレス</Label>
            <Input
              id="contactEmail"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="info@example.com"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="postalCode">郵便番号</Label>
            <Input
              id="postalCode"
              value={formData.postalCode}
              onChange={(e) =>
                setFormData({ ...formData, postalCode: e.target.value })
              }
              placeholder="123-4567"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prefecture">都道府県</Label>
            <Input
              id="prefecture"
              value={formData.prefecture}
              onChange={(e) =>
                setFormData({ ...formData, prefecture: e.target.value })
              }
              placeholder="東京都"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">市区町村</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              placeholder="渋谷区"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress">番地</Label>
            <Input
              id="streetAddress"
              value={formData.streetAddress}
              onChange={(e) =>
                setFormData({ ...formData, streetAddress: e.target.value })
              }
              placeholder="1-2-3"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="buildingName">建物名</Label>
            <Input
              id="buildingName"
              value={formData.buildingName}
              onChange={(e) =>
                setFormData({ ...formData, buildingName: e.target.value })
              }
              placeholder="○○ビル 3F"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">住所（表示用）</Label>
          <Textarea
            id="address"
            value={formData.address}
            onChange={(e) =>
              setFormData({ ...formData, address: e.target.value })
            }
            placeholder="東京都渋谷区..."
            rows={2}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            フッターなどに表示する住所形式（上記の項目から自動生成されません）
          </p>
        </div>

        <SubmitButton
          isPending={isPending}
          onClick={handleSave}
          label="連絡先情報を保存"
          pendingLabel="保存中..."
        />
      </CardContent>
    </Card>
  );
}

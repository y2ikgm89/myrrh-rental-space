"use client";

/**
 * MEO対策設定セクション
 *
 * LocalBusiness設定、Googleビジネスプロフィール連携、
 * MEO情報充実度スコアの3カード構成
 */

import { useState, useTransition } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
} from "@/admin/components/ui";
import { updateMeoSettings } from "@/admin/actions/settings";
import { parseBusinessAttributes } from "@/shared/lib/json-validators";
import type { SettingsData } from "@/admin/actions/settings";
import { useRefreshOnSuccess } from "../hooks";

// =============================================================================
// Constants
// =============================================================================

function getScoreColorClass(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

function getScoreMessage(score: number): string {
  if (score >= 70) return "MEO対策の基本設定が十分に行われています";
  if (score >= 40) return "いくつかの項目が未設定です。改善の余地があります";
  return "多くの項目が未設定です。MEO対策を強化してください";
}

const BUSINESS_ATTRIBUTE_OPTIONS = [
  { key: "wifi", label: "Wi-Fi" },
  { key: "parking", label: "駐車場" },
  { key: "barrier_free", label: "バリアフリー" },
  { key: "elevator", label: "エレベーター" },
  { key: "smoking_area", label: "喫煙所" },
  { key: "food_allowed", label: "飲食可" },
  { key: "photography_allowed", label: "撮影可" },
  { key: "music_allowed", label: "楽器演奏可" },
] as const;

// =============================================================================
// Types
// =============================================================================

interface MeoSectionProps {
  settings: SettingsData;
  socialLinkCount: number;
}

interface MeoScoreItem {
  label: string;
  isSet: boolean;
}

// =============================================================================
// Score Calculation
// =============================================================================

function calculateMeoScore(
  settings: SettingsData,
  socialLinkCount: number,
): {
  score: number;
  items: MeoScoreItem[];
} {
  const items: MeoScoreItem[] = [
    { label: "ビジネス名", isSet: !!settings.businessName },
    {
      label: "住所",
      isSet: !!(settings.postalCode && settings.prefecture && settings.city),
    },
    { label: "電話番号", isSet: !!settings.phoneNumber },
    { label: "メールアドレス", isSet: !!settings.email },
    {
      label: "緯度・経度",
      isSet: settings.latitude !== null && settings.longitude !== null,
    },
    { label: "営業時間", isSet: settings.businessHours !== null },
    { label: "価格帯", isSet: !!settings.priceRange },
    { label: "事業説明", isSet: !!settings.businessDescription },
    { label: "ロゴ画像", isSet: !!settings.headerLogoUrl },
    { label: "Google Place ID", isSet: !!settings.googleBusinessPlaceId },
    { label: "決済方法", isSet: !!settings.paymentAccepted },
    { label: "設立日", isSet: settings.establishedDate !== null },
    { label: "ソーシャルリンク", isSet: socialLinkCount > 0 },
  ];

  const setCount = items.filter((item) => item.isSet).length;
  const score = Math.round((setCount / items.length) * 100);

  return { score, items };
}

// =============================================================================
// Component
// =============================================================================

export function MeoSection({ settings, socialLinkCount }: MeoSectionProps) {
  const { handleResult } = useRefreshOnSuccess();
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    latitude: settings.latitude,
    longitude: settings.longitude,
    priceRange: settings.priceRange || "",
    googleBusinessPlaceId: settings.googleBusinessPlaceId || "",
    googleReviewUrl: settings.googleReviewUrl || "",
    businessAttributes:
      parseBusinessAttributes(settings.businessAttributes) ?? {},
    paymentAccepted: settings.paymentAccepted || "",
  });

  const { score, items } = calculateMeoScore(
    {
      ...settings,
      latitude: formData.latitude,
      longitude: formData.longitude,
      priceRange: formData.priceRange || null,
      googleBusinessPlaceId: formData.googleBusinessPlaceId || null,
      paymentAccepted: formData.paymentAccepted || null,
    },
    socialLinkCount,
  );

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateMeoSettings({
        latitude: formData.latitude,
        longitude: formData.longitude,
        priceRange: formData.priceRange || null,
        googleBusinessPlaceId: formData.googleBusinessPlaceId || null,
        googleReviewUrl: formData.googleReviewUrl || null,
        businessAttributes:
          Object.keys(formData.businessAttributes).length > 0
            ? formData.businessAttributes
            : null,
        paymentAccepted: formData.paymentAccepted || null,
      });
      handleResult(result);
    });
  };

  const handleAttributeChange = (key: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      businessAttributes: {
        ...prev.businessAttributes,
        [key]: checked,
      },
    }));
  };

  const handleLatitudeChange = (value: string) => {
    const num = value === "" ? null : Number(value);
    setFormData((prev) => ({
      ...prev,
      latitude: num !== null && !Number.isNaN(num) ? num : null,
    }));
  };

  const handleLongitudeChange = (value: string) => {
    const num = value === "" ? null : Number(value);
    setFormData((prev) => ({
      ...prev,
      longitude: num !== null && !Number.isNaN(num) ? num : null,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Card 1: LocalBusiness 設定 */}
      <Card>
        <CardHeader>
          <CardTitle>LocalBusiness 設定</CardTitle>
          <CardDescription>
            Google検索のローカルパックに表示されるための位置情報・価格帯を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="latitude">緯度</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={formData.latitude ?? ""}
                onChange={(e) => handleLatitudeChange(e.target.value)}
                placeholder="35.6812"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                -90〜90の範囲（例: 35.6812 = 東京駅）
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">経度</Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                value={formData.longitude ?? ""}
                onChange={(e) => handleLongitudeChange(e.target.value)}
                placeholder="139.7671"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                -180〜180の範囲（例: 139.7671 = 東京駅）
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priceRange">価格帯</Label>
            <Input
              id="priceRange"
              value={formData.priceRange}
              onChange={(e) =>
                setFormData({ ...formData, priceRange: e.target.value })
              }
              placeholder="¥1,000〜¥5,000/時間"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Google検索結果に表示される価格帯情報
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentAccepted">決済方法</Label>
            <Input
              id="paymentAccepted"
              value={formData.paymentAccepted}
              onChange={(e) =>
                setFormData({ ...formData, paymentAccepted: e.target.value })
              }
              placeholder="現金, クレジットカード, 電子マネー, QRコード決済"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              構造化データの paymentAccepted として出力されます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Google ビジネスプロフィール連携 */}
      <Card>
        <CardHeader>
          <CardTitle>Google ビジネスプロフィール連携</CardTitle>
          <CardDescription>
            Google Business Profile との連携設定・施設属性を管理します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="googleBusinessPlaceId">Place ID</Label>
            <Input
              id="googleBusinessPlaceId"
              value={formData.googleBusinessPlaceId}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  googleBusinessPlaceId: e.target.value,
                })
              }
              placeholder="ChIJ..."
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Google Maps の Place ID（Google Maps Platform で確認できます）
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="googleReviewUrl">Google 口コミ投稿URL</Label>
            <Input
              id="googleReviewUrl"
              value={formData.googleReviewUrl}
              onChange={(e) =>
                setFormData({ ...formData, googleReviewUrl: e.target.value })
              }
              placeholder="https://search.google.com/local/writereview?placeid=..."
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              お客様に口コミ投稿を促すためのURL
            </p>
          </div>

          <div className="space-y-3">
            <Label>施設属性</Label>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {BUSINESS_ATTRIBUTE_OPTIONS.map((attr) => (
                <div key={attr.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`attr-${attr.key}`}
                    checked={formData.businessAttributes[attr.key] || false}
                    onCheckedChange={(checked) =>
                      handleAttributeChange(attr.key, checked === true)
                    }
                    disabled={isPending}
                  />
                  <Label
                    htmlFor={`attr-${attr.key}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {attr.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              構造化データの amenityFeature として出力されます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: MEO 情報充実度スコア */}
      <Card>
        <CardHeader>
          <CardTitle>MEO 情報充実度スコア</CardTitle>
          <CardDescription>
            ローカル検索で有利になるための設定充実度を確認できます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-muted"
                />
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={`${score}, 100`}
                  className={getScoreColorClass(score)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold">{score}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">{getScoreMessage(score)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    item.isSet ? "text-success" : "text-muted-foreground"
                  }
                >
                  {item.isSet ? "\u2713" : "\u2717"}
                </span>
                <span className={item.isSet ? "" : "text-muted-foreground"}>
                  {item.label}
                </span>
                {!item.isSet && (
                  <span className="text-xs text-muted-foreground">
                    - 未設定
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "保存中..." : "MEO設定を保存"}
      </Button>
    </div>
  );
}

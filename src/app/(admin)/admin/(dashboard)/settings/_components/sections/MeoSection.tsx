"use client";

/**
 * MEO対策設定セクション
 *
 * LocalBusiness設定、Googleビジネスプロフィール連携、
 * MEO情報充実度スコアの3カード構成
 */

import { useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  SubmitButton,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateMeoSettings } from "@/admin/actions/settings";
import { meoFormSchema, emptyToNull } from "@/admin/actions/settings/schemas";
import { parseBusinessAttributes } from "@/shared/lib/json-validators";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

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
  settings: Serialized<SettingsData>;
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
  settings: Serialized<SettingsData>,
  socialLinkCount: number,
  formLatitude: string,
  formLongitude: string,
  formPriceRange: string,
  formGoogleBusinessPlaceId: string,
  formPaymentAccepted: string,
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
      isSet: formLatitude !== "" && formLongitude !== "",
    },
    { label: "営業時間", isSet: settings.businessHours !== null },
    { label: "価格帯", isSet: formPriceRange !== "" },
    { label: "事業説明", isSet: !!settings.businessDescription },
    { label: "ロゴ画像", isSet: !!settings.headerLogoUrl },
    { label: "Google Place ID", isSet: formGoogleBusinessPlaceId !== "" },
    { label: "決済方法", isSet: formPaymentAccepted !== "" },
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
  const { form, isPending, onSubmit } = useFormAction(
    meoFormSchema,
    (data) => {
      const latNum = data.latitude === "" ? null : Number(data.latitude);
      const lngNum = data.longitude === "" ? null : Number(data.longitude);
      return updateMeoSettings({
        latitude: latNum !== null && !Number.isNaN(latNum) ? latNum : null,
        longitude: lngNum !== null && !Number.isNaN(lngNum) ? lngNum : null,
        priceRange: emptyToNull(data.priceRange),
        googleBusinessPlaceId: emptyToNull(data.googleBusinessPlaceId),
        googleReviewUrl: emptyToNull(data.googleReviewUrl),
        businessAttributes:
          Object.keys(data.businessAttributes).length > 0
            ? data.businessAttributes
            : null,
        paymentAccepted: emptyToNull(data.paymentAccepted),
      });
    },
    {
      defaultValues: {
        latitude: settings.latitude !== null ? String(settings.latitude) : "",
        longitude:
          settings.longitude !== null ? String(settings.longitude) : "",
        priceRange: settings.priceRange || "",
        googleBusinessPlaceId: settings.googleBusinessPlaceId || "",
        googleReviewUrl: settings.googleReviewUrl || "",
        businessAttributes:
          parseBusinessAttributes(settings.businessAttributes) ?? {},
        paymentAccepted: settings.paymentAccepted || "",
      },
      refresh: true,
      successMessage: "MEO設定を保存しました",
    },
  );

  const latitude = useWatch({ control: form.control, name: "latitude" });
  const longitude = useWatch({ control: form.control, name: "longitude" });
  const priceRange = useWatch({ control: form.control, name: "priceRange" });
  const googleBusinessPlaceId = useWatch({
    control: form.control,
    name: "googleBusinessPlaceId",
  });
  const paymentAccepted = useWatch({
    control: form.control,
    name: "paymentAccepted",
  });

  const { score, items } = calculateMeoScore(
    settings,
    socialLinkCount,
    latitude,
    longitude,
    priceRange,
    googleBusinessPlaceId,
    paymentAccepted,
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
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
                <FormField
                  control={form.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>緯度</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="any"
                          placeholder="35.6812"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        -90〜90の範囲（例: 35.6812 = 東京駅）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>経度</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="any"
                          placeholder="139.7671"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        -180〜180の範囲（例: 139.7671 = 東京駅）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="priceRange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>価格帯</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="¥1,000〜¥5,000/時間"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      Google検索結果に表示される価格帯情報
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentAccepted"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>決済方法</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="現金, クレジットカード, 電子マネー, QRコード決済"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      構造化データの paymentAccepted として出力されます
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <FormField
                control={form.control}
                name="googleBusinessPlaceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Place ID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="ChIJ..."
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      Google Maps の Place ID（Google Maps Platform
                      で確認できます）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="googleReviewUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Google 口コミ投稿URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://search.google.com/local/writereview?placeid=..."
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      お客様に口コミ投稿を促すためのURL
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormLabel>施設属性</FormLabel>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  {BUSINESS_ATTRIBUTE_OPTIONS.map((attr) => (
                    <FormField
                      key={attr.key}
                      control={form.control}
                      name={`businessAttributes.${attr.key}`}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value || false}
                                onCheckedChange={(checked) =>
                                  field.onChange(checked === true)
                                }
                                disabled={isPending}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {attr.label}
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
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
                  <p className="text-sm font-medium">
                    {getScoreMessage(score)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 text-sm"
                  >
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

          <SubmitButton
            isPending={isPending}
            label="MEO設定を保存"
            disabled={!form.formState.isDirty}
          />
        </div>
      </form>
    </Form>
  );
}

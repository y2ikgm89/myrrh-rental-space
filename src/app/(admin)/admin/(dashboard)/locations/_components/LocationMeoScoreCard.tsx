"use client";

import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import { IconCheck, IconX } from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { LocationFormInput } from "@/shared/lib/validations/location";

interface ScoreItem {
  label: string;
  isSet: boolean;
}

interface GlobalsMeoFlags {
  businessName: boolean;
  establishedDate: boolean;
  socialLinks: boolean;
}

interface MeoScoreValues {
  name: string | undefined;
  postalCode: string | null | undefined;
  prefecture: string | null | undefined;
  city: string | null | undefined;
  phoneNumber: string | null | undefined;
  email: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  businessHours: unknown;
  priceRange: string | null | undefined;
  description: string | null | undefined;
  imageUrl: string | undefined;
  googleBusinessPlaceId: string | null | undefined;
  paymentAccepted: string | null | undefined;
}

function calculateMeoScore(
  values: MeoScoreValues,
  globals: GlobalsMeoFlags,
): { score: number; items: ScoreItem[]; setCount: number } {
  const items: ScoreItem[] = [
    { label: "拠点名", isSet: !!values.name },
    {
      label: "住所（構造化）",
      isSet: !!(values.postalCode && values.prefecture && values.city),
    },
    { label: "電話番号", isSet: !!values.phoneNumber },
    { label: "メールアドレス", isSet: !!values.email },
    {
      label: "緯度・経度",
      isSet:
        values.latitude !== null &&
        values.latitude !== undefined &&
        values.longitude !== null &&
        values.longitude !== undefined,
    },
    { label: "営業時間", isSet: !!values.businessHours },
    { label: "価格帯", isSet: !!values.priceRange },
    { label: "拠点説明", isSet: !!values.description },
    { label: "拠点画像", isSet: !!values.imageUrl },
    { label: "Google Place ID", isSet: !!values.googleBusinessPlaceId },
    { label: "決済方法", isSet: !!values.paymentAccepted },
    { label: "事業者名（全社）", isSet: globals.businessName },
    { label: "設立日（全社）", isSet: globals.establishedDate },
    { label: "ソーシャルリンク（全社）", isSet: globals.socialLinks },
  ];
  const setCount = items.filter((i) => i.isSet).length;
  return {
    score: Math.round((setCount / items.length) * 100),
    items,
    setCount,
  };
}

interface LocationMeoScoreCardProps {
  control: Control<LocationFormInput>;
  globals: GlobalsMeoFlags;
}

export function LocationMeoScoreCard({
  control,
  globals,
}: LocationMeoScoreCardProps) {
  const watched = useWatch({ control });
  const scoreValues: MeoScoreValues = {
    name: watched.name,
    postalCode: watched.postalCode,
    prefecture: watched.prefecture,
    city: watched.city,
    phoneNumber: watched.phoneNumber,
    email: watched.email,
    latitude: watched.latitude,
    longitude: watched.longitude,
    businessHours: watched.businessHours,
    priceRange: watched.priceRange,
    description: watched.description,
    imageUrl: watched.imageUrl,
    googleBusinessPlaceId: watched.googleBusinessPlaceId,
    paymentAccepted: watched.paymentAccepted,
  };
  const { score, items, setCount } = calculateMeoScore(scoreValues, globals);

  const TOTAL = items.length;
  const radius = 60;
  const strokeWidth = 8;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <Card>
      <CardHeader>
        <CardTitle>MEO 情報充実度スコア</CardTitle>
        <CardDescription>
          ローカル検索で有利になるための設定充実度を確認できます
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          {/* SVG circular progress */}
          <div className="shrink-0">
            <svg
              height={radius * 2}
              width={radius * 2}
              viewBox={`0 0 ${radius * 2} ${radius * 2}`}
              aria-hidden="true"
            >
              {/* Background circle */}
              <circle
                stroke="currentColor"
                className="text-muted"
                fill="transparent"
                strokeWidth={strokeWidth}
                r={normalizedRadius}
                cx={radius}
                cy={radius}
              />
              {/* Progress circle */}
              <circle
                stroke="currentColor"
                className="text-primary"
                fill="transparent"
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference} ${circumference}`}
                style={{ strokeDashoffset }}
                strokeLinecap="round"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
                transform={`rotate(-90 ${radius} ${radius})`}
              />
              <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                className="fill-foreground text-lg font-bold"
                fontSize="18"
                fontWeight="bold"
              >
                {score}%
              </text>
            </svg>
          </div>

          <div>
            <p className="text-2xl font-bold">
              {setCount} / {TOTAL}
            </p>
            <p className="text-sm text-muted-foreground">項目が設定済み</p>
            {score === 100 && (
              <p className="mt-1 text-sm font-medium text-success">
                全項目完了 — ローカル検索に最適化されています
              </p>
            )}
            {score >= 70 && score < 100 && (
              <p className="mt-1 text-sm text-muted-foreground">
                残り {TOTAL - setCount} 項目で充実度がさらに向上します
              </p>
            )}
            {score < 70 && (
              <p className="mt-1 text-sm text-muted-foreground">
                MEO タブで情報を入力してスコアを高めましょう
              </p>
            )}
          </div>
        </div>

        {/* チェックリスト */}
        <ul className="divide-y divide-border border-y border-border">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-3 py-2 text-sm"
            >
              {item.isSet ? (
                <IconCheck
                  className="h-4 w-4 shrink-0 text-success"
                  aria-hidden="true"
                />
              ) : (
                <IconX
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span
                className={
                  item.isSet ? "text-foreground" : "text-muted-foreground"
                }
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

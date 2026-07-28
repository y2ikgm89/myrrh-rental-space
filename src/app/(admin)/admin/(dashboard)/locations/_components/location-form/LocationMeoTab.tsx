"use client";

import { getInputProps } from "@conform-to/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/admin/components/ui";
import { LocationGbpSyncCard } from "../LocationGbpSyncCard";
import { LocationMeoScoreCard } from "../LocationMeoScoreCard";
import type { LocationMeoTabProps } from "./types";

export function LocationMeoTab({
  isPending,
  fields,
  meoValues,
  globals,
  location,
  gbpEnabledGlobally,
  latitude,
  setLatitude,
  longitude,
  setLongitude,
  phoneNumber,
  setPhoneNumber,
  email,
  setEmail,
  priceRange,
  setPriceRange,
  paymentAccepted,
  setPaymentAccepted,
  googleBusinessPlaceId,
  setGoogleBusinessPlaceId,
}: LocationMeoTabProps) {
  return (
    <>
      <LocationMeoScoreCard values={meoValues} globals={globals} />

      {location ? (
        <LocationGbpSyncCard
          locationId={location.id}
          googleBusinessPlaceId={location.googleBusinessPlaceId}
          gbpSyncEnabled={location.gbpSyncEnabled}
          gbpSyncedAt={location.gbpSyncedAt}
          gbpSyncError={location.gbpSyncError}
          gbpEnabledGlobally={gbpEnabledGlobally}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>MEO（ローカル検索最適化）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location-latitude">緯度</Label>
              <Input
                id="location-latitude"
                type="number"
                step="any"
                placeholder="35.6812"
                disabled={isPending}
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                aria-invalid={fields.latitude.errors ? true : undefined}
                aria-describedby={
                  fields.latitude.errors ? fields.latitude.errorId : undefined
                }
              />
              {fields.latitude.errors && (
                <p
                  id={fields.latitude.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.latitude.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-longitude">経度</Label>
              <Input
                id="location-longitude"
                type="number"
                step="any"
                placeholder="139.7671"
                disabled={isPending}
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                aria-invalid={fields.longitude.errors ? true : undefined}
                aria-describedby={
                  fields.longitude.errors ? fields.longitude.errorId : undefined
                }
              />
              {fields.longitude.errors && (
                <p
                  id={fields.longitude.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.longitude.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-phoneNumber">電話番号</Label>
            <Input
              id="location-phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="03-1234-5678"
              disabled={isPending}
              aria-invalid={fields.phoneNumber.errors ? true : undefined}
              aria-describedby={
                fields.phoneNumber.errors
                  ? fields.phoneNumber.errorId
                  : undefined
              }
            />
            {fields.phoneNumber.errors && (
              <p
                id={fields.phoneNumber.errorId}
                className="text-sm text-destructive"
              >
                {fields.phoneNumber.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-email">メールアドレス</Label>
            <Input
              id="location-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@example.com"
              disabled={isPending}
              aria-invalid={fields.email.errors ? true : undefined}
              aria-describedby={
                fields.email.errors ? fields.email.errorId : undefined
              }
            />
            {fields.email.errors && (
              <p id={fields.email.errorId} className="text-sm text-destructive">
                {fields.email.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-priceRange">価格帯</Label>
            <Input
              id="location-priceRange"
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
              placeholder="¥1,000〜¥5,000/時間"
              disabled={isPending}
              aria-invalid={fields.priceRange.errors ? true : undefined}
              aria-describedby={
                fields.priceRange.errors ? fields.priceRange.errorId : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              例: ¥1,000〜¥5,000/時間（最大 100 文字）
            </p>
            {fields.priceRange.errors && (
              <p
                id={fields.priceRange.errorId}
                className="text-sm text-destructive"
              >
                {fields.priceRange.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-paymentAccepted">利用可能な決済方法</Label>
            <Input
              id="location-paymentAccepted"
              value={paymentAccepted}
              onChange={(e) => setPaymentAccepted(e.target.value)}
              placeholder="現金, クレジットカード, 電子マネー"
              disabled={isPending}
              aria-invalid={fields.paymentAccepted.errors ? true : undefined}
              aria-describedby={
                fields.paymentAccepted.errors
                  ? fields.paymentAccepted.errorId
                  : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              現金, クレジットカード, 電子マネー, QRコード決済
            </p>
            {fields.paymentAccepted.errors && (
              <p
                id={fields.paymentAccepted.errorId}
                className="text-sm text-destructive"
              >
                {fields.paymentAccepted.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-googleBusinessPlaceId">
              Google Business Place ID
            </Label>
            <Input
              id="location-googleBusinessPlaceId"
              value={googleBusinessPlaceId}
              onChange={(e) => setGoogleBusinessPlaceId(e.target.value)}
              placeholder="ChIJ..."
              disabled={isPending}
              aria-invalid={
                fields.googleBusinessPlaceId.errors ? true : undefined
              }
              aria-describedby={
                fields.googleBusinessPlaceId.errors
                  ? fields.googleBusinessPlaceId.errorId
                  : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              Google Maps Platform で確認できます（ChIJ...）
            </p>
            {fields.googleBusinessPlaceId.errors && (
              <p
                id={fields.googleBusinessPlaceId.errorId}
                className="text-sm text-destructive"
              >
                {fields.googleBusinessPlaceId.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.googleReviewUrl.id}>Google 口コミ URL</Label>
            <Input
              {...getInputProps(fields.googleReviewUrl, { type: "url" })}
              placeholder="https://g.page/r/..."
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              お客様に口コミ投稿を促すための URL
            </p>
            {fields.googleReviewUrl.errors && (
              <p
                id={fields.googleReviewUrl.errorId}
                className="text-sm text-destructive"
              >
                {fields.googleReviewUrl.errors.join(", ")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

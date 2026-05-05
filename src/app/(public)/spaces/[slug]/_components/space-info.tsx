import type { JsonValue } from "@prisma/client/runtime/client";
import {
  IconUsers,
  IconRuler2,
  IconMapPin,
  IconWalk,
  IconCar,
} from "@tabler/icons-react";

import { Heading } from "../../../_shared/components/design-system/heading";
import { Prose } from "../../../_shared/components/design-system/prose";
import { Badge } from "../../../_shared/components/design-system/badge";
import { Stack } from "../../../_shared/components/design-system/stack";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";

interface SpaceInfoProps {
  readonly space: {
    readonly name: string;
    readonly descriptionHtml: string;
    readonly capacity: number;
    readonly area: number | null;
    /** 拠点住所 + 所在地補足の1行 */
    readonly lineAddress: string;
    readonly facilities: JsonValue;
    readonly category: { readonly name: string } | null;
    /**
     * 親 Location（accessLines / parkingInfo は Booking.com Room → Property の
     * 業界標準パターンに沿って Space 詳細から表示する）。
     */
    readonly location: {
      readonly name: string;
      readonly accessLines: readonly string[];
      readonly parkingInfo: string | null;
    } | null;
  };
}

export function SpaceInfo({ space }: SpaceInfoProps) {
  // facilities はスキーマで重複禁止が保証されている（JsonValue 型ガードのみ実施）
  const facilities: readonly string[] = Array.isArray(space.facilities)
    ? space.facilities.filter((v): v is string => typeof v === "string")
    : [];

  return (
    <Stack gap="xl">
      {/* Category + Meta */}
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          {space.category ? <Badge>{space.category.name}</Badge> : null}
          {space.location ? (
            <Badge variant="info">{space.location.name}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <IconUsers className="h-4 w-4" />
            {space.capacity}名
          </span>
          {space.area ? (
            <span className="flex items-center gap-1">
              <IconRuler2 className="h-4 w-4" />
              {Number(space.area)}㎡
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <IconMapPin className="h-4 w-4" />
            {space.lineAddress}
          </span>
        </div>
      </div>

      {/* Description */}
      {space.descriptionHtml ? (
        <div>
          <Heading level={2} className="mb-4">
            スペースについて
          </Heading>
          <Prose>
            <SanitizedHtml html={space.descriptionHtml} />
          </Prose>
        </div>
      ) : null}

      {/* Facilities */}
      {facilities.length > 0 ? (
        <div>
          <Heading level={2} className="mb-4">
            設備・備品
          </Heading>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {facilities.map((facility) => (
              <div
                key={facility}
                className="border border-border px-3 py-2 text-sm"
              >
                {facility}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Access — 親 Location から継承表示（Booking.com Room → Property 標準）。
          スペース固有の補足は addressDetail / lineAddress（メタ行）に集約。 */}
      {space.location &&
      (space.location.accessLines.length > 0 || space.location.parkingInfo) ? (
        <div>
          <Heading level={2} className="mb-4">
            アクセス
          </Heading>
          <Stack gap="md">
            {space.location.accessLines.length > 0 ? (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <IconWalk
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <ol className="space-y-1">
                  {space.location.accessLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            {space.location.parkingInfo ? (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <IconCar
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <p className="whitespace-pre-line">
                  {space.location.parkingInfo}
                </p>
              </div>
            ) : null}
          </Stack>
        </div>
      ) : null}
    </Stack>
  );
}

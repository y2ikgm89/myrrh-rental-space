import { IconCar, IconMapPin, IconWalk } from "@tabler/icons-react";

import { Heading } from "../../../_shared/components/design-system/heading";
import { Prose } from "../../../_shared/components/design-system/prose";
import { Stack } from "../../../_shared/components/design-system/stack";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { parseFacilities } from "@/shared/lib/json-validators";

interface SpaceInfoProps {
  readonly space: {
    readonly name: string;
    readonly descriptionHtml: string;
    /** 拠点住所 + 所在地補足の1行 */
    readonly lineAddress: string;
    /** Prisma Json（{ name, iconName }[] 形式 — `parseFacilities` で防御的型ガード） */
    readonly facilities: unknown;
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
  // facilities は構造化済み `{ name, iconName }[]`（migration 20260507163006）。
  // `parseFacilities` が SSoT — `facilitiesSchema` の uniqueness refine + curation 外
  // iconName fallback を一括適用する（`@/shared/lib/json-validators`）。
  const facilities = parseFacilities(space.facilities);

  return (
    <Stack gap="xl">
      {/* 住所行（category / location / capacity / area は ArticleHeader meta に集約済） */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <IconMapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{space.lineAddress}</span>
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
          <div className="@container">
            <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3">
              {facilities.map((facility) => (
                <div
                  key={facility.name}
                  className="flex items-center gap-3 border border-border px-3 py-2 text-sm"
                >
                  {facility.iconName ? (
                    <CuratedIcon
                      name={facility.iconName}
                      className="h-4 w-4 shrink-0 text-accent"
                    />
                  ) : null}
                  <span>{facility.name}</span>
                </div>
              ))}
            </div>
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

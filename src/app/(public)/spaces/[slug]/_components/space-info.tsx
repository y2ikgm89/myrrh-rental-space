import type { JsonValue } from "@prisma/client/runtime/client";
import { IconUsers, IconRuler2, IconMapPin } from "@tabler/icons-react";

import { Heading } from "../../../_shared/components/design-system/heading";
import { Prose } from "../../../_shared/components/design-system/prose";
import { Badge } from "../../../_shared/components/design-system/badge";
import { Stack } from "../../../_shared/components/design-system/stack";

interface SpaceInfoProps {
  readonly space: {
    readonly name: string;
    readonly description: string | null;
    readonly capacity: number;
    readonly area: number | null;
    /** 拠点住所 + 所在地補足の1行 */
    readonly lineAddress: string;
    readonly facilities: JsonValue;
    readonly category: { readonly name: string } | null;
    readonly location: { readonly name: string } | null;
  };
}

export function SpaceInfo({ space }: SpaceInfoProps) {
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
      {space.description ? (
        <div>
          <Heading level={2} className="mb-4">
            スペースについて
          </Heading>
          <Prose>
            <p>{space.description}</p>
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
    </Stack>
  );
}

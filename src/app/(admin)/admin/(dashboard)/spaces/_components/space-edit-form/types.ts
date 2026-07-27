import type { FieldMetadata } from "@conform-to/react";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";

export type SpaceEditLocationOption = {
  id: string;
  name: string;
  address: string;
};

export type SpaceEditCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export type FacilityItem = { key: string; name: string; iconName: string };

export type ConformFieldErrors = FieldMetadata<unknown>["errors"];

export function genKey(): string {
  return crypto.randomUUID();
}

export function getInitialDescriptionJson(
  space: SpaceWithStats | undefined,
): string {
  if (!space) return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  return typeof space.descriptionJson === "string"
    ? space.descriptionJson
    : JSON.stringify(
        space.descriptionJson ?? JSON.parse(EMPTY_LEXICAL_EDITOR_STATE_JSON),
      );
}

export function fieldHasErrors(errors: ConformFieldErrors): boolean {
  return Array.isArray(errors) && errors.length > 0;
}

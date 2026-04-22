import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type {
  CreateSectionStyleInput,
  DeriveSectionStyleInput,
  UpdateSectionStyleInput,
} from "@/shared/lib/validations/section-style";
import { DEFAULT_SECTION_STYLE } from "./types";
import { mergeStyleLayers } from "./style-merger";
import {
  parseSectionStylePayload,
  parseSectionStyleOverride,
} from "@/shared/lib/validations/section-style";

/**
 * Section Style commands — Phase B.P5.
 *
 * create / update / delete / derive. Authorization is enforced upstream by
 * `executeAdminMutationResult`; these commands only guarantee domain-level
 * invariants (existence, name uniqueness, derivation resolution).
 */

export type SectionStyleActor = {
  readonly id: string;
  readonly role: Role;
};

function toJsonOrNull(value: unknown): Prisma.InputJsonValue {
  // All payload groups are plain objects — cast via InputJsonValue boundary.
  const normalized = value ?? {};
  return normalized as Prisma.InputJsonValue;
}

export async function createSectionStyle(
  input: CreateSectionStyleInput,
  actor: SectionStyleActor,
): Promise<{ id: string }> {
  const existing = await prisma.sectionStyle.findFirst({
    where: { name: input.name, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError(
      `同じ名前の Style が既に存在します: ${input.name}`,
      "CONFLICT",
    );
  }

  const created = await prisma.sectionStyle.create({
    data: {
      name: input.name,
      scope: input.scope,
      applicableTypes: input.applicableTypes,
      spacing: toJsonOrNull(input.payload.spacing),
      background: toJsonOrNull(input.payload.background),
      container: toJsonOrNull(input.payload.container),
      typography: toJsonOrNull(input.payload.typography),
      animation: toJsonOrNull(input.payload.animation),
      ...(input.payload.customClass !== undefined && {
        customClass: input.payload.customClass,
      }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  return created;
}

export async function updateSectionStyle(
  id: string,
  input: UpdateSectionStyleInput,
  actor: SectionStyleActor,
): Promise<void> {
  const existing = await prisma.sectionStyle.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) {
    throw new DomainError("Style が見つかりません", "NOT_FOUND");
  }

  if (input.name !== undefined && input.name !== existing.name) {
    const dup = await prisma.sectionStyle.findFirst({
      where: { name: input.name, deletedAt: null, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      throw new DomainError(
        `同じ名前の Style が既に存在します: ${input.name}`,
        "CONFLICT",
      );
    }
  }

  const data: Prisma.SectionStyleUpdateInput = {
    updatedById: actor.id,
  };
  if (input.name !== undefined) {
    data.name = input.name;
  }
  if (input.applicableTypes !== undefined) {
    data.applicableTypes = input.applicableTypes;
  }
  if (input.payload !== undefined) {
    const payload = input.payload;
    if (payload.spacing !== undefined) {
      data.spacing = toJsonOrNull(payload.spacing);
    }
    if (payload.background !== undefined) {
      data.background = toJsonOrNull(payload.background);
    }
    if (payload.container !== undefined) {
      data.container = toJsonOrNull(payload.container);
    }
    if (payload.typography !== undefined) {
      data.typography = toJsonOrNull(payload.typography);
    }
    if (payload.animation !== undefined) {
      data.animation = toJsonOrNull(payload.animation);
    }
    if (payload.customClass !== undefined) {
      data.customClass = payload.customClass;
    }
  }

  await prisma.sectionStyle.update({
    where: { id },
    data,
  });
}

export async function deleteSectionStyle(
  id: string,
  _actor: SectionStyleActor,
): Promise<{ affectedCount: number }> {
  const existing = await prisma.sectionStyle.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      _count: {
        select: {
          sections: true,
          pagesAsDefault: true,
          settingsGlobal: true,
        },
      },
    },
  });
  if (!existing) {
    throw new DomainError("Style が見つかりません", "NOT_FOUND");
  }

  const affectedCount =
    existing._count.sections +
    existing._count.pagesAsDefault +
    existing._count.settingsGlobal;

  // onDelete: SetNull is schema-level; soft-delete keeps referential history
  // (referenced rows automatically get their FK reset on hard delete, but we
  // soft-delete here to preserve cascade resolver "last known" semantics).
  await prisma.sectionStyle.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return { affectedCount };
}

export async function deriveSectionStyle(
  baseId: string,
  input: DeriveSectionStyleInput,
  actor: SectionStyleActor,
): Promise<{ id: string }> {
  const parent = await prisma.sectionStyle.findFirst({
    where: { id: baseId, deletedAt: null },
    select: {
      scope: true,
      applicableTypes: true,
      spacing: true,
      background: true,
      container: true,
      typography: true,
      animation: true,
      customClass: true,
    },
  });
  if (!parent) {
    throw new DomainError("親 Style が見つかりません", "NOT_FOUND");
  }

  const dup = await prisma.sectionStyle.findFirst({
    where: { name: input.name, deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    throw new DomainError(
      `同じ名前の Style が既に存在します: ${input.name}`,
      "CONFLICT",
    );
  }

  // Deep merge: DEFAULT → parent → override (if provided)
  const parentPayload = parseSectionStylePayload({
    spacing: parent.spacing,
    background: parent.background,
    container: parent.container,
    typography: parent.typography,
    animation: parent.animation,
    ...(parent.customClass !== null && { customClass: parent.customClass }),
  });
  const overrideLayer = input.overrides
    ? parseSectionStyleOverride(input.overrides)
    : null;

  const merged = mergeStyleLayers([
    DEFAULT_SECTION_STYLE,
    parentPayload,
    overrideLayer,
  ]);

  const created = await prisma.sectionStyle.create({
    data: {
      name: input.name,
      scope: parent.scope,
      applicableTypes: parent.applicableTypes,
      spacing: toJsonOrNull(merged.spacing),
      background: toJsonOrNull(merged.background),
      container: toJsonOrNull(merged.container),
      typography: toJsonOrNull(merged.typography),
      animation: toJsonOrNull(merged.animation),
      ...(merged.customClass !== undefined && {
        customClass: merged.customClass,
      }),
      parentId: baseId,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });
  return created;
}

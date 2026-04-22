import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * Section Style queries — Phase B.P5.
 *
 * Full list / detail / usage implementations backing the Style Library admin UI.
 */

export type SectionStyleScope = "global" | "page" | "section";

export type SectionStyleListFilters = {
  scope?: SectionStyleScope;
  applicableType?: string;
  search?: string;
};

export type SectionStyleListItem = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  applicableTypes: string[];
  customClass: string | null;
  version: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  spacing: unknown;
  background: unknown;
  container: unknown;
  typography: unknown;
  animation: unknown;
  _count: {
    sections: number;
    pagesAsDefault: number;
    settingsGlobal: number;
    derived: number;
  };
};

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  scope: true,
  applicableTypes: true,
  customClass: true,
  version: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  spacing: true,
  background: true,
  container: true,
  typography: true,
  animation: true,
  _count: {
    select: {
      sections: true,
      pagesAsDefault: true,
      settingsGlobal: true,
      derived: true,
    },
  },
} as const;

function toListItem(
  row: Awaited<
    ReturnType<
      typeof prisma.sectionStyle.findMany<{ select: typeof LIST_SELECT }>
    >
  >[number],
): SectionStyleListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    applicableTypes: row.applicableTypes,
    customClass: row.customClass,
    version: row.version,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    spacing: row.spacing,
    background: row.background,
    container: row.container,
    typography: row.typography,
    animation: row.animation,
    _count: {
      sections: row._count.sections,
      pagesAsDefault: row._count.pagesAsDefault,
      settingsGlobal: row._count.settingsGlobal,
      derived: row._count.derived,
    },
  };
}

/**
 * List SectionStyle rows (soft-delete aware).
 */
export async function listSectionStyles(
  filters: SectionStyleListFilters = {},
): Promise<SectionStyleListItem[]> {
  const rows = await prisma.sectionStyle.findMany({
    where: {
      deletedAt: null,
      ...(filters.scope !== undefined && { scope: filters.scope }),
      ...(filters.applicableType !== undefined && {
        applicableTypes: { has: filters.applicableType },
      }),
      ...(filters.search !== undefined &&
        filters.search.length > 0 && {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
          ],
        }),
    },
    orderBy: [{ scope: "asc" }, { name: "asc" }],
    select: LIST_SELECT,
  });
  return rows.map(toListItem);
}

export type SectionStyleUsage = {
  sections: {
    id: string;
    type: string;
    pageId: string | null;
    page: {
      id: string;
      slug: string;
      title: string;
    } | null;
  }[];
  pages: {
    id: string;
    slug: string;
    title: string;
  }[];
  settings: {
    id: string;
  }[];
};

const DETAIL_SELECT = {
  id: true,
  name: true,
  description: true,
  scope: true,
  applicableTypes: true,
  customClass: true,
  version: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  spacing: true,
  background: true,
  container: true,
  typography: true,
  animation: true,
  sections: {
    select: {
      id: true,
      type: true,
      pageId: true,
      page: {
        select: {
          id: true,
          slug: true,
          title: true,
        },
      },
    },
  },
  pagesAsDefault: {
    select: {
      id: true,
      slug: true,
      title: true,
    },
  },
  settingsGlobal: {
    select: {
      id: true,
    },
  },
  _count: {
    select: {
      sections: true,
      pagesAsDefault: true,
      settingsGlobal: true,
      derived: true,
    },
  },
} as const;

export type SectionStyleDetail = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  applicableTypes: string[];
  customClass: string | null;
  version: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  spacing: unknown;
  background: unknown;
  container: unknown;
  typography: unknown;
  animation: unknown;
  usedInSections: SectionStyleUsage["sections"];
  usedInPages: SectionStyleUsage["pages"];
  usedInSettings: SectionStyleUsage["settings"];
  _count: {
    sections: number;
    pagesAsDefault: number;
    settingsGlobal: number;
    derived: number;
  };
};

export async function getSectionStyleById(
  id: string,
): Promise<SectionStyleDetail | null> {
  const row = await prisma.sectionStyle.findFirst({
    where: { id, deletedAt: null },
    select: DETAIL_SELECT,
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    applicableTypes: row.applicableTypes,
    customClass: row.customClass,
    version: row.version,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    spacing: row.spacing,
    background: row.background,
    container: row.container,
    typography: row.typography,
    animation: row.animation,
    usedInSections: row.sections,
    usedInPages: row.pagesAsDefault,
    usedInSettings: row.settingsGlobal,
    _count: {
      sections: row._count.sections,
      pagesAsDefault: row._count.pagesAsDefault,
      settingsGlobal: row._count.settingsGlobal,
      derived: row._count.derived,
    },
  };
}

/**
 * Fetch usage only (no payload). Used for detail page "usage" table render.
 */
export async function getSectionStyleUsage(
  id: string,
): Promise<SectionStyleUsage> {
  const row = await prisma.sectionStyle.findFirst({
    where: { id, deletedAt: null },
    select: {
      sections: {
        select: {
          id: true,
          type: true,
          pageId: true,
          page: {
            select: {
              id: true,
              slug: true,
              title: true,
            },
          },
        },
      },
      pagesAsDefault: {
        select: {
          id: true,
          slug: true,
          title: true,
        },
      },
      settingsGlobal: {
        select: {
          id: true,
        },
      },
    },
  });
  if (!row) {
    return { sections: [], pages: [], settings: [] };
  }
  return {
    sections: row.sections,
    pages: row.pagesAsDefault,
    settings: row.settingsGlobal,
  };
}

/**
 * Fetch the full payload of a parent style, used when deriving a new style.
 * Returns the raw JSON payload fields needed for deep merge.
 */
export async function getSectionStylePayloadForDerive(id: string): Promise<{
  name: string;
  scope: string;
  applicableTypes: string[];
  spacing: unknown;
  background: unknown;
  container: unknown;
  typography: unknown;
  animation: unknown;
  customClass: string | null;
} | null> {
  const row = await prisma.sectionStyle.findFirst({
    where: { id, deletedAt: null },
    select: {
      name: true,
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
  return row;
}

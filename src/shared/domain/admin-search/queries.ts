import "server-only";

import { prisma } from "@/shared/db/prisma";
import type {
  SearchResultGroup,
  SearchResultItem,
} from "@/shared/lib/command-palette-types";
import type { Resource } from "@/shared/lib/admin-resources";
import { keysOf } from "@/shared/lib/serialize";

const SEARCH_LIMIT_PER_RESOURCE = 5;

function ci(query: string) {
  return { contains: query, mode: "insensitive" as const };
}

async function searchSpaces(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.space.findMany({
    where: {
      OR: [{ name: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, name: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "space" as const,
    label: r.name,
    description: `/${r.slug}`,
    href: `/admin/spaces/${r.id}`,
  }));
}

async function searchCustomers(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.customer.findMany({
    where: {
      OR: [
        { lastName: ci(query) },
        { firstName: ci(query) },
        { email: ci(query) },
        { companyName: ci(query) },
      ],
    },
    select: { id: true, lastName: true, firstName: true, email: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "customer" as const,
    label: `${r.lastName} ${r.firstName ?? ""}`.trim(),
    description: r.email,
    href: `/admin/customers/${r.id}`,
  }));
}

async function searchReservations(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      deletedAt: null,
      OR: [
        { customer: { lastName: ci(query) } },
        { customer: { email: ci(query) } },
        { space: { name: ci(query) } },
      ],
    },
    select: {
      id: true,
      startTime: true,
      customer: { select: { lastName: true } },
      space: { select: { name: true } },
    },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "reservation" as const,
    label: `${r.customer?.lastName ?? ""} ${r.space?.name ?? ""}`.trim(),
    description: r.startTime.toISOString().slice(0, 10),
    href: `/admin/reservations/${r.id}`,
  }));
}

async function searchPosts(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.post.findMany({
    where: {
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "post" as const,
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/posts/${r.id}`,
  }));
}

async function searchNews(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.news.findMany({
    where: {
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "news" as const,
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/news/${r.id}`,
  }));
}

async function searchPages(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.page.findMany({
    where: {
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "page" as const,
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/pages/${r.slug}`,
  }));
}

async function searchEvents(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.event.findMany({
    where: {
      deletedAt: null,
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true, startTime: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "event" as const,
    label: r.title,
    description: r.startTime.toISOString().slice(0, 10),
    href: `/admin/events/${r.id}`,
  }));
}

async function searchInquiries(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.inquiry.findMany({
    where: {
      OR: [{ name: ci(query) }, { email: ci(query) }, { subject: ci(query) }],
    },
    select: { id: true, name: true, subject: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "inquiry" as const,
    label: r.subject,
    description: r.name,
    href: `/admin/inquiries/${r.id}`,
  }));
}

async function searchFaqItems(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.faqItem.findMany({
    where: {
      deletedAt: null,
      OR: [{ question: ci(query) }, { answer: ci(query) }],
    },
    select: { id: true, question: true, categoryId: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "faq" as const,
    label: r.question,
    href: `/admin/faq/${r.categoryId}`,
  }));
}

async function searchCoupons(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.coupon.findMany({
    where: {
      OR: [{ code: ci(query) }, { name: ci(query) }],
    },
    select: { id: true, code: true, name: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "coupon" as const,
    label: `${r.code} (${r.name})`,
    href: `/admin/coupons/${r.id}`,
  }));
}

async function searchLocations(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.location.findMany({
    where: {
      OR: [{ name: ci(query) }, { address: ci(query) }],
    },
    select: { id: true, name: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "location" as const,
    label: r.name,
    href: `/admin/spaces?tab=locations&edit=${r.id}`,
  }));
}

const SEARCH_BY_RESOURCE = {
  space: searchSpaces,
  customer: searchCustomers,
  reservation: searchReservations,
  post: searchPosts,
  news: searchNews,
  page: searchPages,
  event: searchEvents,
  inquiry: searchInquiries,
  faq: searchFaqItems,
  coupon: searchCoupons,
  location: searchLocations,
} satisfies Partial<
  Record<Resource, (q: string) => Promise<SearchResultItem[]>>
>;

type SearchableResource = keyof typeof SEARCH_BY_RESOURCE;

function isSearchableResource(
  resource: Resource,
): resource is SearchableResource {
  return resource in SEARCH_BY_RESOURCE;
}

export async function searchByResource(
  resource: Resource,
  query: string,
): Promise<SearchResultGroup> {
  if (!isSearchableResource(resource)) return { resource, items: [] };
  const items = await SEARCH_BY_RESOURCE[resource](query);
  return { resource, items };
}

export const SEARCHABLE_RESOURCES: readonly Resource[] =
  keysOf(SEARCH_BY_RESOURCE);

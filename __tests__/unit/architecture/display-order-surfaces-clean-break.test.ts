import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

function extractModel(schema: string, modelName: string): string {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`, "u"),
  );
  if (!match) throw new Error(`model ${modelName} not found`);
  return match[0];
}

describe("display order surfaces clean-break contract", () => {
  test("terms use displayOrder as the canonical shared order", () => {
    const schema = readRepoFile("prisma", "schema.prisma");
    const model = extractModel(schema, "TermsDocument");

    expect(model).toContain("displayOrder");
    expect(model).not.toContain("footerOrder");

    const source = [
      readRepoFile("src", "shared", "domain", "terms", "commands.ts"),
      readRepoFile("src", "shared", "domain", "terms", "queries.ts"),
      readRepoFile("src", "shared", "domain", "terms", "admin-queries.ts"),
      readRepoFile("src", "shared", "lib", "validations", "terms.ts"),
      readRepoFile(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "lib",
        "validations",
        "terms.ts",
      ),
      readRepoFile(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "terms",
        "index.ts",
      ),
      readRepoFile(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "terms",
        "_components",
        "TermsTable.tsx",
      ),
    ].join("\n");

    expect(source).toContain("displayOrder");
    expect(source).not.toContain("footerOrder");
    expect(source).toContain("export const termsFormSchema = z.strictObject({");
    expect(source).toContain(
      "export const termsSettingsFormSchema = z.strictObject({",
    );
    expect(source).not.toContain("displayOrder: z.");
    expect(source).not.toContain("footerOrder: z.");
  });

  test("announcement bars use D&D displayOrder, not numeric priority input", () => {
    const schema = readRepoFile("prisma", "schema.prisma");
    const model = extractModel(schema, "AnnouncementBar");

    expect(model).toContain("displayOrder");
    expect(model).not.toContain("priority");

    const source = [
      readRepoFile(
        "src",
        "shared",
        "domain",
        "settings",
        "announcement-bar.ts",
      ),
      readRepoFile(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "announcement-bar.ts",
      ),
      readRepoFile(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "settings",
        "appearance",
        "_components",
        "announcement-bar",
        "bar-form-schema.ts",
      ),
      readRepoFile(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "settings",
        "appearance",
        "_components",
        "announcement-bar",
        "BarDialog.tsx",
      ),
      readRepoFile(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "settings",
        "appearance",
        "_components",
        "announcement-bar",
        "BarList.tsx",
      ),
    ].join("\n");

    expect(source).toContain("displayOrder");
    expect(source).not.toContain("priority");
    expect(source).not.toContain("優先度");
    expect(source).toContain(
      "export const announcementBarInputSchema = z.strictObject({",
    );
    expect(source).toContain("export const barFormSchema = z.strictObject({");
    expect(source).not.toContain("priority: z.");
    expect(source).not.toContain("displayOrder: z.");
  });

  test("filtered post category lists do not allow partial-list D&D reordering", () => {
    const source = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "posts",
      "taxonomy",
      "_components",
      "CategoryManager.tsx",
    );
    const taxonomySchema = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "posts",
      "taxonomy",
      "_components",
      "taxonomy-schema.ts",
    );
    const postValidation = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "lib",
      "validations",
      "post.ts",
    );

    expect(source).toContain("const isSortable = !hasFilters;");
    expect(source).toContain("並び替えは検索を解除すると有効になります");
    expect(taxonomySchema).toContain(
      "const baseTaxonomySchema = z.strictObject({",
    );
    expect(postValidation).toContain(
      "export const postCategorySchema = z.strictObject({",
    );
    expect(taxonomySchema).not.toContain("order: z.");
    expect(postValidation).not.toContain("order: z.");
  });

  test("system-managed order forms reject legacy order fields instead of stripping them", () => {
    const faqValidation = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "lib",
      "validations",
      "faq.ts",
    );
    const locationValidation = readRepoFile(
      "src",
      "shared",
      "lib",
      "validations",
      "location.ts",
    );
    const spaceCategoryValidation = readRepoFile(
      "src",
      "shared",
      "lib",
      "validations",
      "space-category.ts",
    );
    const eventFormSchema = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "events",
      "_components",
      "event-form-schema.ts",
    );
    const eventForm = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "events",
      "_components",
      "EventForm.tsx",
    );
    const eventTicketTypes = readRepoFile(
      "src",
      "shared",
      "domain",
      "events",
      "ticket-types.ts",
    );
    const eventCommands = readRepoFile(
      "src",
      "shared",
      "domain",
      "events",
      "commands.ts",
    );

    expect(faqValidation).toContain(
      "export const faqCategoryFormSchema = z.strictObject({",
    );
    expect(faqValidation).toContain(
      "export const faqItemFormSchema = z.strictObject({",
    );
    expect(faqValidation).not.toContain("order: z.");

    expect(locationValidation).toContain(
      "export const locationFormBaseSchema = z.strictObject({",
    );
    expect(locationValidation).not.toContain("sortOrder: z.");

    expect(spaceCategoryValidation).toContain(
      "export const spaceCategoryFormSchema = z.strictObject({",
    );
    expect(spaceCategoryValidation).not.toContain("sortOrder: z.");

    expect(eventFormSchema).toContain(
      "const ticketInputSchema = z.strictObject({",
    );
    expect(eventFormSchema).not.toContain("sortOrder: z.");
    expect(eventForm).toContain(
      "value={JSON.stringify(tickets.map(serializeTicket))}",
    );
    expect(eventForm).not.toContain("value={JSON.stringify(tickets)}");
    expect(eventTicketTypes).toContain(
      'Omit<EventTicketWritableFields, "sortOrder">',
    );
    expect(eventCommands).toContain("...buildTicketWriteData(ticket, index)");
  });

  test("reorder action payload items are strict object contracts", () => {
    const locationActions = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
      "location.ts",
    );
    const spaceCategoryActions = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
      "space-category.ts",
    );
    const postTaxonomyActions = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
      "post",
      "taxonomy.ts",
    );

    expect(locationActions).toContain("const publishSchema = z.strictObject({");
    expect(locationActions).toContain("z.strictObject({\n      id: z.uuid");
    expect(spaceCategoryActions).toContain(
      "z.strictObject({\n      id: z.uuid",
    );
    expect(postTaxonomyActions).toContain("z.strictObject({\n      id: z.uuid");
  });

  test("sortable domain commands reject partial-list reorder payloads", () => {
    const faqItemCommands = readRepoFile(
      "src",
      "shared",
      "domain",
      "faq",
      "item-commands.ts",
    );
    const commands = [
      readRepoFile("src", "shared", "domain", "terms", "commands.ts"),
      readRepoFile(
        "src",
        "shared",
        "domain",
        "settings",
        "announcement-bar.ts",
      ),
      readRepoFile("src", "shared", "domain", "faq", "category-commands.ts"),
      readRepoFile("src", "shared", "domain", "locations", "commands.ts"),
      readRepoFile(
        "src",
        "shared",
        "domain",
        "space-categories",
        "commands.ts",
      ),
      readRepoFile("src", "shared", "domain", "posts", "category-commands.ts"),
      readRepoFile("src", "shared", "domain", "navigation", "commands.ts"),
      readRepoFile("src", "shared", "domain", "sections", "commands.ts"),
    ].join("\n");

    expect(commands).toContain("規約数が一致しません（過不足）");
    expect(commands).toContain("お知らせバー数が一致しません（過不足）");
    expect(commands).toContain("カテゴリ数が一致しません（過不足）");
    expect(commands).toContain("場所数が一致しません（過不足）");
    expect(commands).toContain("カテゴリー数が一致しません（過不足）");
    expect(commands).toContain("ナビゲーション数が一致しません（過不足）");
    expect(commands).toContain("SNSリンク数が一致しません（過不足）");
    expect(commands).toContain("セクション数が一致しません（過不足）");
    expect(commands).toContain("同じIDを複数指定することはできません");
    expect(commands).toContain("同じ順序を複数指定することはできません");
    expect(commands).toContain("同じ並び順を複数指定することはできません");
    expect(faqItemCommands).toContain("指定した並び順は他の質問と重複します");
    expect(faqItemCommands).toContain("id: { notIn: ids }");
  });

  test("ordered surfaces have database uniqueness and unique-safe reorder writes", () => {
    const schema = readRepoFile("prisma", "schema.prisma");
    const migration = readRepoFile(
      "prisma",
      "migrations",
      "20260705000000_order_uniqueness_constraints",
      "migration.sql",
    );
    const helper = readRepoFile("src", "shared", "domain", "order-sql.ts");
    const commands = [
      readRepoFile("src", "shared", "domain", "terms", "commands.ts"),
      readRepoFile(
        "src",
        "shared",
        "domain",
        "settings",
        "announcement-bar.ts",
      ),
      readRepoFile("src", "shared", "domain", "faq", "category-commands.ts"),
      readRepoFile("src", "shared", "domain", "faq", "item-commands.ts"),
      readRepoFile("src", "shared", "domain", "locations", "commands.ts"),
      readRepoFile(
        "src",
        "shared",
        "domain",
        "space-categories",
        "commands.ts",
      ),
      readRepoFile("src", "shared", "domain", "posts", "category-commands.ts"),
      readRepoFile("src", "shared", "domain", "navigation", "commands.ts"),
      readRepoFile("src", "shared", "domain", "sections", "commands.ts"),
      readRepoFile("src", "shared", "domain", "events", "commands.ts"),
      readRepoFile("src", "shared", "domain", "instagram", "commands.ts"),
    ].join("\n");

    expect(schema).toContain('previewFeatures = ["partialIndexes"]');
    for (const indexName of [
      "locations_active_sortOrder_key",
      "space_categories_sortOrder_key",
      "announcement_bars_displayOrder_key",
      "post_categories_order_key",
      "sections_pageId_order_key",
      "navigation_items_type_order_key",
      "social_links_order_key",
      "faq_categories_order_active_key",
      "faq_items_categoryId_order_active_key",
      "terms_documents_displayOrder_active_key",
      "event_tickets_eventId_sortOrder_key",
      "instagram_posts_sortOrder_key",
    ]) {
      expect(schema).toContain(indexName);
      expect(migration).toContain(`CREATE UNIQUE INDEX "${indexName}"`);
    }

    expect(helper).toContain("const TEMP_ORDER_BASE = -1_000_000;");
    expect(helper).toContain("const ORDER_SCOPE_LOCK_NAMESPACE = 728351;");
    expect(helper).toContain("buildUuidOrderSqlFragments");
    expect(helper).toContain("buildTextOrderSqlFragments");
    expect(helper).toContain("buildOrderScopeLockSql");
    expect(helper).toContain("pg_advisory_xact_lock");
    expect(commands).toContain("await prisma.$transaction(async (tx) => {");
    for (const scope of [
      '"locations:active"',
      '"space_categories:all"',
      '"announcement_bars:all"',
      '"post_categories:all"',
      '"faq_categories:active"',
      '"terms_documents:active"',
      '"social_links:all"',
      '"instagram_posts:all"',
      "`navigation:${",
      "`sections:${",
      "`faq_items:${",
      "`event_tickets:${",
    ]) {
      expect(commands).toContain(`buildOrderScopeLockSql(${scope}`);
    }
    expect(commands).toContain("Prisma.join(tempCases");
    expect(commands).toContain("Prisma.join(finalCases");
    expect(commands).toContain('SET "order" = -("order" + 1000000)');
    expect(commands).toContain('SET "order" = -"order" - 999999');
    expect(commands).toContain("?? -1) + 1");
    expect(commands).not.toContain("?? 0) + 1");
    expect(commands).not.toContain("increment: 1");
    expect(commands).toContain("チケットが見つかりません");
  });

  test("sidebar widget ordering uses pointer and keyboard sensors with an accessible handle", () => {
    const grid = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "settings",
      "_components",
      "sections",
      "sidebar",
      "SidebarWidgetGrid.tsx",
    );
    const card = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "settings",
      "_components",
      "sections",
      "sidebar",
      "SidebarWidgetCard.tsx",
    );

    expect(grid).toContain("PointerSensor");
    expect(grid).toContain("KeyboardSensor");
    expect(grid).toContain("sortableKeyboardCoordinates");
    expect(card).toContain('aria-label="ドラッグして並び替え"');
  });

  test("ordered visibility surfaces expose inline list toggles, not dialog-only status", () => {
    const navActions = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
      "navigation.ts",
    );
    const navRows = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "settings",
      "appearance",
      "_components",
      "navigation",
      "SortableNavItem.tsx",
    );
    const faqActions = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
      "faq.ts",
    );
    const faqGrid = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "faq",
      "_components",
      "FaqCategoryGrid.tsx",
    );

    expect(navActions).toContain("updateNavigationItemActive");
    expect(navActions).toContain("updateSocialLinkActive");
    expect(navActions).toContain("updateSocialLinkDesktopVisibility");
    expect(navActions).toContain("updateSocialLinkMobileVisibility");
    expect(navRows).toContain("Switch");
    expect(navRows).toContain("onToggleActive");
    expect(navRows).toContain("onToggleDesktop");
    expect(navRows).toContain("onToggleMobile");

    expect(faqActions).toContain("updateFaqCategoryActive");
    expect(faqGrid).toContain("PublishSwitch");
    expect(faqGrid).toContain("onToggleActive");
  });

  test("seed data does not rely on default order values for ordered surfaces", () => {
    const seed = readRepoFile("prisma", "seed.ts");

    expect(seed).toContain("nextCategoryOrder");
    expect(seed).toContain("prisma.postCategory.aggregate");
    expect(seed).toContain("order: nextCategoryOrder");
    expect(seed).not.toContain(
      "await prisma.postCategory.create({ data: category });",
    );
  });

  test("navigation create and edit inputs do not own persistent ordering", () => {
    const actions = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
      "navigation.ts",
    );
    const commands = readRepoFile(
      "src",
      "shared",
      "domain",
      "navigation",
      "commands.ts",
    );
    const formSchema = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "settings",
      "appearance",
      "_components",
      "navigation",
      "nav-form-schema.ts",
    );
    const dialog = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "settings",
      "appearance",
      "_components",
      "navigation",
      "NavigationDialog.tsx",
    );

    expect(formSchema).not.toContain("fields.order");
    expect(formSchema).not.toContain("順序は数値です");
    expect(dialog).not.toContain("fields.order");
    expect(dialog).not.toContain("defaultOrder");
    expect(actions).not.toContain("order: data.order");
    expect(commands).toContain("_max: { order: true }");
    expect(commands).toContain(
      "export const navigationItemInputSchema = z.strictObject({",
    );
    expect(commands).toContain(
      "export const socialLinkInputSchema = z.strictObject({",
    );
    expect(formSchema).toContain(
      "export const navFormSchema = z.strictObject({",
    );
    expect(formSchema).toContain(
      "export const socialFormSchema = z.strictObject({",
    );
    expect(commands).not.toContain(
      "order: z.number().int().min(0),\n  isActive",
    );
    expect(commands).not.toContain(
      "order: z.number().int().min(0),\n  showOnDesktop",
    );
  });

  test("pending sortable rows disable dnd-kit sorting at the hook boundary", () => {
    const termsTable = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "terms",
      "_components",
      "TermsTable.tsx",
    );
    const navRows = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "settings",
      "appearance",
      "_components",
      "navigation",
      "SortableNavItem.tsx",
    );
    const sidebarCard = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "settings",
      "_components",
      "sections",
      "sidebar",
      "SidebarWidgetCard.tsx",
    );
    const locationTable = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "locations",
      "_components",
      "LocationTable.tsx",
    );
    const faqItemsTable = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "faq",
      "_components",
      "FaqCategoryItemsTable.tsx",
    );
    const faqCategoryPage = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "faq",
      "[categoryId]",
      "page.tsx",
    );
    const spaceCategoryTable = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "space-categories",
      "_components",
      "CategoryTable.tsx",
    );
    const spaceCategoryTab = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "spaces",
      "_components",
      "CategoryTabContent.tsx",
    );
    const postCategoryManager = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "posts",
      "taxonomy",
      "_components",
      "CategoryManager.tsx",
    );

    expect(termsTable).toContain(
      "useSortable({ id: item.id, disabled: isPending })",
    );
    expect(navRows).toContain(
      "useSortable({ id: item.id, disabled: isPending })",
    );
    expect(navRows).toContain(
      "useSortable({ id: link.id, disabled: isPending })",
    );
    expect(sidebarCard).toContain(
      "useSortable({ id: getWidgetId(widget), disabled })",
    );
    expect(locationTable).toContain(
      "useSortable({ id: location.id, disabled: !sortable || isPending })",
    );
    expect(faqItemsTable).toContain(
      "useSortable({ id: item.id, disabled: !sortable || isPending })",
    );
    expect(faqItemsTable).toContain("const sortable = reorderEnabled;");
    expect(faqItemsTable).toContain("order: startIndex + index");
    expect(faqCategoryPage).toContain("const reorderEnabled =");
    expect(faqCategoryPage).toContain('params.sortBy === "order"');
    expect(faqCategoryPage).toContain('params.sortOrder === "asc"');
    expect(faqCategoryPage).toContain("!params.search");
    expect(faqCategoryPage).toContain('params.status === "all"');
    expect(faqCategoryPage).toContain('params.quickFilter === "all"');
    expect(spaceCategoryTable).toContain(
      "useSortable({ id: category.id, disabled: !sortable || isPending })",
    );
    expect(spaceCategoryTab).toContain(
      "const sortable = !params.catSearch && params.catIncludeInactive;",
    );
    expect(postCategoryManager).toContain(
      "useSortable({ id: category.id, disabled: !isSortable || isPending })",
    );
  });

  test("page section ordering exposes inline visibility control and disables sorting while pending", () => {
    const sectionValidation = readRepoFile(
      "src",
      "shared",
      "lib",
      "validations",
      "section.ts",
    );
    const pageSectionActions = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
      "page-section.ts",
    );
    const sidebar = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "pages",
      "[slug]",
      "edit",
      "_components",
      "SectionListSidebar.tsx",
    );
    const item = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "pages",
      "[slug]",
      "edit",
      "_components",
      "SectionListItem.tsx",
    );

    expect(sidebar).toContain(
      "useSortable({ id, disabled: !itemProps.canDrag || itemProps.isPending })",
    );
    expect(sidebar).toContain("const [isPending, startTransition]");
    expect(item).toContain("Switch");
    expect(item).toContain("onCheckedChange={onToggleActive}");
    expect(item).not.toContain("<DropdownMenuItem onClick={onToggleActive}>");
    expect(item).not.toContain("IconEye");
    expect(item).not.toContain("IconEyeOff");
    expect(sectionValidation).not.toContain(
      "order: z.number().int().min(0).optional()",
    );
    expect(sectionValidation).toContain(
      "export const createSectionSchema = z.strictObject({",
    );
    expect(sectionValidation).toContain(
      "同じ並び順を複数指定することはできません",
    );
    expect(pageSectionActions).toContain(
      "const createPageSectionSchema = z.strictObject({",
    );
    expect(pageSectionActions).toContain(
      "const reorderPageSectionsSchema = z.strictObject({",
    );
  });

  test("form-local sortable arrays disable editing and drag completion while pending", () => {
    const galleryField = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "components",
      "gallery-field",
      "GalleryField.tsx",
    );
    const galleryItemRow = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "components",
      "gallery-field",
      "GalleryItemRow.tsx",
    );
    const locationForm = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "locations",
      "_components",
      "LocationForm.tsx",
    );
    const sharedSortable = readRepoFile(
      "src",
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "components",
      "ui",
      "sortable.tsx",
    );

    expect(galleryField).toContain("const isDisabled = disabled ?? false;");
    expect(galleryField).toContain("if (isDisabled) return;");
    expect(galleryField).toContain("disabled={isDisabled}");
    expect(galleryItemRow).toContain("disabled={disabled}");
    expect(locationForm).toContain("if (isPending) return;");
    expect(locationForm).toContain("<DragHandle disabled={disabled} />");
    expect(sharedSortable).toContain("if (disabled) return;");
  });
});

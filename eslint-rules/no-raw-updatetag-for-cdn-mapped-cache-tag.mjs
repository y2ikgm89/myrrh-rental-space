/**
 * ESLint rule: `no-raw-updatetag-for-cdn-mapped-cache-tag`
 *
 * Fails lint when a source file calls raw `updateTag(CACHE_TAGS.<KEY>)` /
 * `revalidateTag(CACHE_TAGS.<KEY>)` for a key that is CDN-mapped via
 * `NEXTJS_TAG_TO_CDN_TAG` in `src/shared/lib/constants/cdn-cache-tags.ts`.
 *
 * Rationale:
 * `updateTag` / `revalidateTag` invalidate only the Next.js Data Cache. They do
 * NOT purge Cloudflare CDN. For CACHE_TAGS values that map to a CDN tag, the
 * public HTML is stored on Cloudflare with a `Cache-Tag` header — a raw
 * `updateTag` call leaves that HTML stale on the edge.
 *
 * The correct entry point is `invalidateSiteWideCache([CACHE_TAGS.X])` (Server
 * Action) or `invalidateSiteWideCacheFromRouteHandler([CACHE_TAGS.X])` (Route
 * Handler / cron). Both helpers translate Next.js tags → CDN tags via
 * `resolveCdnTag` and enqueue a Cloudflare purge.
 *
 * The mapped-key list is passed via rule options and is kept in sync with the
 * NEXTJS_TAG_TO_CDN_TAG source by a companion architecture test (drift-gate).
 *
 * Note: This rule only inspects the shape `CACHE_TAGS.<KEY>` at the first
 * argument. Dynamic tag values (variables, function calls like
 * `getCacheTag.spaces.detail(...)`) are out of scope — they represent
 * id-keyed sub-tags whose CDN purge is done via per-detail URL, not tag.
 */

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw updateTag/revalidateTag calls that target a CACHE_TAGS value already mapped to a CDN cache tag; route through invalidateSiteWideCache instead so Cloudflare is purged.",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          mappedKeys: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        required: ["mappedKeys"],
        additionalProperties: false,
      },
    ],
    messages: {
      cdnMappedRaw:
        "CACHE_TAGS.{{key}} は NEXTJS_TAG_TO_CDN_TAG に登録されている CDN-mapped タグです。raw {{callee}}() は Next.js Data Cache しか無効化せず Cloudflare CDN 側の HTML が古いままになります。invalidateSiteWideCache([CACHE_TAGS.{{key}}]) (Server Action) / invalidateSiteWideCacheFromRouteHandler([CACHE_TAGS.{{key}}]) (Route Handler / cron) を経由してください。SSoT: src/shared/lib/cache/site-wide.ts / .claude/rules/caching.md",
    },
  },
  create(context) {
    const options = context.options[0];
    const mappedKeys = new Set(
      Array.isArray(options?.mappedKeys) ? options.mappedKeys : [],
    );

    /**
     * Extract "KEY" from a first-argument AST node shaped like `CACHE_TAGS.KEY`.
     * Returns null for any other shape (dynamic tags, string literals, spread,
     * function-call results, etc.).
     */
    function extractCacheTagsKey(arg) {
      if (!arg || arg.type !== "MemberExpression") return null;
      if (arg.computed) return null;
      if (arg.object.type !== "Identifier" || arg.object.name !== "CACHE_TAGS")
        return null;
      if (arg.property.type !== "Identifier") return null;
      return arg.property.name;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const calleeName = node.callee.name;
        if (calleeName !== "updateTag" && calleeName !== "revalidateTag")
          return;
        const firstArg = node.arguments[0];
        const key = extractCacheTagsKey(firstArg);
        if (key === null) return;
        if (!mappedKeys.has(key)) return;
        context.report({
          node,
          messageId: "cdnMappedRaw",
          data: {
            key,
            callee: calleeName,
          },
        });
      },
    };
  },
};

export default rule;

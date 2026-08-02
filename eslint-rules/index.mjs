/**
 * Local ESLint plugin: repo-specific rules that don't fit into a third-party
 * plugin. Rules live in sibling files and are registered by name here.
 *
 * @see eslint.config.mjs — this plugin is imported and its rules referenced
 * under the `local` prefix.
 */

import noRawUpdatetagForCdnMappedCacheTag from "./no-raw-updatetag-for-cdn-mapped-cache-tag.mjs";
import requireTrimmedText from "./require-trimmed-text.mjs";

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: {
    name: "local",
    version: "0.0.1",
  },
  rules: {
    "no-raw-updatetag-for-cdn-mapped-cache-tag":
      noRawUpdatetagForCdnMappedCacheTag,
    "require-trimmed-text": requireTrimmedText,
  },
};

export default plugin;

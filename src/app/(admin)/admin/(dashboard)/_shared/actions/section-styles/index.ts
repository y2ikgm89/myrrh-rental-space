/**
 * Section Styles Server Actions — barrel re-export.
 *
 * This file has NO `"use server"` directive: it only re-exports async
 * functions from sibling files, each of which already declares its own
 * server boundary. Client Components must import via submodule paths
 * (`./queries` / `./mutations`) to avoid Turbopack server-actions
 * bundler conflicts.
 */

export {
  getSectionStyleDetail,
  getSectionStyleList,
  getSectionStyleUsageData,
} from "./queries";

export {
  createSectionStyleAction,
  deleteSectionStyleAction,
  deriveSectionStyleAction,
  updateSectionStyleAction,
} from "./mutations";

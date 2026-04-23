/**
 * Section Styles mutation actions — barrel re-export.
 *
 * This file has NO `"use server"` directive: it only re-exports async
 * mutation functions from sibling files, each of which already declares
 * its own server boundary.
 */

export {
  createSectionStyleAction,
  deleteSectionStyleAction,
  deriveSectionStyleAction,
  updateSectionStyleAction,
} from "./mutations";

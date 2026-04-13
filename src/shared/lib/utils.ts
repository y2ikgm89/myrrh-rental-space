/**
 * 後方互換 re-export
 *
 * FormData ヘルパーは form-data.ts、スラッグ生成は slug.ts に移動済み。
 * 既存の import パスを維持するため re-export する。
 */
export {
  getFormString,
  getFormStringOrNull,
  getFormNumber,
  getFormBoolean,
} from "./form-data";
export { generateSlug } from "./slug";

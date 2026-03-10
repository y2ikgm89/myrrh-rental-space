/**
 * CSS side-effect import declarations
 *
 * TypeScript 6.0 では `noUncheckedSideEffectImports` がデフォルト `true`。
 * side-effect import（`import './file.css'`）に型宣言が必要（TS2882）。
 * このファイルは import/export を含まないスクリプトコンテキストで
 * ambient module declaration として機能する。
 */
declare module "*.css" {}

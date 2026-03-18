/**
 * DOM 環境セットアップ（happy-dom）
 *
 * @testing-library/react 等のコンポーネントテストに必要な
 * グローバル DOM API（document, window 等）を登録する。
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

---
paths:
  - src/app/(public*)/**/*pixi*
  - src/app/(public*)/**/*Pixi*
---

# PixiJS パターンルール

> PixiJS 8.17.1 / WebGL2

## 概要

旧 `effects/pixi/` インフラ（PixiCanvas, PixiCanvasInner 等 7ファイル）は削除済み。
パッケージ（`pixi.js`）は利用可能。使用時はページコンポーネントから直接 import する。

> **詳細リファレンス**: `docs/reference/claude-rules/pixijs-reference.md`

## 直接 import パターン（現行）

```typescript
// OK: useEffect 内で動的 import（SSR 安全）
"use client";
import { useEffect } from "react";

export function PixiEffect() {
  useEffect(() => {
    let destroyed = false;
    const setup = async () => {
      const { Application } = await import("pixi.js");
      const app = new Application();
      await app.init({ backgroundAlpha: 0, preference: "webgl" });
      if (destroyed) { app.destroy(true); return; }
      // 描画処理
    };
    void setup();
    return () => { destroyed = true; };
  }, []);

  return <canvas />;
}
```

## v8 API（v7 との差分）

| v7                                  | v8                                              |
| ----------------------------------- | ----------------------------------------------- |
| `new Application({ ... })`          | `new Application()` + `await app.init({ ... })` |
| `app.view`                          | `app.canvas`                                    |
| `PIXI.` グローバル                  | 名前付き import                                 |
| `app.destroy({ removeView: true })` | `app.destroy(true)`                             |

## 禁止事項

1. **トップレベルの同期 import 禁止** — `await import('pixi.js')` で非同期ロード（SSR クラッシュ防止）
2. **destroyed チェック省略禁止** — 非同期セットアップ後に `if (destroyed) return`
3. **Math.random() 禁止** — 決定的ハッシュを使用
4. **cleanup でのリソース解放必須** — ticker 除去 + フィルター除去 + `destroy()`
5. **v7 API 禁止** — `app.view` → `app.canvas` 等
6. **旧 ExperienceShell / VisualEffectsProvider パターン禁止** — 直接 import のみ

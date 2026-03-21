---
paths:
  - src/app/(public*)/**/*pixi*
  - src/app/(public*)/**/*Pixi*
---

# PixiJS パターンルール

> [PixiJS v8](https://pixijs.com/8.x/guides) / WebGL2

## 依存関係

**現状のリポジトリ既定では `pixi.js` は `package.json` に含めない。**
L4 を使うページを追加する際のみ `bun add pixi.js`（公式ガイドの API に合わせる）。
旧 `effects/pixi/` インフラは削除済み — 復活させない。

## 非同期ロード（SSR 安全）

トップレベルでの同期 `import "pixi.js"` はバンドル／SSR 時に問題になり得るため、**クライアントの `useEffect`（または event ハンドラ）内で動的 `import`** する。

```typescript
"use client";
import { useEffect } from "react";

export function PixiEffect() {
  useEffect(() => {
    let destroyed = false;
    const setup = async () => {
      const { Application } = await import("pixi.js");
      const app = new Application();
      await app.init({ backgroundAlpha: 0, preference: "webgl" });
      if (destroyed) {
        app.destroy(true);
        return;
      }
      // シーン構築 …
    };
    void setup();
    return () => {
      destroyed = true;
    };
  }, []);

  return <canvas />;
}
```

## v8 移行メモ（v7 禁止）

| v7                                  | v8                                |
| ----------------------------------- | --------------------------------- |
| `new Application({ ... })`        | `new Application()` + `await app.init({ ... })` |
| `app.view`                          | `app.canvas`                      |
| `PIXI.*` グローバル前提             | 名前付き ESM import               |

## 禁止事項

1. **トップレベルの同期 `import "pixi.js"`**（Client 境界内でも、可能なら動的 import）
2. **非同期 `init` 後の `destroyed` ガード省略**
3. **`Math.random()` のみによる再現不能なビジュアル**
4. **クリーンアップでの `destroy` / ticker・フィルター解放の省略**
5. **v7 API・旧インフラパターンの混在**

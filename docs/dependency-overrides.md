# Bun dependency overrides

`package.json` の `overrides` は transitive 依存のセキュリティ修正・
再現性確保のための pin 表。追加時は rationale をこの表に 1 行追記する。

| Package                         | Pin               | Rationale                                                           |
| ------------------------------- | ----------------- | ------------------------------------------------------------------- |
| `@grpc/grpc-js`                 | ^1.14.4           | GCP client transitive; protobuf/grpc CVE 回避                       |
| `pg`                            | ^8.22.0           | Prisma `@prisma/adapter-pg` と同一 major の安定版                   |
| `protobufjs`                    | ^8.6.5            | `@grpc/grpc-js` 経由の protobuf 系 CVE 回避                         |
| `minimatch` / `brace-expansion` | ^10.2.5 / ^5.0.7  | glob 系 ReDoS 回避（eslint / tooling 経由）                         |
| `fast-uri`                      | ^3.1.2            | ajv 経由 URI parse の既知修正取り込み                               |
| `postcss`                       | ^8.5.16           | Tailwind v4 / Next 16 toolchain 互換                                |
| `hono` / `@hono/node-server`    | ^4.12.27 / ^2.0.6 | better-auth / tooling transitive の CVE 回避                        |
| `qs`                            | ^6.15.3           | express 系 transitive prototype pollution 回避                      |
| `@tootallnate/once`             | ^3.0.1            | http-proxy-agent transitive                                         |
| `basic-ftp`                     | ^6.0.1            | @google-cloud/storage transitive                                    |
| `flatted`                       | ^3.4.2            | eslint flat config transitive                                       |
| `ip-address`                    | ^10.2.0           | socks-proxy-agent transitive                                        |
| `picomatch`                     | ^4.0.4            | micromatch / tooling transitive                                     |
| `tmp`                           | ^0.2.7            | playwright / tooling の insecure tmp 回避                           |
| `playwright-core`               | ~1.62.1           | `@playwright/test` と lockstep（E2E runner SSoT）                   |
| `uuid`                          | ^11.1.1           | google-auth / tooling transitive                                    |
| `ws`                            | ^8.21.0           | dev tooling WebSocket transitive                                    |
| `happy-dom`                     | ^20.11.0          | bun unit test DOM（jsdom より軽量）。`import from "jsdom"` は未使用 |
| `nanoid`                        | ^3.3.17           | postcss 経由。GHSA-2v37-7h3g-55p8（size 0 で無限ループ）回避        |

Exact pin（`packageManager` / TypeScript 等）は `package.json` トップレベルの
`devDependencies` / `dependencies` が SSoT。overrides は transitive のみ。

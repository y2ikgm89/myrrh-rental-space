# API conventions

Route Handler (`src/app/api/**/route.ts`、および admin surface の
`src/app/(admin)/admin/api/**`) が返すレスポンスの規約。

SSoT は [`src/shared/lib/route-responses.ts`](../src/shared/lib/route-responses.ts)。
この文書はその契約の説明で、値が食い違ったら**コード側が正**。

## ヘルパー

`NextResponse.json` を直接書かず、次の 4 つを使う。

| ヘルパー                                   | 返すもの                               | 既定 status |
| ------------------------------------------ | -------------------------------------- | ----------- |
| `jsonSuccess(data, status?)`               | `data` をそのまま（包まない）          | 200         |
| `jsonError(message, status?)`              | `{ error: message }`                   | 400         |
| `jsonValidationError(zodError, fallback?)` | `{ error: <最初の issue の message> }` | 400         |
| `getRouteErrorStatus(message)`             | status code（number）                  | —           |

成功レスポンスは**包まない**。`jsonSuccess({ ok: true })` は `{"ok":true}` を返す
のであって `{"data":{...}}` ではない。

## status code の切り分け

`checkAdminAuth` / `checkPermission` などが返すエラーメッセージは日本語で、
呼び出し側はそれを HTTP status に変換する必要がある。この変換を各 route で
書き分けると、同じ「権限がありません」が route ごとに 400 になったり 403 に
なったりする。`getRouteErrorStatus()` が一箇所で決める:

| メッセージに含まれる語 | status | 意味                     |
| ---------------------- | ------ | ------------------------ |
| `ログイン`             | 401    | 未認証（session が無い） |
| `権限` / `アクセス権`  | 403    | 認証済みだが権限不足     |
| 上記以外               | 400    | 入力エラーなど           |

**401 と 403 を混ぜない。** 未認証（401）に対してクライアントはログインへ誘導
でき、権限不足（403）に対してはできない。両方 403 で返すと、セッション切れの
利用者が「権限がありません」と言われて手詰まりになる。

この対応は
[`__tests__/unit/lib/route-responses.test.ts`](../__tests__/unit/lib/route-responses.test.ts)
が固定している。メッセージ側の文言を変えるときは、この表と合わせて直すこと。

```ts
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
  jsonValidationError,
} from "@/shared/lib/route-responses";

const auth = await checkAdminAuth();
if (!auth.success) {
  return jsonError(auth.error, getRouteErrorStatus(auth.error));
}

const parsed = schema.safeParse(await request.json());
if (!parsed.success) return jsonValidationError(parsed.error);

return jsonSuccess({ ok: true });
```

## `new Response` を使ってよい場合

JSON ではない成功レスポンス（CSV ダウンロード、redirect、画像、フィード）は
`new Response` / `NextResponse.redirect` を使う。ただし**成功時だけ**で、
エラー時は上のヘルパーに戻る — CSV エンドポイントが失敗したときに
`text/csv` のまま人間向けメッセージを返すと、クライアントはそれをファイルとして
保存してしまう。

## リソースが見つからないとき

存在しない ID に対しては 404 を返す。ただし**推測可能な ID**（連番など）を
受ける route では、認可チェックより前に rate limiter を通す。認可の前に
「存在するかどうか」を答えると、ID を総当たりされたときに列挙に使える。

## 参照

- 実装: [`src/shared/lib/route-responses.ts`](../src/shared/lib/route-responses.ts)
- 変換テーブルのテスト: [`__tests__/unit/lib/route-responses.test.ts`](../__tests__/unit/lib/route-responses.test.ts)

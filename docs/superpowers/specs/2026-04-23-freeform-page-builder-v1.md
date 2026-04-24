# Freeform Page Builder V1 Product Spec

**日付**: 2026-04-23  
**関連設計**: `docs/architecture/freeform-page-builder-design.md`

---

## 1. 目的

この案件で目指すのは、WIX / STUDIO に近い編集体験を持ちながらも、**レンタルスペースサイト運営に必要な範囲へ絞った製品レベルの自由配置 builder** である。

本 spec は「完全汎用 no-code」を目指さない。その代わり、次を確実に満たす。

1. 運用担当者が custom page をノーコードで組める
2. desktop / tablet / mobile の見え方を個別に調整できる
3. 下書き保存、プレビュー、公開が分離されている
4. このプロジェクトの公開サイトに安全に載せられる
5. custom page の runtime に旧 editor との共存レイヤーを持ち込まない

---

## 2. 製品ポジション

### 2.1 何を作るか

- custom page 向けの自由配置サイト builder
- 画像、テキスト、CTA、埋め込み、問い合わせ導線を組める page editor
- 公開サイトと同じ renderer を使う visual CMS

### 2.2 何を作らないか

- Bubble のような業務アプリ no-code
- 任意データベース定義や任意 workflow 構築
- 任意 HTML / 任意 JavaScript 実行
- マーケットプレイス型の plugin platform

### 2.3 製品レベルの定義

この案件での「製品レベル」は次を満たす状態を指す。

- 非エンジニアが custom page を自力で作成・更新できる
- 下書きと公開を安全に切り分けられる
- レイアウト崩れや危険な入力を UI / schema で抑制できる
- E2E を含む最低限の回帰検知がある
- 既存 public site の設計原則と衝突しない

---

## 3. 対象ユーザー

### 3.1 primary user

- 管理画面を使うサイト運用担当
- デザイナーではないが、見出し・画像・CTA・並びを調整したい人

### 3.2 secondary user

- 実装担当者
- テンプレートや default component を整備する人

### 3.3 非対象

- 一般ユーザー向けページ作成 SaaS の外部利用者
- ノーコードで業務アプリを組みたい利用者

---

## 4. V1 スコープ

### 4.1 対象ページ

- custom page のみ
- 既存 system page は対象外
- custom page は builder を唯一の編集面にする

### 4.2 v1 必須機能

- custom page の新規作成時に freeform state が自動作成される
- `/admin/pages/[slug]/builder` で編集できる
- layer tree を持つ
- canvas 上で選択、移動、リサイズできる
- 右 inspector で content / layout / style を編集できる
- desktop / tablet / mobile の 3 breakpoint を切り替えられる
- autosave がある
- preview がある
- publish がある
- 公開ページが published document を描画する

### 4.3 v1 の非機能要件

- 初回 load で builder shell が 3 秒以内に操作可能になる
- 一般的なページサイズで drag 操作中の視覚更新が破綻しない
- 直近 autosave が失敗した場合に save status が明示される
- document schema migration を持つ

---

## 5. Node サポート範囲

### 5.1 V1 で実装する node

| Node      | 用途             | V1 対応内容                            |
| --------- | ---------------- | -------------------------------------- |
| `root`    | ページルート     | 1 page に 1 つ                         |
| `frame`   | 自由配置コンテナ | background, border, radius, padding    |
| `stack`   | 縦横 auto layout | gap, align, justify, wrap              |
| `text`    | 見出し / 本文    | plain text + link + basic typography   |
| `image`   | 単体画像         | media picker, alt, object-fit          |
| `button`  | CTA              | label, url, variant, icon optional     |
| `divider` | 区切り線         | thickness, color, width                |
| `spacer`  | 余白             | fixed height / width                   |
| `embed`   | 安全な埋め込み   | YouTube, Google Maps, Instagram だけ   |
| `form`    | 問い合わせ導線   | 既存 contact / inquiry flow を埋め込む |

### 5.2 V1.5 以降で追加候補

- `grid`
- `gallery`
- `testimonial`
- `card-list`
- `reservation-widget`
- `faq`

### 5.3 V1 でやらない node

- arbitrary HTML
- arbitrary script
- custom React component upload
- external npm component

---

## 6. 編集体験

### 6.1 画面構成

- 左: Pages / Layers / Assets / Insert
- 上: device switch / zoom / undo / redo / save status / preview / publish
- 中央: canvas
- 右: Inspector

### 6.2 選択と操作

- click: 単一選択
- shift+click: 複数選択
- drag: 移動
- handle drag: リサイズ
- alt+drag: 複製
- delete / backspace: 削除
- cmd/ctrl+z: undo
- shift+cmd/ctrl+z: redo
- arrow key: 1px 移動
- shift+arrow: 10px 移動

### 6.3 Layer panel

- tree 表示
- drag で並び替え
- lock / hide toggle
- rename
- parent-child 関係の視覚表示

### 6.4 Inspector

- Content tab: text, url, alt, labels
- Layout tab: x, y, width, height, align, gap
- Style tab: color, background, border, radius, shadow, opacity
- Responsive tab: breakpoint override の有無

### 6.5 Save status

- `Saved`
- `Saving...`
- `Unsaved changes`
- `Save failed`

失敗時は toast だけでなく toolbar 上にも状態を残す。

---

## 7. レスポンシブ仕様

### 7.1 breakpoints

- desktop: 1280
- tablet: 768
- mobile: 390

### 7.2 継承ルール

- desktop が base
- tablet は desktop から継承
- mobile は tablet から継承
- override した値だけ保存する

### 7.3 V1 で許可する編集

- node の表示 / 非表示
- x / y / width / height
- gap, padding, align
- typography size
- image crop / fit

### 7.4 V1 で禁止する編集

- breakpoint ごとの node tree 分岐
- node type 自体の差し替え
- 同一 node の arbitrary script 差し替え

---

## 8. Draft / Preview / Publish

### 8.1 draft

- builder が編集中に参照する document
- autosave 対象
- 公開ページからは見えない

### 8.2 preview

- preview route は draft を表示できる
- builder 内 preview も draft を表示する
- preview には noindex を付ける

### 8.3 publish

- publish 実行時に draft を published へコピーする
- custom page の公開ページは published のみ描画する
- publish 時に revision snapshot を作る

### 8.4 restore

V1 では「revision 一覧表示」は必須でないが、publish snapshot の保存は先に実装する。UI 復元は V2 で良い。

### 8.5 競合制御

- autosave / manual save / publish / revision restore は `draftVersion` compare-and-swap を通す
- stale tab からの更新は `CONFLICT` で拒否する
- conflict 発生後の builder は read only にし、`最新を読み込む` で server state を再取得する
- V1 では tab 間 merge は行わない

---

## 9. 既存機能との統合

### 9.1 media

- 画像は既存 media 管理を再利用する
- node には `mediaId` を保存し、render 時に URL を解決する

### 9.2 form

- `form` node は既存 inquiry / contact flow を利用する
- freeform builder が form schema 自体を自由生成することはしない

### 9.3 SEO

- freeform page でも既存 page SEO フィールドは引き続き使用する
- page 単位の title / description / ogp は `Page` 側に残してよい
- document 内の `seo` は将来の editor-local draft 用予約領域として扱う

### 9.4 navigation

- header / footer / global nav は freeform builder 管理対象に入れない
- custom page の本文領域だけを builder 対象にする

---

## 10. セキュリティ境界

### 10.1 入力

- 全 document を Zod schema で検証
- link URL は safe URL 制約を使う
- embed provider は allowlist 制

### 10.2 禁止事項

- raw HTML 保存
- inline script
- event handler 文字列保存
- 任意 CSS text 保存

### 10.3 publish

- publish action は権限確認と audit log を通す
- 破損 document は publish 不可

---

## 11. 公開 renderer 要件

### 11.1 原則

- admin, preview, public で同一 renderer を使う
- admin 専用 overlay は renderer 外で実装する

### 11.2 SSR

- public renderer は SSR 可能であること
- 編集専用 state に依存しないこと

### 11.3 style

- Tailwind class の自由入力ではなく semantic style payload を解決する
- public site のトークン体系と整合する

---

## 12. 受け入れ条件

### 12.1 作成

- 管理者が custom page を新規作成すると freeform state が自動で用意される
- 初期 document に空の root と最小 frame が入る

### 12.2 編集

- text, image, button, frame を追加できる
- node を移動、サイズ変更、複製、削除できる
- layers から選択できる
- inspector で主要プロパティを編集できる

### 12.3 レスポンシブ

- desktop / tablet / mobile を切り替えられる
- mobile だけ width を変えても desktop に影響しない

### 12.4 保存

- 変更後、数秒以内に autosave される
- save failure が UI で分かる
- stale tab で保存すると conflict が表示され、reload まで更新系操作が止まる

### 12.5 公開

- preview では draft が表示される
- publish 後、public page に反映される
- publish 前の draft は public に漏れない

### 12.6 安全性

- 不正 URL, 不正 embed provider, 破損 document を保存または公開できない

---

## 13. 非採用案

### 13.1 `Section` 拡張案

不採用。既存 CMS と freeform builder の責務が衝突する。

### 13.4 custom page の dual-mode 共存案

不採用。リリース前に clean-break できるなら、custom page だけでも旧 editor と新 builder を長期共存させる理由がない。

### 13.2 完全汎用 no-code 案

不採用。サイト builder を超える要求が増え、期間と保守コストがこの案件に見合わない。

### 13.3 iframe 専用 canvas 案

不採用。管理 UI と renderer の座標同期が複雑になり、操作性が落ちる。preview は iframe でもよいが、editor canvas は同一 DOM 上の overlay が望ましい。

---

## 14. 成功指標

- custom page の新規作成から公開まで、エンジニア介入なしで完結できる
- 既存 `sections` editor を触らずに freeform page を運用開始できる
- 主要ノードでレイアウト崩れや publish 漏れが発生しない
- v1 完了時点で「固定ページ制作の大半は builder で足りる」と判断できる

---

## 15. 次段階

v1 完了後、次を評価する。

- `grid` node
- revision restore UI
- reusable component / section preset
- importer: `sections -> freeform`
- 既存 custom page の段階移行

# Cloudflare ゾーン設定（myrrh-jp.com）

**設定の SSoT は Cloudflare ダッシュボードで、このファイルではない。** ここに書くのは
ダッシュボードが持てないもの — **なぜその設定があるのか**と、**まだ効いているかの
確かめ方**だけ。値を写すと必ずずれるので写さない。

ゾーンは **Free プラン**。managed WAF ruleset は使えず、custom rules 5 本 /
rate limiting rule 1 本が上限。

## WAF: `block-vulnerability-scanner-paths`

`.php` / `.env` / `/wp-` / `phpinfo` / `.git` / `.aws` / `.sql` / `/vendor/` を
パスに含むリクエストを **Block**（エッジで 403。origin に届かない）。

### なぜ

**Cloud Run の費用対策。** cron を専用サービスへ分離した後（`docs/superpowers/plans/2026-08-27-cron-surface-separation.md`）、
public を起こしているリクエストを数えたら、**95% が人間ではなかった**。

実測（2026-08-27 17:30Z 〜 6.5 時間、Cloud Run のリクエストログ）:

| 種別                  | 件数 | 割合 |
| --------------------- | ---- | ---- |
| 攻撃 / スキャン       | 252  | 62%  |
| bot / crawler（後述） | 135  | 33%  |
| 実ユーザー等          | 16   | 4%   |
| uptime probe          | 1    | 0%   |

public は `cpu_idle = false`（インスタンスが存在する時間だけ課金）なので、
**スキャナーがインスタンスを起こすたびに課金が発生していた。**

### 安全性の根拠

投入前に確認した。**これらの部分文字列を含むルートは 1 つも無い**:

```bash
for pat in ".php" ".env" "/wp-" "phpinfo" ".git" ".aws" ".sql" "/vendor/"; do
  find src/app -type d | grep -cF "$pat"   # → 全て 0
  find public -type f | grep -cF "$pat"    # → 全て 0
done
```

Next.js アプリはこれらのパスを返せない。ブロックしても機能に影響しない。

### 効いているかの確かめ方

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://rental-space.myrrh-jp.com/mailer/.env        # 403
curl -s -o /dev/null -w '%{http_code}\n' https://rental-space.myrrh-jp.com/wp-admin/phpinfo.php # 403
curl -s -o /dev/null -w '%{http_code}\n' https://rental-space.myrrh-jp.com/                     # 200
curl -s -o /dev/null -w '%{http_code}\n' https://rental-space.myrrh-jp.com/spaces               # 200
```

**ダッシュボードの Events カラムは当てにならない。** Free プランでは 0 のまま
更新されないことがある（2026-08-28 に実確認: 403 が返っているのに Events は 0）。
判定は上の curl で行う。

## やらないこと

### YandexBot を User-Agent で遮断しない

**あの UA は詐称されている。** 2026-08-27 の実測で、YandexBot を名乗る 136 件のうち
**131 件が `.env` や `.php` を探していた**。本物の検索クローラーはそんなことをしない。

パス遮断で既に止まっているので、UA ルールを足す必要はない。足すと本物の Yandex を
巻き添えにするだけで、得るものが無い。

### キャッシュヒット率の低さを「設定ミス」と誤診しない

Cache Rule `public-pages-cacheable`（`/admin` `/api` `/reservation` `/mypage` を
除外して HTML をキャッシュ可能にする）は正しく Active。

それでもヒット率が 1% 前後なのは、**スキャナーが毎回違うパスを叩くのでキャッシュが
原理的に効かない**ため。設定をいじっても改善しない。実ユーザーのトラフィックが
少ないうちは、この数字を健全性の指標に使わないこと。

## 未設定のまま残しているもの

| 設定               | 状態   | 理由                                                                               |
| ------------------ | ------ | ---------------------------------------------------------------------------------- |
| Bot fight mode     | OFF    | Free では挙動が粗く、実ユーザーに JS チャレンジが入る                              |
| Block AI bots      | off    | 現時点で害が観測されていない                                                       |
| AI Labyrinth       | OFF    | 同上                                                                               |
| rate limiting rule | 未使用 | 送信元 IP 別の分布を Cloudflare 側で測れていない（origin から見えるのはエッジ IP） |

custom rules は 5 本中 1 本使用。**追加は実測してから。** 今回のルールで大半が
止まったので、次に足すべきものは「残ったノイズを数えてから」決める。

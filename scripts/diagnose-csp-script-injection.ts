/**
 * CSP eval ブロックの原因 (Cloudflare 自動注入機能) を機械的に特定する診断スクリプト
 *
 * 本プロジェクトの本番 CSP は `script-src 'self' 'nonce-…' 'strict-dynamic'`
 * （`unsafe-eval` なし）で運用しているため、`Refused to evaluate string as JavaScript`
 * は外部注入スクリプトしか発生源になり得ない。
 * Cloudflare の自動注入機能 (Rocket Loader / Email Obfuscation / Bot Fight Mode 等) が
 * 候補なので、Zone:Read 権限で全 toggle 状態を読み取り、CSP eval を必要とする feature が
 * 有効かを report する。
 *
 * 使用方法:
 *   bun scripts/diagnose-csp-script-injection.ts
 *
 * 前提:
 *   .env.local に以下が設定されていること:
 *     - CLOUDFLARE_ZONE_ID  (本番の Zone ID, 32-hex)
 *     - CLOUDFLARE_API_TOKEN (最低 Zone:Read 権限)
 *
 * 安全性:
 *   - 本スクリプトは GET のみ。zone 設定は一切変更しない。
 *   - 実際の OFF 操作は Cloudflare Dashboard 経由 (blast radius 配慮)。
 *
 * 公式 API リファレンス:
 *   - Zone Settings: https://developers.cloudflare.com/api/operations/zone-settings-get-all-zone-settings
 *   - Bot Management: https://developers.cloudflare.com/api/operations/bot-management-for-a-zone-get-config
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} が設定されていません (.env.local)`);
    process.exit(1);
  }
  return value;
}

const zoneId = requireEnv("CLOUDFLARE_ZONE_ID");
const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");

if (!/^[a-f0-9]{32}$/i.test(zoneId)) {
  console.error("❌ CLOUDFLARE_ZONE_ID の形式不正 (32-hex 必須)");
  process.exit(1);
}

interface ZoneSetting {
  id: string;
  value: string | boolean | number | Record<string, unknown> | null;
  editable?: boolean;
  modified_on?: string | null;
}

interface ZoneSettingsResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: ZoneSetting[];
}

interface BotManagementResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: {
    fight_mode?: boolean;
    sbfm_definitely_automated?: string;
    sbfm_likely_automated?: string;
    sbfm_verified_bots?: string;
    sbfm_static_resource_protection?: boolean;
    optimize_wordpress?: boolean;
    enable_js?: boolean;
    auto_update_model?: boolean;
    using_latest_model?: boolean;
    suppress_session_score?: boolean;
  };
}

async function cf<T>(path: string): Promise<T> {
  const url = new URL(path, "https://api.cloudflare.com");
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiToken}` },
    signal: AbortSignal.timeout(10000),
  });
  const json: unknown = await response.json();
  if (typeof json !== "object" || json === null) {
    throw new Error(`Invalid response: ${String(json)}`);
  }
  return json as T;
}

const SUSPECT_SETTING_IDS = new Set([
  // 確実に eval を要求する代表格 (公式 doc 明言)
  "rocket_loader",
  // eval は不要だが <script> 注入で CSP nonce 配信に影響しうる
  "email_obfuscation",
  "server_side_exclude",
  // 画像最適化系。eval とは無関係だが注入を伴うので参考表示
  "mirage",
]);

interface DiagnosisRow {
  feature: string;
  state: string;
  evalRisk: "HIGH" | "LOW" | "NONE" | "UNKNOWN";
  action: string;
}

function classifyZoneSetting(setting: ZoneSetting): DiagnosisRow | null {
  if (!SUSPECT_SETTING_IDS.has(setting.id)) return null;
  const state =
    typeof setting.value === "string" ? setting.value : String(setting.value);
  switch (setting.id) {
    case "rocket_loader":
      return {
        feature: "Rocket Loader",
        state,
        evalRisk: state === "on" ? "HIGH" : "NONE",
        action:
          state === "on"
            ? "Dashboard → Speed → Optimization → Content Optimization → Rocket Loader を OFF"
            : "(既に OFF)",
      };
    case "email_obfuscation":
      return {
        feature: "Email Obfuscation",
        state,
        evalRisk: state === "on" ? "LOW" : "NONE",
        action:
          state === "on"
            ? "通常 eval 不要だが /cdn-cgi/scripts/.../email-decode.min.js が strict-dynamic 下で動かない場合のみ Scrape Shield で OFF"
            : "(既に OFF)",
      };
    case "server_side_exclude":
      return {
        feature: "Server Side Excludes",
        state,
        evalRisk: "NONE",
        action: "(eval とは無関係。参考表示)",
      };
    case "mirage":
      return {
        feature: "Mirage",
        state,
        evalRisk: "NONE",
        action: "(eval とは無関係。参考表示)",
      };
    default:
      return null;
  }
}

async function main(): Promise<void> {
  console.log("🔍 CSP eval ブロック原因診断 (Cloudflare zone 設定スキャン)");
  console.log(`   Zone ID: ${zoneId.slice(0, 8)}…${zoneId.slice(-4)}`);

  const settings = await cf<ZoneSettingsResponse>(
    `/client/v4/zones/${encodeURIComponent(zoneId)}/settings`,
  );

  if (!settings.success || !settings.result) {
    console.error("❌ Zone Settings API 呼び出し失敗:", settings.errors);
    process.exit(1);
  }

  const rows: DiagnosisRow[] = [];
  for (const s of settings.result) {
    const row = classifyZoneSetting(s);
    if (row) rows.push(row);
  }

  console.log("\n=== Zone Settings (CSP に影響しうる toggle) ===");
  console.table(rows);

  console.log("\n=== Bot Management ===");
  const botMgmt = await cf<BotManagementResponse>(
    `/client/v4/zones/${encodeURIComponent(zoneId)}/bot_management`,
  );
  if (!botMgmt.success) {
    console.warn(
      "⚠️  Bot Management API 取得失敗 (Free plan は本 endpoint 自体が利用不可な場合あり)。",
    );
    console.warn("   errors:", JSON.stringify(botMgmt.errors));
  } else if (botMgmt.result) {
    const r = botMgmt.result;
    console.table([
      {
        feature: "Bot Fight Mode (Free/Pro)",
        state: r.fight_mode ? "on" : "off",
        evalRisk: r.fight_mode ? "LOW (nonce 自動付与あり)" : "NONE",
        action: r.fight_mode
          ? "Cloudflare は CSP nonce を自動転写するため通常問題なし。Dashboard → Security → Bots で OFF 可"
          : "(既に OFF)",
      },
      {
        feature: "JavaScript Detections (enable_js)",
        state: r.enable_js ? "on" : "off",
        evalRisk: r.enable_js
          ? "LOW (/cdn-cgi/challenge-platform/...)"
          : "NONE",
        action: r.enable_js
          ? "Cloudflare は CSP nonce を自動転写するため通常問題なし"
          : "(既に OFF)",
      },
    ]);
  }

  const highRisk = rows.filter((r) => r.evalRisk === "HIGH");
  console.log("\n=== 診断結果 ===");
  if (highRisk.length === 0) {
    console.log(
      "✓ eval を必須とする feature は見つかりませんでした。Browser DevTools の Network タブで",
    );
    console.log(
      "  ブロックされた <random>.js の フル URL (host + path) を確認してください。",
    );
    console.log(
      "  例: /cdn-cgi/scripts/<hex>/cloudflare-static/rocket-loader.min.js",
    );
    console.log("  例: /cdn-cgi/bm/cv/<hex>/api.js");
    console.log(
      "  → URL を共有してください。Page Rule / Configuration Rule で個別 OFF 可能です。",
    );
  } else {
    console.log("🔴 eval 必須の feature が ON:");
    for (const row of highRisk) {
      console.log(`   - ${row.feature}: ${row.action}`);
    }
    console.log("\n公式 SSoT:");
    console.log(
      "   https://developers.cloudflare.com/speed/optimization/content/rocket-loader/",
    );
    console.log(
      "   (Note: CSP がある場合 Rocket Loader 動作には unsafe-eval 追加が必要。",
    );
    console.log(
      "    本プロジェクトの CSP SSoT は unsafe-eval 禁止のため Rocket Loader OFF が正)",
    );
  }
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

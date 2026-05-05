#!/usr/bin/env bash
# post-deploy smoke test runner — Cloud Run 主要 endpoint の HTTP status を一括検証
#
# 使い方:
#   bash .claude/skills/post-deploy-smoke/smoke.sh --url https://myrrh-rental-space-...
#   SMOKE_BASE_URL=https://... bash .claude/skills/post-deploy-smoke/smoke.sh
#
# 終了コード:
#   0  全 endpoint 期待値通り
#   1  1 つ以上が期待値外
#   2  引数不正 / curl 不在
set -euo pipefail

# ---- arg parsing ----
BASE_URL="${SMOKE_BASE_URL:-}"
JSON_OUTPUT=false
TIMEOUT_SECONDS=10

while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      BASE_URL="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --help|-h)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "ERR: unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$BASE_URL" ]; then
  echo "ERR: --url <https://...> または SMOKE_BASE_URL を指定してください" >&2
  exit 2
fi

# trailing slash 除去
BASE_URL="${BASE_URL%/}"

# scheme 検証（HTTPS 強制）
case "$BASE_URL" in
  https://*) ;;
  *)
    echo "ERR: HTTPS URL を指定してください: $BASE_URL" >&2
    exit 2
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  echo "ERR: curl が見つかりません" >&2
  exit 2
fi

# ---- target table ----
# 形式: "category|path|expected_codes(comma-sep)"
TARGETS=(
  "probe|/api/live|200"
  "probe|/api/health|200,503"
  "auth|/api/auth/get-session|200"
  "auth|/api/customer-auth/get-session|200"
  "public|/|200"
  "public|/spaces|200"
  "public|/events|200"
  "public|/posts|200"
  "public|/news|200"
  "public|/faq|200"
  "public|/access|200"
  "public|/contact|200"
  "seo|/robots.txt|200"
  "seo|/sitemap.xml|200"
  "seo|/feed.xml|200"
)

# ---- runner ----
PASS=0
FAIL=0
WARN=0
RESULTS=()

probe_one() {
  local category="$1"
  local path="$2"
  local expected_csv="$3"
  local url="${BASE_URL}${path}"

  # -s: silent, -o /dev/null: drop body, -w: print status, -m: timeout, -L: follow redirects
  # curl は失敗時も "%{http_code}" として "000" を出力するため、echo フォールバックと
  # 連結すると "000000" のような重複になる。subshell 戻り値が空のときだけ "000" にセット
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -m "$TIMEOUT_SECONDS" -L "$url" 2>/dev/null) || true
  [ -z "$code" ] && code="000"

  local matched=false
  IFS=',' read -ra expected_arr <<< "$expected_csv"
  for exp in "${expected_arr[@]}"; do
    if [ "$code" = "$exp" ]; then
      matched=true
      break
    fi
  done

  local status_label
  if [ "$matched" = true ]; then
    if [ "$code" = "503" ] && [ "$path" = "/api/health" ]; then
      # 503 健康チェックは DB 一時断警告として WARN 扱い（live が 200 なら全体 PASS 維持）
      status_label="WARN"
      WARN=$((WARN + 1))
    else
      status_label="PASS"
      PASS=$((PASS + 1))
    fi
  else
    status_label="FAIL"
    FAIL=$((FAIL + 1))
  fi

  RESULTS+=("${status_label}|${category}|${path}|${code}|${expected_csv}")
}

for target in "${TARGETS[@]}"; do
  IFS='|' read -r category path expected_csv <<< "$target"
  probe_one "$category" "$path" "$expected_csv"
done

# ---- output ----
if [ "$JSON_OUTPUT" = true ]; then
  printf '{"baseUrl":"%s","summary":{"pass":%d,"warn":%d,"fail":%d},"results":[' \
    "$BASE_URL" "$PASS" "$WARN" "$FAIL"
  first=true
  for row in "${RESULTS[@]}"; do
    IFS='|' read -r status category path code expected <<< "$row"
    [ "$first" = false ] && printf ','
    first=false
    printf '{"status":"%s","category":"%s","path":"%s","code":"%s","expected":"%s"}' \
      "$status" "$category" "$path" "$code" "$expected"
  done
  printf ']}\n'
else
  echo "Smoke test against: ${BASE_URL}"
  echo "Timeout per request: ${TIMEOUT_SECONDS}s"
  echo ""
  printf "%-6s %-8s %-40s %-6s %-12s\n" "STATUS" "CATEGORY" "PATH" "CODE" "EXPECTED"
  printf "%-6s %-8s %-40s %-6s %-12s\n" "------" "--------" "----------------------------------------" "------" "------------"
  for row in "${RESULTS[@]}"; do
    IFS='|' read -r status category path code expected <<< "$row"
    printf "%-6s %-8s %-40s %-6s %-12s\n" "$status" "$category" "$path" "$code" "$expected"
  done
  echo ""
  echo "Summary: PASS=${PASS}  WARN=${WARN}  FAIL=${FAIL}  (total=${#TARGETS[@]})"
fi

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

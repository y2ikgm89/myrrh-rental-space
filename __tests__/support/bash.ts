/**
 * テストから bash を起動するときの実行ファイル解決。
 *
 * ## なぜ `Bun.which("bash")` ではだめか
 *
 * Windows + WSL のマシンでは `Bun.which("bash")` が
 * **`C:\WINDOWS\system32\bash.exe`（WSL のランチャー）** を返す。`C:\Windows\System32`
 * は常に PATH にあり、Git の `bin` より前に来ることが多いので、これは例外的な構成では
 * なく既定の結果になる。
 *
 * この bash を Bun から spawn すると、**代入内のコマンド置換が黙って空になる**。
 * 実測（`bash.exe -c` を Bun.spawnSync で起動）:
 *
 * | script                          | 結果       |
 * | ------------------------------- | ---------- |
 * | `mktemp`                        | パスが出る |
 * | `x="$(echo hi)"; echo "[$x]"`   | `[]`       |
 * | `x="$(mktemp)"; echo "[$x]"`    | `[]`       |
 * | `echo "[$(echo hi)]"`（インライン） | `[hi]`     |
 *
 * つまり `mktemp` 固有ではなく置換一般の破綻で、しかも **exit code は 0**。呼び出し側は
 * 空変数を掴んだまま先へ進み、`cat > ""` のような**原因と無関係なエラー**を見ることになる。
 * Git Bash（`C:/Program Files/Git/...`）では上記すべてが正しく動く。
 *
 * CI の ubuntu runner と lefthook（Git Bash 経由）では踏まないため、
 * **手元の PowerShell から回したときだけ赤くなる**という一番誤診しやすい形になる。
 *
 * ## 何をするか
 *
 * win32 では Git Bash だけを受け付け、無ければ**理由つきで throw する**。
 * WSL の bash に黙ってフォールバックしない — 静かに壊れるより止まるほうがよい。
 */

import { existsSync } from "node:fs";

/** Git for Windows の bash。`usr/bin` 側が coreutils と同居する本体。 */
const WINDOWS_BASH_CANDIDATES = [
  "C:/Program Files/Git/usr/bin/bash.exe",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files (x86)/Git/bin/bash.exe",
] as const;

export function bashExecutable(): string {
  if (process.platform === "win32") {
    for (const candidate of WINDOWS_BASH_CANDIDATES) {
      if (existsSync(candidate)) return candidate;
    }
    throw new Error(
      "Windows で Git Bash が見つかりません。" +
        `探した場所: ${WINDOWS_BASH_CANDIDATES.join(", ")}。` +
        "PATH 上の bash は WSL のランチャーであることが多く、コマンド置換が" +
        "無言で空になるため使いません（この module の冒頭 JSDoc に実測）。" +
        "Git for Windows を入れるか、上の候補にパスを追加してください。",
    );
  }

  const onPath = Bun.which("bash");
  if (!onPath) {
    throw new Error(
      "bash が見つからないためテストを実行できません。" +
        "この検査は silent skip させない（GitHub Actions の ubuntu runner には bash がある）。",
    );
  }
  return onPath;
}

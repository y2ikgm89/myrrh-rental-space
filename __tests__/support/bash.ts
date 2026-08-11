/**
 * テストから bash を起動するときの実行ファイル解決。
 *
 * ## 解決できない bash がある
 *
 * Windows + WSL のマシンでは `Bun.which("bash")` が
 * **`C:\WINDOWS\system32\bash.exe`（WSL のランチャー）** を返すことがある。
 * `C:\Windows\System32` は常に PATH にあり Git の `bin` より前に来ることが多いので、
 * これは例外的な構成ではなく既定の結果になる。
 *
 * この bash を Bun から spawn すると、**代入内のコマンド置換が黙って空になる**。
 * 実測（`bash.exe -c` を `Bun.spawnSync` で起動）:
 *
 * | script                          | WSL bash | Git Bash |
 * | ------------------------------- | -------- | -------- |
 * | `mktemp`                        | パスが出る | パスが出る |
 * | `x="$(echo hi)"; echo "[$x]"`   | `[]`     | `[hi]`   |
 * | `echo "[$(echo hi)]"`（インライン） | `[hi]`   | `[hi]`   |
 *
 * `mktemp` 固有ではなく置換一般の破綻で、しかも **exit code は 0**。呼び出し側は
 * 空変数を掴んだまま先へ進み、`cat > ""` のような**原因と無関係なエラー**を見ることになる。
 *
 * ## だからパスではなく振る舞いで選ぶ
 *
 * 最初の実装は Git Bash の既定インストール先 3 つを直書きして、そこに無ければ throw
 * していた。**これは Git for Windows をユーザー領域や Scoop、任意のディレクトリへ
 * 入れている環境を壊す** — PATH には動く bash があるのに、既知パスに無いという理由だけで
 * 落ちる（#2114 のレビュー指摘）。
 *
 * 代わりに、候補を実際に起動して**依存している性質そのもの**を確かめる。
 * `x="$(printf ok)"` が `ok` を返せば採用、返さなければ次の候補へ。これなら
 * インストール先を問わず動き、WSL のランチャーは名前ではなく挙動で外れる。
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * 依存している性質だけを試すスクリプト。**インライン展開ではなく代入**にすること
 * （WSL bash が壊すのは代入側で、インラインは通ってしまう）。
 */
const PROBE_SCRIPT = 'x="$(printf ok)"; printf %s "$x"';

/** Git for Windows の既定インストール先。PATH と `git` から辿れなかったときの保険。 */
const WINDOWS_GIT_BASH_FALLBACKS = [
  "C:/Program Files/Git/usr/bin/bash.exe",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files (x86)/Git/bin/bash.exe",
] as const;

function isUsable(candidate: string): boolean {
  try {
    const result = Bun.spawnSync({ cmd: [candidate, "-c", PROBE_SCRIPT] });
    return (
      result.exitCode === 0 &&
      new TextDecoder().decode(result.stdout).trim() === "ok"
    );
  } catch {
    return false;
  }
}

function candidatePaths(): string[] {
  const found: string[] = [];
  const add = (path: string | null | undefined): void => {
    if (path && !found.includes(path)) found.push(path);
  };

  add(Bun.which("bash"));

  if (process.platform === "win32") {
    // `git` の隣を辿る。既定以外（ユーザー領域 / Scoop / 任意のディレクトリ）へ
    // 入れていても、git が PATH にあれば bash も同じツリーに居る。
    const git = Bun.which("git");
    if (git) {
      const gitDir = dirname(git);
      for (const relative of [
        ["..", "bin"],
        ["..", "usr", "bin"],
        ["..", "..", "bin"],
        ["..", "..", "usr", "bin"],
      ]) {
        add(resolve(gitDir, ...relative, "bash.exe"));
      }
    }
    for (const fallback of WINDOWS_GIT_BASH_FALLBACKS) add(fallback);
  }

  return found.filter((path) => existsSync(path));
}

let resolved: string | undefined;

export function bashExecutable(): string {
  if (resolved !== undefined) return resolved;

  const candidates = candidatePaths();
  for (const candidate of candidates) {
    if (isUsable(candidate)) {
      resolved = candidate;
      return candidate;
    }
  }

  throw new Error(
    "コマンド置換が動く bash が見つからないためテストを実行できません。" +
      `試した候補: ${candidates.length > 0 ? candidates.join(", ") : "（候補なし）"}。` +
      "Windows では PATH 上の bash が WSL のランチャーで、" +
      '`x="$(printf ok)"` が無言で空になることがあります' +
      "（この module の冒頭 JSDoc に実測）。Git for Windows を入れるか、" +
      "その bash を PATH に載せてください。" +
      "この検査は silent skip させない（CI の ubuntu runner には bash がある）。",
  );
}

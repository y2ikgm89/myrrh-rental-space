/**
 * ダッシュボード各セクションのデータ取得を Result に包む。
 * try/catch 内で JSX を組み立てると eslint-react error-boundaries に弾かれるため、
 * 失敗は { ok: false } に落として呼び出し側でフォールバック UI を返す。
 */
export async function settleDashboardLoad<T>(
  load: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch {
    return { ok: false };
  }
}

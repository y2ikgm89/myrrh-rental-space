/**
 * URL マッチャー設定
 *
 * @description AutoLinkPlugin用のURLマッチャーとURL検証関数
 */

// =============================================================================
// URL Matchers
// =============================================================================

const URL_MATCHER =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

const EMAIL_MATCHER =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

function createMatcher(regex: RegExp, urlTransform: (match: string) => string) {
  return (text: string) => {
    const match = regex.exec(text);
    if (match === null) return null;
    const fullMatch = match[0];
    return {
      index: match.index,
      length: fullMatch.length,
      text: fullMatch,
      url: urlTransform(fullMatch),
    };
  };
}

export const MATCHERS = [
  createMatcher(URL_MATCHER, (m) =>
    m.startsWith("http") ? m : `https://${m}`,
  ),
  createMatcher(EMAIL_MATCHER, (m) => `mailto:${m}`),
];

// =============================================================================
// URL Validation
// =============================================================================

/**
 * URLの妥当性を検証する
 *
 * @param url - 検証対象のURL
 * @returns 有効なURLの場合true
 */
export function validateUrl(url: string): boolean {
  if (!url) return false;

  // mailto: と tel: は許可
  if (url.startsWith("mailto:") || url.startsWith("tel:")) {
    return true;
  }

  // 相対パスは許可
  if (url.startsWith("/") || url.startsWith("#")) {
    return true;
  }

  // URL形式のチェック
  try {
    new URL(url);
    return true;
  } catch {
    // http:// や https:// が付いていない場合に補完して再チェック
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      try {
        new URL(`https://${url}`);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

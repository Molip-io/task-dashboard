const OWNER_SPLIT = /[,\/\n·・]+/;

/**
 * owners 배열 또는 owner 문자열에서 담당자 목록을 반환한다.
 * owners 배열이 있으면 우선 사용하고, 없으면 owner 문자열을 구분자로 분리한다.
 */
export function normalizeOwners(owners?: string[], owner?: string): string[] {
  if (owners && owners.length > 0) {
    return owners.map((o) => o.trim()).filter(Boolean);
  }
  if (!owner || !owner.trim()) return [];
  return owner.split(OWNER_SPLIT).map((o) => o.trim()).filter(Boolean);
}

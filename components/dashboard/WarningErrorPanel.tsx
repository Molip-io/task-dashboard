interface Props {
  errors?: string[];
  warnings?: string[];
}

export function WarningErrorPanel({ errors = [], warnings = [] }: Props) {
  if (!errors.length && !warnings.length) return null;

  return (
    <div className="mt-4 space-y-2">
      {errors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">
            ⚠ 오류 ({errors.length})
          </p>
          <ul className="space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-red-700">{e}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3">
          <p className="text-xs font-bold text-yellow-700 uppercase tracking-wide mb-1">
            주의 ({warnings.length})
          </p>
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-800">{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

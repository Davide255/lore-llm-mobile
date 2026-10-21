/** "1.0.0-ota.d20261008t0626.g7c3fc46" -> "08/10 · 7c3fc46"; other versions are shown as they are. */
export function formatOtaVersion(version: string): string {
  const m = /-ota\.d(\d{4})(\d{2})(\d{2})t\d{4}\.g(.+)$/.exec(version);
  return m ? `${m[3]}/${m[2]} · ${m[4]}` : version;
}

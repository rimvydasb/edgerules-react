/** Joins the truthy class names — a minimal `clsx` so CSS-module call sites stay readable. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

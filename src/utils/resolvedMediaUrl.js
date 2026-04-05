export function resolvedMediaUrl(path) {
  if (path == null || path === "") return "";
  const trimmed = String(path).trim();
  if (typeof window === "undefined") return trimmed;
  try {
    return new URL(trimmed, window.location.href).href;
  } catch {
    return trimmed;
  }
}

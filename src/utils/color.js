function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbChannel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function accessibleForeground(bgHex) {
  const whiteRatio = contrastRatio(bgHex, "#ffffff");
  const blackRatio = contrastRatio(bgHex, "#000000");
  return whiteRatio >= blackRatio ? "#ffffff" : "#000000";
}

export function accessibleMuted(bgHex, opacity = 0.55) {
  const base = accessibleForeground(bgHex);
  const [r, g, b] = hexToRgb(base);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

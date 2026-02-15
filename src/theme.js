/* ═══════════════════════════════════════
   d-lab Grant Engine — Design Tokens v4
   Bold & Branded: Red · Navy · White
   ═══════════════════════════════════════ */

export const C = {
  // ── Backgrounds ──
  bg: "#F7F7F8",
  white: "#FFFFFF",
  card: "#FFFFFF",
  raised: "#EDEEF2",
  subtle: "#D4D6DD",
  line: "#E2E4EA",
  hover: "#F0F1F5",

  // ── Primary: d-lab Red ──
  primary: "#D03228",
  primarySoft: "#FDE8E7",
  primaryBorder: "#D0322880",
  primaryDark: "#A82820",
  primaryGlow: "rgba(208, 50, 40, 0.10)",

  // ── Secondary: Deep Navy ──
  navy: "#1A1F36",
  navyLight: "#252B48",
  navySoft: "#E8EAF0",

  // ── Backward compat aliases (use C.primary in new code) ──
  green: "#D03228",
  greenSoft: "#FDE8E7",
  greenBorder: "#D0322880",
  accent: "#D03228",

  // ── Text ──
  dark: "#111827",
  t1: "#1F2937",
  t2: "#4B5563",
  t3: "#6B7280",
  t4: "#9CA3AF",

  // ── Semantic ──
  red: "#D03228",
  redSoft: "#FDE8E7",
  amber: "#D4A017",
  amberSoft: "#FEF7E0",
  blue: "#1E56A0",
  blueSoft: "#E8F0FD",
  purple: "#7C3AED",
  purpleSoft: "#EDE9FE",

  // ── Sidebar: Clean White/Grey ──
  sidebar: "#FFFFFF",
  sidebarHover: "#F5F5F7",
  sidebarActive: "#FDE8E7",
  sidebarText: "#6B7280",
  sidebarTextActive: "#D03228",
  sidebarAccent: "#D03228",

  // ── Success / Status ──
  ok: "#16A34A",
  okSoft: "#DCFCE7",

  // ── Utility ──
  warm100: "#FAFBFD",
  warm200: "#F0F1F5",
  warm300: "#E2E4EA",
  glow: "rgba(208, 50, 40, 0.08)",
  glowStrong: "rgba(208, 50, 40, 0.15)",

  // ── Shadows (navy-tinted for cohesion) ──
  cardShadow: "0 1px 3px rgba(26, 31, 54, 0.08), 0 1px 2px rgba(26, 31, 54, 0.05)",
  cardShadowHover: "0 10px 30px rgba(26, 31, 54, 0.10), 0 2px 8px rgba(26, 31, 54, 0.06)",
  cardShadowLg: "0 16px 48px rgba(26, 31, 54, 0.12), 0 4px 16px rgba(26, 31, 54, 0.07)",

  // ── Extra ──
  yellow: "#D4A017",
  yellowSoft: "#FEF7E0",
};

export const FONT = `'Outfit', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
export const MONO = `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`;

export const injectFonts = () => {
  if (typeof document !== "undefined" && !document.querySelector(`link[href*="Outfit"]`)) {
    const fontLink = document.createElement("link");
    fontLink.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap";
    fontLink.rel = "stylesheet";
    document.head.appendChild(fontLink);
  }
};

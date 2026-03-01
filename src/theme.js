/* ═══════════════════════════════════════
   d-lab Grant Engine — Design Tokens v5
   Linear Density + Soft SaaS Warmth
   ═══════════════════════════════════════ */

export const C = {
  // ── Backgrounds (warm neutrals) ──
  bg: "#FAFAF8",
  white: "#FFFFFF",
  card: "#FFFFFF",
  raised: "#F0F0ED",
  subtle: "#D5D5D0",
  line: "#E8E6E1",
  hover: "#F4F3F0",

  // ── Primary: d-lab Red (warmer) ──
  primary: "#C93B33",
  primarySoft: "#FDF0EE",
  primaryBorder: "#C93B3380",
  primaryDark: "#A3322B",
  primaryGlow: "rgba(201, 59, 51, 0.08)",

  // ── Secondary: Deep Navy ──
  navy: "#1A1F36",
  navyLight: "#252B48",
  navySoft: "#E8EAF0",

  // ── Backward compat aliases (DEPRECATED — use C.primary in new code) ──
  green: "#C93B33",
  greenSoft: "#FDF0EE",
  greenBorder: "#C93B3380",
  accent: "#C93B33",

  // ── Text (WCAG AA contrast-safe on #FAFAF8 and #FFFFFF) ──
  dark: "#111111",
  t1: "#1C1C1C",
  t2: "#52524E",
  t3: "#636360",
  t4: "#8C8C86",

  // ── Semantic ──
  red: "#C93B33",
  redSoft: "#FDF0EE",
  amber: "#D4A017",
  amberSoft: "#FEF7E0",
  blue: "#1E56A0",
  blueSoft: "#E8F0FD",
  purple: "#7C3AED",
  purpleSoft: "#EDE9FE",

  // ── Sidebar ──
  sidebar: "#FFFFFF",
  sidebarHover: "#F5F4F1",
  sidebarActive: "#FDF0EE",
  sidebarText: "#7A7A74",
  sidebarTextActive: "#C93B33",
  sidebarAccent: "#C93B33",

  // ── Success / Status ──
  ok: "#16A34A",
  okSoft: "#DCFCE7",

  // ── Utility (warm-tinted) ──
  warm100: "#FAFAF7",
  warm200: "#F0EFEC",
  warm300: "#E5E3DE",
  glow: "rgba(201, 59, 51, 0.06)",
  glowStrong: "rgba(201, 59, 51, 0.12)",

  // ── Shadows (flat, neutral — Linear-style) ──
  cardShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
  cardShadowHover: "0 2px 8px rgba(0, 0, 0, 0.06)",
  cardShadowLg: "0 8px 24px rgba(0, 0, 0, 0.10)",

  // ── Extra (aliases for amber — kept for backward compat) ──
  yellow: "#D4A017",
  yellowSoft: "#FEF7E0",
};

export const FONT = `'Outfit', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
export const MONO = `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`;

export const injectFonts = () => {
  if (typeof document === "undefined") return;
  if (!document.querySelector(`link[href*="Outfit"]`)) {
    const fontLink = document.createElement("link");
    fontLink.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap";
    fontLink.rel = "stylesheet";
    document.head.appendChild(fontLink);
  }
  if (!document.getElementById("ge-global-anims")) {
    const style = document.createElement("style");
    style.id = "ge-global-anims";
    style.textContent = `
      @keyframes ge-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      @keyframes app-load-bar { 0% { width: 5%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 5%; margin-left: 95%; } }
      @keyframes scout-progress { 0% { width: 5%; } 30% { width: 35%; } 60% { width: 65%; } 80% { width: 85%; } 95% { width: 95%; } 100% { width: 98%; } }
      @keyframes ai-load-bar { 0% { width: 5%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 5%; margin-left: 95%; } }
      @keyframes ai-expand { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
      /* ── Shared hover utilities (subtle, warm) ── */
      .ge-hover-lift { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .ge-hover-lift:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
      .ge-hover-slide { transition: background 0.15s ease, padding-left 0.15s ease, opacity 0.15s ease; }
      .ge-hover-slide:hover { background: #F4F3F0; padding-left: 20px; opacity: 1 !important; }
      .ge-hover-nudge { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .ge-hover-nudge:hover { transform: translateX(2px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); opacity: 1 !important; }
      .ge-hover-bar { transition: opacity 0.2s; }
      .ge-hover-bar:hover { opacity: 1 !important; }
      @keyframes ge-toast-in { from { opacity: 0; transform: translateY(12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes ge-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }
};

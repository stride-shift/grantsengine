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

  // ── Backward compat aliases (DEPRECATED — use C.primary in new code) ──
  // NOTE: These point to red/primary, NOT green. Named "green" from original theme.
  green: "#D03228",      // DEPRECATED: actually primary red
  greenSoft: "#FDE8E7",  // DEPRECATED: actually primarySoft
  greenBorder: "#D0322880", // DEPRECATED: actually primaryBorder
  accent: "#D03228",     // alias for primary

  // ── Text (WCAG AA contrast-safe on #F7F7F8 and #FFFFFF) ──
  dark: "#111827",
  t1: "#1F2937",
  t2: "#4B5563",
  t3: "#5C6370",   // was #6B7280 — bumped for 4.5:1+ contrast on #F7F7F8
  t4: "#71767F",   // was #9CA3AF — bumped for 4.5:1+ contrast on white

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

  // ── Extra (aliases for amber — kept for backward compat) ──
  yellow: "#D4A017",    // same as C.amber
  yellowSoft: "#FEF7E0", // same as C.amberSoft
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
  // Inject shared keyframe animations once (used across App, Pipeline, Dashboard, GrantDetail, index)
  if (!document.getElementById("ge-global-anims")) {
    const style = document.createElement("style");
    style.id = "ge-global-anims";
    style.textContent = `
      @keyframes ge-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      @keyframes app-load-bar { 0% { width: 5%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 5%; margin-left: 95%; } }
      @keyframes scout-progress { 0% { width: 5%; } 30% { width: 35%; } 60% { width: 65%; } 80% { width: 85%; } 95% { width: 95%; } 100% { width: 98%; } }
      @keyframes ai-load-bar { 0% { width: 5%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 5%; margin-left: 95%; } }
      @keyframes ai-expand { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
      /* ── Shared hover utilities (replaces inline onMouseEnter/Leave) ── */
      .ge-hover-lift { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .ge-hover-lift:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(26,31,54,0.10), 0 2px 8px rgba(26,31,54,0.06); }
      .ge-hover-slide { transition: background 0.15s ease, padding-left 0.15s ease, opacity 0.15s ease; }
      .ge-hover-slide:hover { background: #F0F1F5; padding-left: 22px; opacity: 1 !important; }
      .ge-hover-nudge { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .ge-hover-nudge:hover { transform: translateX(4px); box-shadow: 0 10px 30px rgba(26,31,54,0.10), 0 2px 8px rgba(26,31,54,0.06); opacity: 1 !important; }
      .ge-hover-bar { transition: opacity 0.2s; }
      .ge-hover-bar:hover { opacity: 1 !important; }
      @keyframes ge-toast-in { from { opacity: 0; transform: translateY(12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes ge-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }
};

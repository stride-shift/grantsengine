/* ═══════════════════════════════════════
   d-lab Grant Engine — Design Tokens v6
   Sage & Slate — Calm, Trustworthy, Funder-Ready
   ═══════════════════════════════════════ */

export const C = {
  // ── Backgrounds (barely-green warmth) ──
  bg: "#F8FAF8",
  white: "#FFFFFF",
  card: "#FFFFFF",
  raised: "#EEF1EE",
  subtle: "#D0D5D0",
  line: "#E2E6E2",
  hover: "#F1F4F1",

  // ── Primary: Sage Green ──
  primary: "#4A7C59",
  primarySoft: "#EDF5F0",
  primaryBorder: "#4A7C5980",
  primaryDark: "#3A6347",
  primaryGlow: "rgba(74, 124, 89, 0.08)",

  // ── Secondary: Slate (headers, strong text) ──
  navy: "#374151",
  navyLight: "#4B5563",
  navySoft: "#E5E7EB",

  // ── Accent: Warm Gold ──
  accent: "#C17817",
  accentSoft: "#FEF5E7",

  // ── Backward compat aliases ──
  green: "#4A7C59",
  greenSoft: "#EDF5F0",
  greenBorder: "#4A7C5980",

  // ── Text (WCAG AA contrast-safe on #F8FAF8 and #FFFFFF) ──
  dark: "#111111",
  t1: "#1C1C1C",
  t2: "#4B5563",
  t3: "#6B7280",
  t4: "#9CA3AF",

  // ── Semantic ──
  red: "#DC2626",
  redSoft: "#FEF2F2",
  amber: "#C17817",
  amberSoft: "#FEF5E7",
  blue: "#2563EB",
  blueSoft: "#EFF6FF",
  purple: "#6D28D9",
  purpleSoft: "#F3F0FF",

  // ── Sidebar ──
  sidebar: "#FFFFFF",
  sidebarHover: "#F3F7F4",
  sidebarActive: "#EDF5F0",
  sidebarText: "#6B7280",
  sidebarTextActive: "#4A7C59",
  sidebarAccent: "#4A7C59",

  // ── Success / Status ──
  ok: "#16A34A",
  okSoft: "#DCFCE7",

  // ── Utility ──
  warm100: "#F5F7F5",
  warm200: "#E8ECE8",
  warm300: "#D5DBD5",
  glow: "rgba(74, 124, 89, 0.06)",
  glowStrong: "rgba(74, 124, 89, 0.12)",

  // ── Shadows (flat, neutral) ──
  cardShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
  cardShadowHover: "0 2px 8px rgba(0, 0, 0, 0.06)",
  cardShadowLg: "0 8px 24px rgba(0, 0, 0, 0.10)",

  // ── Extra (aliases) ──
  yellow: "#C17817",
  yellowSoft: "#FEF5E7",
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
      /* ── Shared hover utilities ── */
      .ge-hover-lift { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .ge-hover-lift:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
      .ge-hover-slide { transition: background 0.15s ease, padding-left 0.15s ease, opacity 0.15s ease; }
      .ge-hover-slide:hover { background: #F1F4F1; padding-left: 20px; opacity: 1 !important; }
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

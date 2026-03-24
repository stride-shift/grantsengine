/* ═══════════════════════════════════════
   Grant Engine — Design Tokens v6
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
  teal: "#0891B2",
  tealSoft: "#ECFEFF",
  emerald: "#1A7A42",
  emeraldSoft: "#E6F5EE",

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

/* ── Color helpers for org theming ── */

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mix hex color toward white. amount=0.92 → 92% white, 8% color */
function tint(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Darken hex color by reducing each channel */
function darken(hex, percent) {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - percent / 100;
  return rgbToHex(r * f, g * f, b * f);
}

/**
 * Apply org-specific brand colors to the theme.
 * Mutates C in place — React re-renders after setOrg() pick up new values.
 * Pass null/undefined or org without primary_color to keep defaults.
 */
export function applyOrgTheme(org) {
  if (!org) return;
  const p = org.primary_color;
  const pd = org.primary_dark;
  const ac = org.accent_color;
  if (!p) return; // no custom colors → keep sage defaults

  // Primary family
  C.primary = p;
  C.primaryDark = pd || darken(p, 15);
  C.primarySoft = tint(p, 0.92);
  C.primaryBorder = p + "80";
  C.primaryGlow = hexToRgba(p, 0.08);
  C.green = p;
  C.greenSoft = C.primarySoft;
  C.greenBorder = C.primaryBorder;

  // Sidebar — derive from primary
  C.sidebarHover = tint(p, 0.96);
  C.sidebarActive = C.primarySoft;
  C.sidebarTextActive = p;
  C.sidebarAccent = p;

  // Background — barely-tinted
  C.bg = tint(p, 0.97);
  C.warm100 = tint(p, 0.96);
  C.warm200 = tint(p, 0.91);
  C.warm300 = tint(p, 0.84);
  C.hover = tint(p, 0.95);
  C.raised = tint(p, 0.93);
  C.subtle = tint(p, 0.82);
  C.line = tint(p, 0.89);
  C.glow = hexToRgba(p, 0.06);
  C.glowStrong = hexToRgba(p, 0.12);

  // Accent (if provided)
  if (ac) {
    C.accent = ac;
    C.accentSoft = tint(ac, 0.91);
    C.amber = ac;
    C.amberSoft = C.accentSoft;
    C.yellow = ac;
    C.yellowSoft = C.accentSoft;
  }
}

/** Reset theme to defaults (sage & slate) */
export function resetTheme() {
  C.primary = "#4A7C59";
  C.primarySoft = "#EDF5F0";
  C.primaryBorder = "#4A7C5980";
  C.primaryDark = "#3A6347";
  C.primaryGlow = "rgba(74, 124, 89, 0.08)";
  C.green = "#4A7C59";
  C.greenSoft = "#EDF5F0";
  C.greenBorder = "#4A7C5980";
  C.bg = "#F8FAF8";
  C.hover = "#F1F4F1";
  C.raised = "#EEF1EE";
  C.subtle = "#D0D5D0";
  C.line = "#E2E6E2";
  C.warm100 = "#F5F7F5";
  C.warm200 = "#E8ECE8";
  C.warm300 = "#D5DBD5";
  C.glow = "rgba(74, 124, 89, 0.06)";
  C.glowStrong = "rgba(74, 124, 89, 0.12)";
  C.sidebar = "#FFFFFF";
  C.sidebarHover = "#F3F7F4";
  C.sidebarActive = "#EDF5F0";
  C.sidebarTextActive = "#4A7C59";
  C.sidebarAccent = "#4A7C59";
  C.accent = "#C17817";
  C.accentSoft = "#FEF5E7";
  C.amber = "#C17817";
  C.amberSoft = "#FEF5E7";
  C.yellow = "#C17817";
  C.yellowSoft = "#FEF5E7";
}

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
      /* ── Dark-themed input placeholders (for glass cards) ── */
      .ge-dark-input::placeholder { color: rgba(255,255,255,0.35) !important; }
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
      @keyframes ge-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      @keyframes ge-bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      /* ── Accessible focus rings ── */
      *:focus-visible { outline: 2px solid #4A7C59 !important; outline-offset: 2px; }
      input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid #4A7C59 !important; outline-offset: 0px; }

      /* ── Responsive: Mobile ── */
      @media (max-width: 768px) {
        .ge-sidebar { transform: translateX(-100%); transition: transform 0.3s ease; }
        .ge-sidebar.ge-sidebar-open { transform: translateX(0); }
        .ge-sidebar-bg { transform: translateX(-100%); transition: transform 0.3s ease; }
        .ge-sidebar-bg.ge-sidebar-open { transform: translateX(0); }
        .ge-sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 8; }
        .ge-sidebar-overlay.ge-sidebar-open { display: block; }
        .ge-main { margin-left: 0 !important; padding-top: 56px; }
        .ge-mobile-header { display: flex !important; }
        .ge-hide-mobile { display: none !important; }
        .ge-desktop-only { display: none !important; }
      }
      @media (min-width: 769px) {
        .ge-mobile-header { display: none !important; }
        .ge-sidebar-overlay { display: none !important; }
      }
      /* ── Responsive: Tablet ── */
      @media (max-width: 1024px) {
        .ge-tablet-stack { flex-direction: column !important; }
        .ge-tablet-full { width: 100% !important; max-width: 100% !important; }
      }
      /* ── Scrollbar hide utility ── */
      .ge-no-scrollbar::-webkit-scrollbar { display: none; }
      .ge-no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      /* ── Custom scrollbar ── */
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(4, 57, 39, 0.35); border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(4, 57, 39, 0.55); }
    `;
    document.head.appendChild(style);
  }
};

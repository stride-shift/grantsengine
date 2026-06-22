import { useState, useRef, useEffect } from "react";
import { C, FONT } from "@/theme";
import { GLOSSARY } from "@/data/glossary";

/* Build a fast lookup map: lowercase term → definition string.
 * Generated once from the glossary file. */
const TERM_MAP = (() => {
  const map = new Map();
  for (const entry of GLOSSARY) {
    // Strip the wrapping parens from the definition for cleaner display
    const def = (entry.definition || "").replace(/^\(/, "").replace(/\)$/, "").trim();
    map.set(entry.term.toLowerCase(), def);
    // Also index by the lowercased "key" form (e.g. "type 1 cohort" → same def)
    map.set(entry.term.toLowerCase().replace(/\s+/g, " "), def);
  }
  return map;
})();

// Quick check whether a given string contains anything we have a definition for.
// Uses the same regex patterns as the glossary so detection matches insertion.
export const containsJargon = (text) => {
  if (!text || typeof text !== "string") return false;
  for (const entry of GLOSSARY) {
    if (entry.regex.test(text)) return true;
  }
  return false;
};

// Look up a definition for a specific term (string match). Returns null if unknown.
export const lookupDefinition = (term) => {
  if (!term) return null;
  return TERM_MAP.get(term.toLowerCase().trim()) || null;
};

/* JargonTip — a thin span that shows a hover popover with the term's definition.
 * Use this in any UI label where an acronym appears:
 *   <JargonTip term="B-BBEE">B-BBEE</JargonTip> Value Proposition
 * If `term` isn't in the glossary, renders children with no wrapper.
 *
 * Designed to be very lightweight — uses CSS hover, no portal, no JS positioning.
 */
export default function JargonTip({ term, children, style }) {
  const definition = lookupDefinition(term);
  if (!definition) return <>{children}</>;

  return (
    <span style={{
      position: "relative",
      borderBottom: `1px dotted ${C.t4}`,
      cursor: "help",
      ...style,
    }}
      tabIndex={0}
      // Native title for accessibility / keyboard / mobile fallback
      title={`${term}: ${definition}`}
      className="ge-jargon-tip"
    >
      {children}
      <span className="ge-jargon-tip-pop" style={{
        position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
        transform: "translateX(-50%)",
        minWidth: 200, maxWidth: 320,
        padding: "8px 10px",
        background: C.dark, color: C.white,
        fontSize: 11, fontFamily: FONT, lineHeight: 1.4, fontWeight: 400,
        borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        opacity: 0, pointerEvents: "none",
        transition: "opacity 150ms ease",
        zIndex: 100, whiteSpace: "normal",
        textAlign: "left", letterSpacing: 0,
      }}>
        <strong style={{ fontWeight: 700 }}>{term}</strong>
        <span style={{ display: "block", marginTop: 2, color: "rgba(255,255,255,0.85)" }}>{definition}</span>
      </span>
    </span>
  );
}

/* Auto-wrap known jargon terms inside a text string.
 * Returns React children with each matching term replaced by a <JargonTip>.
 * Use for dynamic strings like proposal section names: <span>{glossText(s)}</span>
 */
export const glossText = (text) => {
  if (!text || typeof text !== "string") return text;
  // Build a single regex matching any glossary term (using the longest-first to avoid
  // partial matches like B-BBEE matching as BBEE).
  // We use word boundaries from the existing regexes; combine them.
  const sources = GLOSSARY
    .slice()
    .sort((a, b) => b.term.length - a.term.length)
    .map(e => e.regex.source);
  const combined = new RegExp(`(${sources.join("|")})`, "gi");
  const parts = [];
  let last = 0;
  let m;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const matched = m[0];
    // Find the canonical term for tooltip lookup
    const entry = GLOSSARY.find(e => new RegExp(`^${e.regex.source}$`, "i").test(matched));
    const termKey = entry?.term || matched;
    parts.push(<JargonTip key={parts.length} term={termKey}>{matched}</JargonTip>);
    last = m.index + matched.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
};

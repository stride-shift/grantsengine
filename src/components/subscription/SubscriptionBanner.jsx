import { C, FONT } from "@/theme";
import { formatZar, PRICING } from "@/data/subscription";

/* Non-blocking subscription banner. Shows only when the org's trial has expired
 * (or was cancelled). If a super-admin has also enabled the read-only lock, the
 * copy says editing is disabled; otherwise it's a soft upgrade nudge. Billing is
 * manual, so the CTA is "contact us to upgrade" rather than a checkout. */

export default function SubscriptionBanner({ subscription, orgName }) {
  if (!subscription || !subscription.expired) return null;
  const locked = subscription.readOnlyLock;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "10px 18px", fontFamily: FONT, fontSize: 13,
      background: locked ? `${C.red}10` : `${C.amber}12`,
      borderBottom: `1px solid ${locked ? C.red : C.amber}40`,
      color: C.t1,
    }}>
      <span style={{ fontSize: 15 }}>{locked ? "🔒" : "⏳"}</span>
      <span style={{ flex: "1 1 320px", lineHeight: 1.45 }}>
        <strong>{locked ? "Read-only — subscription expired." : "Your free trial has ended."}</strong>{" "}
        {locked
          ? "Viewing still works, but editing and AI generation are disabled until you upgrade."
          : "Upgrade to keep editing and generating."}{" "}
        Plans: <strong>{formatZar(PRICING.monthly)}/mo</strong> or <strong>{formatZar(PRICING.yearly)}/yr</strong>.
      </span>
      <a
        href={`mailto:hello@d-lab.co.za?subject=${encodeURIComponent(`Upgrade ${orgName || "our"} Grants Engine subscription`)}`}
        style={{
          flexShrink: 0, padding: "6px 14px", borderRadius: 8, textDecoration: "none",
          fontWeight: 700, fontSize: 12, fontFamily: FONT,
          background: locked ? C.red : C.amber, color: "#fff",
        }}
      >
        Contact us to upgrade
      </a>
    </div>
  );
}

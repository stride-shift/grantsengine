import { useState, useMemo } from "react";
import { C, FONT } from "@/theme";
import { resolveOrgType } from "@/data/orgType";
import Freebies from "@/components/freebies/Freebies";
import Calendar from "@/components/calendar/Calendar";
import DocVault from "@/components/documents/DocVault";
import Funders from "@/components/funders/Funders";
import Archive from "@/components/pipeline/Archive";

/* Resources hub — single top-level tab that nests the org's reference areas as
 * sub-tabs: the org-type-tailored resource directory plus Calendar, Documents,
 * Funders and Archive (each formerly its own sidebar item). The resource
 * directory is filtered to the org's resolved type (explicit org.org_type, else
 * inferred from the org's details). */

const SUB_TABS = [
  { id: "resources", label: "Resources", icon: "☆" },
  { id: "calendar", label: "Calendar", icon: "○" },
  { id: "documents", label: "Documents", icon: "□" },
  { id: "funders", label: "Funders", icon: "♡" },
  { id: "archive", label: "Archive", icon: "▤" },
];

export default function ResourcesHub({
  org, profile, grants, team, stages, complianceDocs, currentMember,
  onSelectGrant, onNavigate, onLaunchTour, initialTab = "resources",
}) {
  const [tab, setTab] = useState(initialTab);
  const orgType = useMemo(() => resolveOrgType(org, profile), [org, profile]);

  return (
    <div>
      {/* Sub-tab strip */}
      <div style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        padding: "14px 32px 0", borderBottom: `1px solid ${C.line}`,
      }}>
        {SUB_TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "8px 14px", border: "none", background: "transparent",
              fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
              color: active ? C.primary : C.t3,
              borderBottom: `2px solid ${active ? C.primary : "transparent"}`,
              marginBottom: -1,
            }}>
              <span style={{ fontSize: 13 }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {tab === "resources" && <Freebies orgType={orgType} />}
      {tab === "calendar" && (
        <Calendar grants={grants} team={team} stages={stages} onSelectGrant={onSelectGrant} onLaunchTour={onLaunchTour} />
      )}
      {tab === "documents" && (
        <DocVault grants={grants} complianceDocs={complianceDocs} currentMember={currentMember} onLaunchTour={onLaunchTour} />
      )}
      {tab === "funders" && (
        <Funders grants={grants} team={team} stages={stages} onSelectGrant={onSelectGrant} onNavigate={onNavigate} onLaunchTour={onLaunchTour} />
      )}
      {tab === "archive" && (
        <Archive grants={grants} team={team} stages={stages} onSelectGrant={onSelectGrant} />
      )}
    </div>
  );
}

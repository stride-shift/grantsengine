// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/api", () => ({
  detectForm: vi.fn(),
  updateAutofillMappings: vi.fn(),
  runAutofill: vi.fn(),
  submitAutofill: vi.fn(),
  verifyUrls: vi.fn(),
  getUploads: vi.fn(),
  uploadFile: vi.fn(),
  deleteUpload: vi.fn(),
}));
// Keep isAIError + assembleText real-ish; submission method is what drives the
// auto-detect effect, so we control it explicitly per test.
vi.mock("@/utils", () => ({
  isAIError: (r) => !r || (typeof r === "string" && r.startsWith("Error")),
  assembleText: (sections, order) =>
    (order || []).filter((n) => sections[n]?.text).map((n) => sections[n].text).join("\n\n"),
  detectSubmissionMethod: vi.fn(() => ({ method: "unknown", label: "", desc: "" })),
}));
vi.mock("@/data/glossary", () => ({
  buildGlossaryAppendix: vi.fn(() => ""),
}));

import {
  detectForm, updateAutofillMappings, runAutofill, submitAutofill, verifyUrls, getUploads,
} from "@/api";
import { detectSubmissionMethod } from "@/utils";
import { buildGlossaryAppendix } from "@/data/glossary";
import useAutofill, { escapeHtml, renderPara } from "@/hooks/useAutofill";

const baseGrant = (over = {}) => ({
  id: "g1", name: "Acme Bid", funder: "Acme Foundation",
  aiSections: { Intro: { text: "Hello world." } }, aiSectionsOrder: ["Intro"],
  ...over,
});

const makeProps = (over = {}) => {
  const { grant, ...rest } = over;
  return {
    grant: baseGrant(grant), // merge the override INTO the base grant
    onSubmitted: vi.fn(),
    onRunAI: vi.fn(),
    onUpdateGrant: vi.fn(),
    onTriggerMagic: undefined, // off by default so the magic effect stays inert
    generatingProposal: false,
    ...rest, // grant already destructured out, so it won't clobber the merged grant
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  detectSubmissionMethod.mockReturnValue({ method: "unknown", label: "", desc: "" });
  getUploads.mockResolvedValue([]);
  verifyUrls.mockResolvedValue([]);
  buildGlossaryAppendix.mockReturnValue("");
});

describe("pure helpers", () => {
  it("escapeHtml escapes the HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">A & B</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;A &amp; B&lt;/a&gt;");
  });
  it("renderPara wraps bullets, bold lines, blanks, and plain text", () => {
    expect(renderPara("")).toBe("<br/>");
    expect(renderPara("- item")).toBe("<li>item</li>");
    expect(renderPara("**Bold**")).toContain("font-weight:700");
    expect(renderPara("plain")).toBe("<p>plain</p>");
  });
});

describe("useAutofill — form detection", () => {
  it("does NOT auto-detect for non-form channels", async () => {
    detectSubmissionMethod.mockReturnValue({ method: "email", label: "", desc: "" });
    renderHook(() => useAutofill(makeProps()));
    await waitFor(() => expect(getUploads).toHaveBeenCalled());
    expect(detectForm).not.toHaveBeenCalled();
  });

  it("auto-detects for form channels and maps the response into state", async () => {
    detectSubmissionMethod.mockReturnValue({ method: "form", label: "", desc: "" });
    detectForm.mockResolvedValue({
      jobId: "job-9", fields: [{ name: "a", label: "A" }],
      mappings: [{ fieldName: "a", suggestedValue: "x", confidence: "high" }],
      formType: "online-form", requiresLogin: true, notes: "note",
      fetchError: "warn", resolvedUrl: "https://r", urlSource: "notes",
    });
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.job).toEqual({ id: "job-9" }));
    expect(result.current.fields).toHaveLength(1);
    expect(result.current.mappings[0].fieldName).toBe("a");
    expect(result.current.formType).toBe("online-form");
    expect(result.current.requiresLogin).toBe(true);
    expect(result.current.notes).toBe("note");
    expect(result.current.fetchError).toBe("warn");
    expect(result.current.resolvedUrl).toBe("https://r");
    expect(result.current.urlSource).toBe("notes");
  });

  it("surfaces a detectForm error string in state", async () => {
    detectSubmissionMethod.mockReturnValue({ method: "form", label: "", desc: "" });
    detectForm.mockResolvedValue({ error: "boom" });
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.job).toBe(null);
  });
});

describe("useAutofill — mapping edit + save payload", () => {
  it("updateMapping mutates the value and marks edited; saveEdits posts the mappings", async () => {
    detectSubmissionMethod.mockReturnValue({ method: "form", label: "", desc: "" });
    detectForm.mockResolvedValue({
      jobId: "job-1", fields: [{ name: "a", label: "A" }],
      mappings: [{ fieldName: "a", suggestedValue: "old", confidence: "high" }],
    });
    updateAutofillMappings.mockResolvedValue({});
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.job).toEqual({ id: "job-1" }));

    act(() => { result.current.updateMapping("a", "new"); });
    expect(result.current.mappings[0].suggestedValue).toBe("new");
    expect(result.current.edited).toBe(true);

    await act(async () => { await result.current.saveEdits(); });
    expect(updateAutofillMappings).toHaveBeenCalledWith("job-1", [
      { fieldName: "a", suggestedValue: "new", confidence: "high" },
    ]);
    expect(result.current.edited).toBe(false);
  });

  it("saveEdits is a no-op when nothing was edited", async () => {
    detectSubmissionMethod.mockReturnValue({ method: "form", label: "", desc: "" });
    detectForm.mockResolvedValue({ jobId: "job-1", fields: [], mappings: [] });
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.job).toEqual({ id: "job-1" }));
    await act(async () => { await result.current.saveEdits(); });
    expect(updateAutofillMappings).not.toHaveBeenCalled();
  });
});

describe("useAutofill — buildDownloadText glossary handling", () => {
  it("returns the assembled text untouched when glossary is off", () => {
    const { result } = renderHook(() => useAutofill(makeProps()));
    expect(result.current.buildDownloadText()).toBe("Hello world.");
  });

  it("appends the glossary appendix when includeGlossary is on and terms exist", () => {
    buildGlossaryAppendix.mockReturnValue("---\n## Glossary\n**B-BBEE** — definition");
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { includeGlossary: true } })));
    expect(result.current.buildDownloadText()).toBe("Hello world.\n\n---\n## Glossary\n**B-BBEE** — definition");
  });

  it("does not append when glossary is on but there are no terms", () => {
    buildGlossaryAppendix.mockReturnValue("");
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { includeGlossary: true } })));
    expect(result.current.buildDownloadText()).toBe("Hello world.");
  });

  it("returns empty string when there is no assembled proposal", () => {
    const { result } = renderHook(() =>
      useAutofill(makeProps({ grant: { aiSections: null, aiSectionsOrder: [], aiDraft: "" } })));
    expect(result.current.buildDownloadText()).toBe("");
  });
});

describe("useAutofill — autofill + submit flows", () => {
  beforeEach(() => detectSubmissionMethod.mockReturnValue({ method: "form", label: "", desc: "" }));

  it("handleAutoFill passes creds only when login is required AND a username is supplied, then stores screenshots", async () => {
    detectForm.mockResolvedValue({ jobId: "job-1", fields: [], mappings: [], requiresLogin: true });
    runAutofill.mockResolvedValue({ screenshots: [{ url: "s1" }], sessionId: "sess" });
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.job?.id).toBe("job-1"));

    await act(async () => { await result.current.handleAutoFill({ username: "u", password: "p" }); });
    expect(runAutofill).toHaveBeenCalledWith("job-1", { username: "u", password: "p" });
    expect(result.current.job.screenshots).toEqual([{ url: "s1" }]);
    expect(result.current.job.sessionId).toBe("sess");
  });

  it("handleAutoFill sends null creds when login required but no username given", async () => {
    detectForm.mockResolvedValue({ jobId: "job-1", fields: [], mappings: [], requiresLogin: true });
    runAutofill.mockResolvedValue({ screenshots: [] });
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.job?.id).toBe("job-1"));
    await act(async () => { await result.current.handleAutoFill({ username: "", password: "" }); });
    expect(runAutofill).toHaveBeenCalledWith("job-1", null);
  });

  it("handleAutoFill surfaces the manual-fill hint when service is unconfigured", async () => {
    detectForm.mockResolvedValue({ jobId: "job-1", fields: [], mappings: [] });
    runAutofill.mockResolvedValue({ error: "no service", service_configured: false });
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.job?.id).toBe("job-1"));
    await act(async () => { await result.current.handleAutoFill({ username: "", password: "" }); });
    expect(result.current.error).toBe("no service Use copy buttons to fill manually.");
  });

  it("handleFinalSubmit confirms, submits, and fires onSubmitted on success", async () => {
    window.confirm = vi.fn(() => true); // happy-dom doesn't define confirm/alert
    window.alert = vi.fn();
    detectForm.mockResolvedValue({ jobId: "job-1", fields: [], mappings: [] });
    submitAutofill.mockResolvedValue({ success: true });
    const props = makeProps({ grant: { applyUrl: "https://apply" } });
    const { result } = renderHook(() => useAutofill(props));
    await waitFor(() => expect(result.current.job?.id).toBe("job-1"));
    await act(async () => { await result.current.handleFinalSubmit(); });
    expect(submitAutofill).toHaveBeenCalledWith("job-1");
    expect(props.onSubmitted).toHaveBeenCalledWith("job-1");
  });

  it("handleFinalSubmit aborts when the user cancels the confirm", async () => {
    window.confirm = vi.fn(() => false);
    detectForm.mockResolvedValue({ jobId: "job-1", fields: [], mappings: [] });
    const { result } = renderHook(() => useAutofill(makeProps({ grant: { applyUrl: "https://apply" } })));
    await waitFor(() => expect(result.current.job?.id).toBe("job-1"));
    await act(async () => { await result.current.handleFinalSubmit(); });
    expect(submitAutofill).not.toHaveBeenCalled();
  });
});

describe("useAutofill — findApplyUrlWithAI", () => {
  it("parses JSON candidates, verifies, saves the first that loads, prioritising non-homepage", async () => {
    const props = makeProps();
    props.onRunAI.mockResolvedValue(JSON.stringify({
      candidates: [
        { url: "https://acme.org", pageType: "homepage" },
        { url: "https://acme.org/apply", pageType: "form" },
      ],
      summary: "found it",
    }));
    // homepage loads too, but the form must win on priority order
    verifyUrls.mockResolvedValue([
      { url: "https://acme.org", ok: true },
      { url: "https://acme.org/apply", ok: true },
    ]);
    const { result } = renderHook(() => useAutofill(props));
    await act(async () => { await result.current.findApplyUrlWithAI(); });

    expect(props.onUpdateGrant).toHaveBeenCalledWith("g1", { applyUrl: "https://acme.org/apply" });
    expect(result.current.findUrlResult.url).toBe("https://acme.org/apply");
  });

  it("reports a no-loaders result with a candidate list when none verify", async () => {
    const props = makeProps();
    props.onRunAI.mockResolvedValue(JSON.stringify({ candidates: [{ url: "https://acme.org/apply", pageType: "form" }] }));
    verifyUrls.mockResolvedValue([{ url: "https://acme.org/apply", ok: false, status: 0 }]);
    const { result } = renderHook(() => useAutofill(props));
    await act(async () => { await result.current.findApplyUrlWithAI(); });
    expect(result.current.findUrlResult.url).toBe(null);
    expect(result.current.findUrlResult.candidates.length).toBeGreaterThan(0);
    expect(props.onUpdateGrant).not.toHaveBeenCalled();
  });

  it("surfaces an AI error string without saving", async () => {
    const props = makeProps();
    props.onRunAI.mockResolvedValue("Error: rate limited");
    const { result } = renderHook(() => useAutofill(props));
    await act(async () => { await result.current.findApplyUrlWithAI(); });
    expect(result.current.error).toBe("Error: rate limited");
    expect(verifyUrls).not.toHaveBeenCalled();
  });
});

describe("useAutofill — required docs extraction", () => {
  it("hydrates required docs from a cached grant value without calling AI", async () => {
    const props = makeProps({ grant: { requiredDocs: { documents: [{ name: "PBO Cert" }], summary: "s" } } });
    const { result } = renderHook(() => useAutofill(props));
    await waitFor(() => expect(result.current.requiredDocs).toEqual([{ name: "PBO Cert" }]));
    expect(result.current.reqDocsSummary).toBe("s");
    expect(props.onRunAI).not.toHaveBeenCalled();
  });

  it("auto-extracts from the AI when a brief exists and caches the parsed result on the grant", async () => {
    const props = makeProps({ grant: { funderBrief: "brief text" } });
    props.onRunAI.mockResolvedValue('```json\n{ "documents": [{ "name": "Budget" }], "summary": "ok" }\n```');
    const { result } = renderHook(() => useAutofill(props));
    await waitFor(() => expect(result.current.requiredDocs).toEqual([{ name: "Budget" }]));
    expect(props.onRunAI).toHaveBeenCalledWith("extractRequiredDocs", expect.any(Object));
    expect(props.onUpdateGrant).toHaveBeenCalledWith("g1", expect.objectContaining({
      requiredDocs: { documents: [{ name: "Budget" }], summary: "ok", source: "funder-brief" },
    }));
  });

  it("auto-fills required docs from the apply page on detect when no brief exists", async () => {
    detectSubmissionMethod.mockReturnValue({ method: "form", label: "", desc: "" });
    detectForm.mockResolvedValue({
      jobId: "job-2", fields: [], mappings: [],
      requiredDocs: { documents: [{ name: "Tax Clearance" }], summary: "from page", source: "apply-page" },
    });
    const props = makeProps({ grant: { applyUrl: "https://apply" } });
    const { result } = renderHook(() => useAutofill(props));
    await waitFor(() => expect(result.current.requiredDocs).toEqual([{ name: "Tax Clearance" }]));
    expect(result.current.reqDocsSummary).toBe("from page");
    expect(props.onUpdateGrant).toHaveBeenCalledWith("g1", expect.objectContaining({
      requiredDocs: { documents: [{ name: "Tax Clearance" }], summary: "from page", source: "apply-page" },
    }));
  });

  it("does NOT overwrite brief-sourced required docs with apply-page docs", async () => {
    detectSubmissionMethod.mockReturnValue({ method: "form", label: "", desc: "" });
    detectForm.mockResolvedValue({
      jobId: "job-3", fields: [], mappings: [],
      requiredDocs: { documents: [{ name: "Tax Clearance" }], summary: "from page", source: "apply-page" },
    });
    const props = makeProps({ grant: { applyUrl: "https://apply", requiredDocs: { documents: [{ name: "PBO Cert" }], summary: "brief", source: "funder-brief" } } });
    const { result } = renderHook(() => useAutofill(props));
    await waitFor(() => expect(result.current.job).toEqual({ id: "job-3" }));
    expect(props.onUpdateGrant).not.toHaveBeenCalledWith("g1", expect.objectContaining({
      requiredDocs: expect.objectContaining({ source: "apply-page" }),
    }));
  });
});

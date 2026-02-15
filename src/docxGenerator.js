/*
  docxGenerator.js — Generate proper .docx files from AI-generated proposals
  Uses the `docx` package for real Word documents with styled paragraphs,
  headers, footers, and d-lab branding.

  Lazy-imported via dynamic import() to avoid bundle bloat.
*/

const D03228 = "D03228"; // d-lab red hex (without #)
const NAVY = "1A1F36";

/**
 * Parse AI-generated text into structured sections.
 * Detects COVER EMAIL / PROPOSAL markers, numbered headings, bullets, paragraphs.
 */
function parseProposalText(text) {
  const sections = [];
  let currentSection = { title: null, paragraphs: [] };

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      // Empty line = paragraph break
      if (currentSection.paragraphs.length > 0) {
        const last = currentSection.paragraphs[currentSection.paragraphs.length - 1];
        if (last.type !== "break") {
          currentSection.paragraphs.push({ type: "break" });
        }
      }
      continue;
    }

    // Detect section markers
    if (/^={3,}/.test(trimmed) || /^\u2550{3,}/.test(trimmed)) {
      continue; // Skip separator lines
    }

    // Detect major section headers (COVER EMAIL, PROPOSAL, etc.)
    if (/^(COVER EMAIL|PROPOSAL|EXECUTIVE SUMMARY|BUDGET|APPENDIX)/i.test(trimmed)) {
      if (currentSection.title || currentSection.paragraphs.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: trimmed, paragraphs: [] };
      continue;
    }

    // Detect numbered headings: "1. Something" or "1) Something"
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numberedMatch && trimmed.length < 120) {
      currentSection.paragraphs.push({ type: "heading", text: `${numberedMatch[1]}. ${numberedMatch[2]}` });
      continue;
    }

    // Detect ALL-CAPS headings (at least 5 chars, no lowercase)
    if (/^[A-Z][A-Z\s&/,:-]{4,}$/.test(trimmed) && trimmed.length < 80) {
      currentSection.paragraphs.push({ type: "heading", text: trimmed });
      continue;
    }

    // Detect bullet points
    if (/^[\u2022\u2023\u25cf\u25cb\u2013\u2014•\-\*]\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[\u2022\u2023\u25cf\u25cb\u2013\u2014•\-\*]\s+/, "");
      currentSection.paragraphs.push({ type: "bullet", text: bulletText });
      continue;
    }

    // Detect bold markers: **text** or __text__
    // Regular paragraph
    currentSection.paragraphs.push({ type: "text", text: trimmed });
  }

  // Push final section
  if (currentSection.title || currentSection.paragraphs.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Create a styled .docx from proposal text and download it.
 * @param {string} text - The raw proposal text
 * @param {string} filename - Base filename (without extension)
 * @param {object} meta - { grantName, funder, orgName, date }
 */
export async function generateDocx(text, filename, meta = {}) {
  // Lazy import to avoid bundle bloat
  const [docxModule, fileSaverModule] = await Promise.all([
    import("docx"),
    import("file-saver"),
  ]);

  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    AlignmentType, BorderStyle, Footer, Header,
    PageBreak, Tab, TabStopType, TabStopPosition,
  } = docxModule;
  const { saveAs } = fileSaverModule;

  const sections = parseProposalText(text);
  const grantName = meta.grantName || filename || "Proposal";
  const funder = meta.funder || "";
  const orgName = meta.orgName || "d-lab NPC";
  const date = meta.date || new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

  // Build document children
  const children = [];

  // ── Title page ──
  children.push(
    new Paragraph({ spacing: { before: 600 } }),
    new Paragraph({
      children: [
        new TextRun({ text: orgName, bold: true, size: 20, color: NAVY, font: "Calibri" }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "", size: 2 }),
      ],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: D03228 },
      },
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: grantName, bold: true, size: 40, color: NAVY, font: "Calibri" }),
      ],
      spacing: { after: 160 },
    }),
  );

  if (funder) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Prepared for: ${funder}`, size: 24, color: "4B5563", font: "Calibri" }),
        ],
        spacing: { after: 80 },
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: date, size: 22, color: "6B7280", font: "Calibri", italics: true }),
      ],
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "", size: 2 }),
      ],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2E4EA" },
      },
      spacing: { after: 400 },
    }),
  );

  // ── Content sections ──
  for (const section of sections) {
    // Section title (if present)
    if (section.title) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: section.title, bold: true, size: 28, color: NAVY, font: "Calibri" }),
          ],
          spacing: { before: 400, after: 200 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: D03228 },
          },
        }),
      );
    }

    // Section paragraphs
    for (const p of section.paragraphs) {
      if (p.type === "break") {
        children.push(new Paragraph({ spacing: { before: 80 } }));
        continue;
      }

      if (p.type === "heading") {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: p.text, bold: true, size: 24, color: NAVY, font: "Calibri" }),
            ],
            spacing: { before: 280, after: 120 },
          }),
        );
        continue;
      }

      if (p.type === "bullet") {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: p.text, size: 22, color: "1F2937", font: "Calibri" }),
            ],
            bullet: { level: 0 },
            spacing: { before: 40, after: 40 },
          }),
        );
        continue;
      }

      // Regular text — detect inline bold markers **text**
      const runs = [];
      const parts = p.text.split(/(\*\*[^*]+\*\*)/g);
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: 22, color: "1F2937", font: "Calibri" }));
        } else if (part) {
          // Detect ZAR amounts and style them in mono
          const amountParts = part.split(/(R[\d,.\s]+(?:million|M|K)?)/g);
          for (const ap of amountParts) {
            if (/^R[\d,.\s]+/.test(ap)) {
              runs.push(new TextRun({ text: ap, size: 22, color: NAVY, font: "Consolas", bold: true }));
            } else if (ap) {
              runs.push(new TextRun({ text: ap, size: 22, color: "1F2937", font: "Calibri" }));
            }
          }
        }
      }

      if (runs.length > 0) {
        children.push(
          new Paragraph({
            children: runs,
            spacing: { before: 40, after: 40, line: 360 },
          }),
        );
      }
    }
  }

  // ── Build document ──
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22,
            color: "1F2937",
          },
          paragraph: {
            spacing: { line: 360 },
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440, // 1 inch
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: orgName, size: 16, color: "9CA3AF", font: "Calibri", italics: true }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `Confidential | ${orgName}`, size: 16, color: "9CA3AF", font: "Calibri" }),
              ],
              alignment: AlignmentType.CENTER,
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E2E4EA" },
              },
              spacing: { before: 100 },
            }),
          ],
        }),
      },
      children,
    }],
  });

  // Generate and save
  const blob = await Packer.toBlob(doc);
  const safeName = (filename || "proposal").replace(/[^a-zA-Z0-9_-]/g, "_");
  saveAs(blob, `${safeName}.docx`);
}

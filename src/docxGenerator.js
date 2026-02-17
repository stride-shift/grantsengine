/*
  docxGenerator.js — Generate professional .docx files from AI-generated proposals
  Uses the `docx` package for real Word documents with styled paragraphs,
  headers, footers, tables, and d-lab branding.

  Lazy-imported via dynamic import() to avoid bundle bloat.
*/

const RED = "D03228";
const NAVY = "1A1F36";
const GREY_800 = "1F2937";
const GREY_600 = "4B5563";
const GREY_400 = "9CA3AF";
const GREY_200 = "E5E7EB";
const GREY_50 = "F9FAFB";

/**
 * Parse AI-generated text into structured sections.
 * Detects COVER EMAIL / PROPOSAL markers, numbered headings, bullets, key-value pairs, paragraphs.
 */
function parseProposalText(text) {
  const sections = [];
  let currentSection = { title: null, paragraphs: [] };

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentSection.paragraphs.length > 0) {
        const last = currentSection.paragraphs[currentSection.paragraphs.length - 1];
        if (last.type !== "break") {
          currentSection.paragraphs.push({ type: "break" });
        }
      }
      continue;
    }

    // Skip separator lines
    if (/^={3,}/.test(trimmed) || /^\u2550{3,}/.test(trimmed) || /^-{3,}$/.test(trimmed)) {
      continue;
    }

    // Detect major section headers
    if (/^(COVER EMAIL|COVER LETTER|PROPOSAL|EXECUTIVE SUMMARY|BUDGET|APPENDIX|INTRODUCTION|CONCLUSION|METHODOLOGY|IMPLEMENTATION|IMPACT|SUSTAINABILITY|MONITORING|EVALUATION)/i.test(trimmed)) {
      if (currentSection.title || currentSection.paragraphs.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: trimmed, paragraphs: [] };
      continue;
    }

    // Detect "Subject:", "Dear", etc.
    if (/^(Subject|Re|Dear|To|From|Date|Ref):/i.test(trimmed)) {
      currentSection.paragraphs.push({ type: "field", text: trimmed });
      continue;
    }

    // Detect numbered headings: "1. Something" or "1) Something"
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numberedMatch && trimmed.length < 120) {
      currentSection.paragraphs.push({ type: "heading", text: `${numberedMatch[1]}. ${numberedMatch[2]}` });
      continue;
    }

    // Detect ALL-CAPS headings
    if (/^[A-Z][A-Z\s&/,:\-]{4,}$/.test(trimmed) && trimmed.length < 80) {
      currentSection.paragraphs.push({ type: "heading", text: trimmed });
      continue;
    }

    // Detect sub-headings with colons: "Key Deliverables:"
    if (/^[A-Z][a-zA-Z\s&/,]{2,30}:$/.test(trimmed)) {
      currentSection.paragraphs.push({ type: "subheading", text: trimmed.replace(/:$/, "") });
      continue;
    }

    // Detect bullet points
    if (/^[\u2022\u2023\u25cf\u25cb\u2013\u2014•\-\*]\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[\u2022\u2023\u25cf\u25cb\u2013\u2014•\-\*]\s+/, "");
      currentSection.paragraphs.push({ type: "bullet", text: bulletText });
      continue;
    }

    // Detect key-value pairs: "Label:  Value" with 2+ spaces
    const kvMatch = trimmed.match(/^(.{3,30}):\s{2,}(.+)$/);
    if (kvMatch && !trimmed.startsWith("http")) {
      currentSection.paragraphs.push({ type: "keyvalue", key: kvMatch[1].trim(), value: kvMatch[2].trim() });
      continue;
    }

    // Regular paragraph
    currentSection.paragraphs.push({ type: "text", text: trimmed });
  }

  if (currentSection.title || currentSection.paragraphs.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Build inline TextRun array from text, handling **bold**, ZAR amounts, and percentages.
 */
function buildRuns(docxModule, text, baseSize = 22, baseColor = GREY_800) {
  const { TextRun } = docxModule;
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: baseSize, color: NAVY, font: "Calibri" }));
    } else if (part) {
      // Detect ZAR amounts
      const segments = part.split(/(R\s?[\d,.\s]+(?:million|billion|M|K|m|k)?)/g);
      for (const seg of segments) {
        if (/^R\s?[\d,.\s]+/.test(seg)) {
          runs.push(new TextRun({ text: seg, size: baseSize, color: NAVY, font: "Consolas", bold: true }));
        } else if (/\d{2,3}%/.test(seg)) {
          // Highlight key percentages
          const pctParts = seg.split(/(\d{2,3}%)/g);
          for (const pp of pctParts) {
            if (/\d{2,3}%/.test(pp)) {
              runs.push(new TextRun({ text: pp, size: baseSize, color: RED, font: "Calibri", bold: true }));
            } else if (pp) {
              runs.push(new TextRun({ text: pp, size: baseSize, color: baseColor, font: "Calibri" }));
            }
          }
        } else if (seg) {
          runs.push(new TextRun({ text: seg, size: baseSize, color: baseColor, font: "Calibri" }));
        }
      }
    }
  }
  return runs;
}

/**
 * Create a styled .docx from proposal text and download it.
 * @param {string} text - The raw proposal text
 * @param {string} filename - Base filename (without extension)
 * @param {object} meta - { grantName, funder, orgName, date, ask, stage, type }
 */
export async function generateDocx(text, filename, meta = {}) {
  const [docxModule, fileSaverModule] = await Promise.all([
    import("docx"),
    import("file-saver"),
  ]);

  const {
    Document, Packer, Paragraph, TextRun,
    AlignmentType, BorderStyle, Footer, Header,
    Table, TableRow, TableCell, WidthType, ShadingType,
    PageNumber, SectionType, convertInchesToTwip,
  } = docxModule;
  const { saveAs } = fileSaverModule;

  const sections = parseProposalText(text);
  const grantName = meta.grantName || filename || "Proposal";
  const funder = meta.funder || "";
  const orgName = meta.orgName || "d-lab NPC";
  const date = meta.date || new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const ask = meta.ask || null;
  const grantType = meta.type || null;

  // Helper: no-border cell config
  const noBorders = {
    top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  };

  // ════════════════════════════════════
  //  COVER PAGE
  // ════════════════════════════════════
  const coverChildren = [];

  // Top spacer
  coverChildren.push(new Paragraph({ spacing: { before: 1200 } }));

  // Red accent bar
  coverChildren.push(new Paragraph({
    children: [new TextRun({ text: " ", size: 2 })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED } },
    spacing: { after: 600 },
  }));

  // Org name — spaced-out all-caps
  coverChildren.push(new Paragraph({
    children: [
      new TextRun({ text: orgName.toUpperCase(), bold: true, size: 24, color: RED, font: "Calibri", characterSpacing: 200 }),
    ],
    spacing: { after: 80 },
  }));

  // Title
  coverChildren.push(new Paragraph({
    children: [
      new TextRun({ text: grantName, bold: true, size: 52, color: NAVY, font: "Calibri" }),
    ],
    spacing: { after: 200 },
  }));

  // Thin divider
  coverChildren.push(new Paragraph({
    children: [new TextRun({ text: " ", size: 2 })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GREY_200 } },
    spacing: { after: 400 },
  }));

  // Meta info table
  const metaRows = [];
  if (funder) metaRows.push({ label: "Prepared for", value: funder });
  metaRows.push({ label: "Date", value: date });
  if (ask) metaRows.push({ label: "Funding request", value: typeof ask === "number" ? `R${ask.toLocaleString()}` : String(ask) });
  if (grantType) metaRows.push({ label: "Funder type", value: grantType });
  metaRows.push({ label: "Submitted by", value: orgName });

  coverChildren.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: metaRows.map(r => new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({ text: r.label, size: 20, color: GREY_400, font: "Calibri" })],
            spacing: { before: 60, after: 60 },
          })],
          borders: noBorders,
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({
              text: r.value,
              size: 22,
              color: NAVY,
              font: r.label === "Funding request" ? "Consolas" : "Calibri",
              bold: r.label === "Funding request" || r.label === "Prepared for",
            })],
            spacing: { before: 60, after: 60 },
          })],
          borders: noBorders,
        }),
      ],
    })),
  }));

  // Bottom spacer + confidential notice
  coverChildren.push(
    new Paragraph({ spacing: { before: 1400 } }),
    new Paragraph({
      children: [new TextRun({ text: " ", size: 2 })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GREY_200 } },
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "CONFIDENTIAL", bold: true, size: 16, color: GREY_400, font: "Calibri", characterSpacing: 150 }),
        new TextRun({ text: "  |  This document is confidential and intended solely for the named recipient.", size: 16, color: GREY_400, font: "Calibri" }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  );

  // ════════════════════════════════════
  //  CONTENT PAGES
  // ════════════════════════════════════
  const contentChildren = [];

  let sectionIdx = 0;
  for (const section of sections) {
    sectionIdx++;

    // Section title with red accent
    if (section.title) {
      if (sectionIdx > 1) {
        contentChildren.push(new Paragraph({ spacing: { before: 200 } }));
      }

      contentChildren.push(new Paragraph({
        children: [new TextRun({ text: " ", size: 2 })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RED } },
        spacing: { after: 120 },
      }));

      contentChildren.push(new Paragraph({
        children: [
          new TextRun({ text: section.title, bold: true, size: 28, color: NAVY, font: "Calibri" }),
        ],
        spacing: { before: 80, after: 240 },
      }));
    }

    // Collect consecutive key-value pairs for table rendering
    let kvBuffer = [];

    const flushKV = () => {
      if (kvBuffer.length === 0) return;
      contentChildren.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: GREY_200 },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: GREY_200 },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: GREY_200 },
          insideVertical: { style: BorderStyle.NONE },
        },
        rows: kvBuffer.map(kv => new TableRow({
          children: [
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.SOLID, color: GREY_50, fill: GREY_50 },
              children: [new Paragraph({
                children: [new TextRun({ text: kv.key, bold: true, size: 20, color: GREY_600, font: "Calibri" })],
                spacing: { before: 80, after: 80 },
              })],
              borders: {
                left: { style: BorderStyle.SINGLE, size: 6, color: RED },
                right: { style: BorderStyle.NONE },
              },
            }),
            new TableCell({
              width: { size: 65, type: WidthType.PERCENTAGE },
              children: [new Paragraph({
                children: buildRuns(docxModule, kv.value, 22, GREY_800),
                spacing: { before: 80, after: 80 },
              })],
              borders: { left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            }),
          ],
        })),
      }));
      contentChildren.push(new Paragraph({ spacing: { before: 120 } }));
      kvBuffer = [];
    };

    for (const p of section.paragraphs) {
      if (p.type === "keyvalue") {
        kvBuffer.push(p);
        continue;
      }
      flushKV();

      if (p.type === "break") {
        contentChildren.push(new Paragraph({ spacing: { before: 80 } }));
        continue;
      }

      if (p.type === "heading") {
        contentChildren.push(new Paragraph({
          children: [
            new TextRun({ text: p.text, bold: true, size: 24, color: NAVY, font: "Calibri" }),
          ],
          spacing: { before: 320, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: GREY_200 } },
        }));
        continue;
      }

      if (p.type === "subheading") {
        contentChildren.push(new Paragraph({
          children: [
            new TextRun({ text: p.text.toUpperCase(), bold: true, size: 18, color: RED, font: "Calibri", characterSpacing: 80 }),
          ],
          spacing: { before: 240, after: 80 },
        }));
        continue;
      }

      if (p.type === "field") {
        const colonIdx = p.text.indexOf(":");
        if (colonIdx > 0) {
          const label = p.text.slice(0, colonIdx + 1);
          const value = p.text.slice(colonIdx + 1).trim();
          contentChildren.push(new Paragraph({
            children: [
              new TextRun({ text: label + " ", bold: true, size: 22, color: GREY_600, font: "Calibri" }),
              new TextRun({ text: value, size: 22, color: GREY_800, font: "Calibri" }),
            ],
            spacing: { before: 40, after: 40 },
          }));
        } else {
          contentChildren.push(new Paragraph({
            children: [new TextRun({ text: p.text, size: 22, color: GREY_800, font: "Calibri" })],
            spacing: { before: 40, after: 40 },
          }));
        }
        continue;
      }

      if (p.type === "bullet") {
        contentChildren.push(new Paragraph({
          children: buildRuns(docxModule, p.text, 22, GREY_800),
          bullet: { level: 0 },
          spacing: { before: 40, after: 40, line: 340 },
        }));
        continue;
      }

      // Regular text
      const runs = buildRuns(docxModule, p.text, 22, GREY_800);
      if (runs.length > 0) {
        contentChildren.push(new Paragraph({
          children: runs,
          spacing: { before: 60, after: 60, line: 360 },
        }));
      }
    }

    flushKV();
  }

  // ════════════════════════════════════
  //  BUILD DOCUMENT
  // ════════════════════════════════════
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: GREY_800 },
          paragraph: { spacing: { line: 360 } },
        },
      },
    },
    sections: [
      // Cover page — no header/footer
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1.2),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(1.2),
            },
          },
        },
        children: coverChildren,
      },
      // Content — with branded header + page numbers
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1.2),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(1.2),
            },
            pageNumbers: { start: 1 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: orgName, size: 16, color: RED, font: "Calibri", bold: true }),
                  new TextRun({ text: `  \u00b7  ${grantName}`, size: 16, color: GREY_400, font: "Calibri" }),
                ],
                alignment: AlignmentType.LEFT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: GREY_200 } },
                spacing: { after: 200 },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Confidential", size: 16, color: GREY_400, font: "Calibri", italics: true }),
                  new TextRun({ text: `  \u00b7  ${orgName}  \u00b7  Page `, size: 16, color: GREY_400, font: "Calibri" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY_400, font: "Calibri" }),
                ],
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 1, color: GREY_200 } },
                spacing: { before: 200 },
              }),
            ],
          }),
        },
        children: contentChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = (filename || "proposal").replace(/[^a-zA-Z0-9_-]/g, "_");
  saveAs(blob, `${safeName}.docx`);
}

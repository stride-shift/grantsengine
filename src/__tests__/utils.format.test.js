import { describe, it, expect } from "vitest";
import { fmtR } from "../utils";

// CHARACTERIZATION: fmtR was duplicated in BudgetBuilder.jsx (`n ? \`R${n.toLocaleString()}\` : "R0"`)
// and SectionCard.jsx (`\`R${(n || 0).toLocaleString()}\``). Both produced identical output for all
// realistic inputs; consolidated to one canonical helper in utils.js. These cases pin that behaviour.
describe("fmtR (full ZAR amount)", () => {
  it("formats positive numbers with thousands separators", () => {
    expect(fmtR(1234567)).toBe("R1,234,567");
    expect(fmtR(516000)).toBe("R516,000");
    expect(fmtR(1)).toBe("R1");
  });

  it("maps every falsy input to R0", () => {
    expect(fmtR(0)).toBe("R0");
    expect(fmtR(null)).toBe("R0");
    expect(fmtR(undefined)).toBe("R0");
    expect(fmtR(NaN)).toBe("R0");
    expect(fmtR("")).toBe("R0");
  });

  it("handles negatives and decimals like Number.toLocaleString", () => {
    expect(fmtR(-500)).toBe("R-500");
    expect(fmtR(1234.5)).toBe("R1,234.5");
  });
});

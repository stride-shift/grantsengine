import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// SMOKE TEST for the render net (Phase 4.5 step 1). Proves jsdom + @testing-library/react
// + jest-dom matchers + JSX transform all work end-to-end. Not tied to app code; if a
// real component test fails, this still passing tells us the harness itself is sound.
describe("render-net harness", () => {
  it("renders JSX into jsdom and queries it", () => {
    render(<button type="button">Add grant</button>);
    expect(screen.getByRole("button", { name: "Add grant" })).toBeInTheDocument();
  });
});

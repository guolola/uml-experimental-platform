// Verifies generation planning keeps design dependencies ordered before downstream models.
import { describe, expect, it } from "vitest";
import { resolveDesignGenerationDiagrams } from "./generation-planning";

describe("resolveDesignGenerationDiagrams", () => {
  it("orders generated design dependencies before deployment", () => {
    const plan = resolveDesignGenerationDiagrams(["deployment"], []);

    expect(plan.effectiveDiagrams).toEqual([
      "sequence",
      "class",
      "component",
      "deployment",
    ]);
    expect(plan.dependencyDiagrams).toEqual(["sequence", "class", "component"]);
  });

  it("keeps all-selected design diagrams in dependency-safe order", () => {
    const plan = resolveDesignGenerationDiagrams(
      ["deployment", "component", "class", "sequence"],
      [],
    );

    expect(plan.effectiveDiagrams).toEqual([
      "sequence",
      "class",
      "component",
      "deployment",
    ]);
    expect(plan.dependencyDiagrams).toEqual([]);
  });
});

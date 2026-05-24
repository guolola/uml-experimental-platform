import { render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";
import {
  DEFAULT_USER_SETTINGS,
  saveUserSettings,
  USER_SETTINGS_STORAGE_KEY,
} from "../../shared/lib/user-settings";

describe("ThemeProvider", () => {
  it("uses the Figma light and dark theme tokens", () => {
    const themeCss = readFileSync("src/app/styles/theme.css", "utf-8");

    expect(themeCss).toContain("--background: #f8f9ff;");
    expect(themeCss).toContain("--foreground: #0b1c30;");
    expect(themeCss).toContain("--primary: #4441c4;");
    expect(themeCss).toContain("--sidebar-primary: #4441c4;");
    expect(themeCss).toContain("--accent: #e5eeff;");
    expect(themeCss).toContain("--input-background: #eff4ff;");

    expect(themeCss).toContain("--background: #0f1117;");
    expect(themeCss).toContain("--sidebar: #161b22;");
    expect(themeCss).toContain("--primary: #3b82f6;");
    expect(themeCss).toContain("--border: #30363d;");
  });

  it("applies saved font size and updates it when settings change", async () => {
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_USER_SETTINGS,
        fontSize: "sm",
      }),
    );

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--font-size")).toBe("14px");
    });

    saveUserSettings({
      ...DEFAULT_USER_SETTINGS,
      fontSize: "lg",
    });

    expect(document.documentElement.style.getPropertyValue("--font-size")).toBe("16px");
  });
});

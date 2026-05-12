import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";
import {
  DEFAULT_USER_SETTINGS,
  saveUserSettings,
  USER_SETTINGS_STORAGE_KEY,
} from "../../shared/lib/user-settings";

describe("ThemeProvider", () => {
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

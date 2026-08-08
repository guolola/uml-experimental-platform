// Verifies public authentication page submissions navigate to the expected next route.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../app/providers/i18n-provider";
import { i18n } from "../../../shared/i18n";
import { AuthPage } from "./auth-page";

afterEach(async () => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
  await i18n.changeLanguage("zh-CN");
});

it("redirects to login after resetting a password from a reset link", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/reset-password?token=reset-token");
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onNavigate = vi.fn();
  const user = userEvent.setup();

  render(
    <AppI18nProvider>
      <AuthPage path="/reset-password" onNavigate={onNavigate} />
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("新密码"), "new-password-123");
  await user.click(screen.getByRole("button", { name: "重置密码" }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/reset-password"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "reset-token", newPassword: "new-password-123" }),
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/login");
  });
});

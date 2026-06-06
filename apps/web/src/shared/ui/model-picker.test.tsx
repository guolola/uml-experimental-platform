// Verifies model picker vendor grouping for catalog and provider-managed models.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  USER_SETTINGS_STORAGE_KEY,
  type UserSettings,
} from "../lib/user-settings";
import { ModelPicker } from "./model-picker";

function seedSettings(patch: Partial<UserSettings>) {
  localStorage.setItem(
    USER_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      providerConfigId: "",
      providerLabel: "",
      providerModelOptions: [],
      defaultModel: "gpt-5.4",
      imageModel: "gpt-image-2",
      fontSize: "md",
      autoGenerate: false,
      showStaleBanner: true,
      ...patch,
    }),
  );
}

describe("ModelPicker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the static catalog grouped by first-level vendor", async () => {
    const user = userEvent.setup();

    render(<ModelPicker value="gpt-5.4" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /OpenAI · GPT 5\.4/u }));

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.queryByTitle("claude-opus-4-7")).not.toBeInTheDocument();

    await user.hover(screen.getByText("OpenAI"));

    expect(await screen.findByTitle("gpt-5.4")).toBeInTheDocument();
  });

  it("groups provider-managed catalog and prefixed models by vendor", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    seedSettings({
      providerConfigId: "provider-system-siliconflow",
      providerLabel: "SiliconFlow",
      providerModelOptions: [
        "deepseek-ai/DeepSeek-V4-Pro",
        "deepseek-ai/DeepSeek-V4-Flash",
        "Pro/moonshotai/Kimi-K2.6",
        "Pro/zai-org/GLM-5.1",
        "Pro/MiniMaxAI/MiniMax-M2.5",
        "Qwen/Qwen3.6-35B-A3B",
        "gpt-5.4",
      ],
      defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    });

    render(
      <ModelPicker
        value="deepseek-ai/DeepSeek-V4-Pro"
        onValueChange={onValueChange}
      />,
    );

    const providerTrigger = screen.getByRole("button", { name: "DeepSeek-V4-Pro" });
    expect(providerTrigger).toHaveClass("h-9");
    expect(providerTrigger).not.toHaveTextContent("托管");
    await user.click(providerTrigger);

    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("Kimi")).toBeInTheDocument();
    expect(screen.getByText("智谱")).toBeInTheDocument();
    expect(screen.getByText("Minimax")).toBeInTheDocument();
    expect(screen.getByText("Qwen")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.queryByTitle("Qwen/Qwen3.6-35B-A3B")).not.toBeInTheDocument();

    await user.hover(screen.getByText("DeepSeek"));
    expect(await screen.findByTitle("deepseek-ai/DeepSeek-V4-Pro")).toBeInTheDocument();
    expect(await screen.findByTitle("deepseek-ai/DeepSeek-V4-Flash")).toBeInTheDocument();

    await user.hover(screen.getByText("Kimi"));
    expect(await screen.findByTitle("Pro/moonshotai/Kimi-K2.6")).toBeInTheDocument();

    await user.hover(screen.getByText("智谱"));
    expect(await screen.findByTitle("Pro/zai-org/GLM-5.1")).toBeInTheDocument();

    await user.hover(screen.getByText("Minimax"));
    expect(await screen.findByTitle("Pro/MiniMaxAI/MiniMax-M2.5")).toBeInTheDocument();

    await user.hover(screen.getByText("Qwen"));
    expect(await screen.findByTitle("Qwen/Qwen3.6-35B-A3B")).toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("falls back to the managed provider label for unknown model prefixes", async () => {
    const user = userEvent.setup();
    seedSettings({
      providerConfigId: "provider-system-siliconflow",
      providerLabel: "SiliconFlow",
      providerModelOptions: ["vendorless-ultra-model"],
      defaultModel: "vendorless-ultra-model",
    });

    render(<ModelPicker value="vendorless-ultra-model" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "vendorless-ultra-model" }));
    expect(screen.getByText("SiliconFlow")).toBeInTheDocument();

    await user.hover(screen.getByText("SiliconFlow"));

    expect(await screen.findByTitle("vendorless-ultra-model")).toBeInTheDocument();
  });
});

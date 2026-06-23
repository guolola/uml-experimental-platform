// Verifies model picker vendor grouping for catalog and provider-managed models.
import { fireEvent, render, screen, within } from "@testing-library/react";
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
      providerModelCapabilities: {},
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

  it("shows an empty managed-provider state instead of the static catalog", async () => {
    const user = userEvent.setup();

    render(<ModelPicker value="gpt-5.4" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "未选择模型" }));

    expect(screen.getByText("请先选择托管 Provider")).toBeInTheDocument();
    expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude")).not.toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
    expect(screen.queryByText("DeepSeek")).not.toBeInTheDocument();
    expect(screen.queryByTitle("claude-opus-4-7")).not.toBeInTheDocument();
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
      providerModelCapabilities: {
        "deepseek-ai/DeepSeek-V4-Pro": {
          id: "deepseek-ai/DeepSeek-V4-Pro",
          supportsJsonSchema: true,
        },
        "deepseek-ai/DeepSeek-V4-Flash": {
          id: "deepseek-ai/DeepSeek-V4-Flash",
          supportsJsonSchema: false,
        },
      },
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
    const deepseekPro = await screen.findByTitle("deepseek-ai/DeepSeek-V4-Pro");
    const deepseekFlash = await screen.findByTitle("deepseek-ai/DeepSeek-V4-Flash");
    expect(deepseekPro.closest("[data-slot='dropdown-menu-sub-content']")).toHaveClass(
      "max-h-72",
      "overflow-y-auto",
    );
    expect(within(deepseekPro).getByText("DeepSeek-V4-Pro")).toBeInTheDocument();
    expect(within(deepseekPro).getByText("严格结构化")).toBeInTheDocument();
    expect(within(deepseekPro).queryByText("deepseek-ai/DeepSeek-V4-Pro")).not.toBeInTheDocument();
    expect(within(deepseekFlash).getByText("DeepSeek-V4-Flash")).toBeInTheDocument();
    expect(within(deepseekFlash).queryByText("严格结构化")).not.toBeInTheDocument();
    expect(within(deepseekFlash).queryByText("deepseek-ai/DeepSeek-V4-Flash")).not.toBeInTheDocument();

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

  it("selects provider-managed models by their full model id", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    seedSettings({
      providerConfigId: "provider-system-siliconflow",
      providerLabel: "SiliconFlow",
      providerModelOptions: [
        "deepseek-ai/DeepSeek-V4-Pro",
        "deepseek-ai/DeepSeek-V4-Flash",
      ],
      defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    });

    render(
      <ModelPicker
        value="deepseek-ai/DeepSeek-V4-Pro"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "DeepSeek-V4-Pro" }));
    await user.hover(screen.getByText("DeepSeek"));
    const item = await screen.findByTitle("deepseek-ai/DeepSeek-V4-Flash");
    fireEvent.pointerDown(item, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(item, { button: 0, ctrlKey: false });
    fireEvent.click(item);

    expect(onValueChange).toHaveBeenCalledWith("deepseek-ai/DeepSeek-V4-Flash");
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

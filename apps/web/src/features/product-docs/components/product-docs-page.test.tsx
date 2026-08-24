// Verifies the modular in-app product documentation center behavior.
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductDocsPage } from "./product-docs-page";
import {
  PRODUCT_DOC_ARTICLES,
  PRODUCT_DOC_CATEGORIES,
  getProductDocArticles,
  getProductDocCategories,
} from "../model/docs-content";

const PUBLIC_DIRECTORY = resolve(process.cwd(), "public");

describe("ProductDocsPage", () => {
  it("shows the project-local quick start article by default", () => {
    render(<ProductDocsPage />);

    expect(
      screen.getByRole("heading", { name: "软件工程实践平台使用手册" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快速开始" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "普通用户完整操作路径" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("搜索使用文档")).toBeInTheDocument();
    const quickStartVideo = screen.getByLabelText("快速开始项目演示视频");
    expect(quickStartVideo).toBeInTheDocument();
    expect(quickStartVideo.querySelector("source")).toHaveAttribute(
      "src",
      "https://guolola.oss-cn-hangzhou.aliyuncs.com/video/%E9%A1%B9%E7%9B%AE%E6%BC%94%E7%A4%BA.mp4",
    );
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    for (const category of PRODUCT_DOC_CATEGORIES) {
      expect(screen.getByRole("heading", { name: category.label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: /模型详情页、元素列表与追踪矩阵/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /推荐模型/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /配置 Provider/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /可行性分析：系统上下文图（系统环境图）、实现方案与研究报告/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /生成权益、购买与订单处理/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /生成、渲染与修复排障/u }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "模型配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "模型配置" })).not.toBeInTheDocument();
    expect(screen.queryByText("完整飞书文档整理中")).not.toBeInTheDocument();
  });

  it("switches articles from the documentation sidebar", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);

    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });
    await user.click(
      within(sidebar).getByRole("button", { name: /项目首页与项目创建/u }),
    );

    expect(
      screen.getByRole("heading", { name: "项目首页与项目创建" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "输入示例", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getAllByAltText("创建项目表单截图")[0]).toHaveAttribute(
      "src",
      "/help/images/docs-project-create.png",
    );
  });

  it("filters documentation by title, summary, tags, artifacts, and markdown content", async () => {
    render(<ProductDocsPage />);

    const searchInput = screen.getByLabelText("搜索使用文档");
    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });

    fireEvent.change(searchInput, { target: { value: "AI 修复" } });
    expect(screen.getByText("搜索结果")).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: /需求输入、规则确认与 AI 修复/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "模型详情页" } });
    expect(
      within(sidebar).getByRole("button", { name: /模型详情页、元素列表与追踪矩阵/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "追踪矩阵" } });
    expect(
      within(sidebar).getByRole("button", { name: /模型详情页、元素列表与追踪矩阵/u }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: /需求到设计的追踪链路/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "PlantUML" } });
    expect(
      within(sidebar).getByRole("button", { name: /需求 UML 模型与图表查看/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "推荐模型" } });
    expect(
      within(sidebar).getByRole("button", { name: /推荐模型/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Provider" } });
    expect(
      within(sidebar).getByRole("button", { name: /配置 Provider/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "说明书版本" } });
    expect(
      within(sidebar).getByRole("button", { name: /说明书生成、样式、版本与下载/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "五类结论" } });
    expect(
      within(sidebar).getByRole("button", { name: /可行性分析：系统上下文图（系统环境图）、实现方案与研究报告/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "继续支付" } });
    expect(
      within(sidebar).getByRole("button", { name: /生成权益、购买与订单处理/u }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when search has no matches", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);

    await user.type(screen.getByLabelText("搜索使用文档"), "完全不存在的关键词");

    expect(screen.getByText("没有找到匹配文档。", { exact: false })).toBeInTheDocument();
  });

  it("builds an H2 and H3 outline for the selected markdown article", () => {
    render(<ProductDocsPage />);

    expect(
      screen.getByRole("link", { name: "适用场景" }),
    ).toHaveAttribute("href", "#适用场景");
    expect(
      screen.getByRole("link", { name: "映射关系" }),
    ).toHaveAttribute("href", "#映射关系");
  });

  it("wraps long sidebar entries instead of truncating them", () => {
    render(<ProductDocsPage />);

    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });
    const longTitle = within(sidebar).getByText("模型详情页、元素列表与追踪矩阵");
    expect(longTitle).toHaveClass("break-words");
    expect(longTitle).not.toHaveClass("truncate");
    expect(longTitle).not.toHaveClass("line-clamp-2");
  });

  it("scrolls to the selected heading from the on-this-page outline", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);

    const targetHeading = screen.getByRole("heading", {
      name: "适用场景",
      level: 2,
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(targetHeading, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    await user.click(screen.getByRole("link", { name: "适用场景" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("renders markdown images and navigates app links through the shell callback", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ProductDocsPage onNavigate={onNavigate} />);

    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });
    await user.click(
      within(sidebar).getByRole("button", { name: /代码原型生成与预览/u }),
    );

    expect(screen.getAllByAltText("代码文件树和预览截图")[0]).toHaveAttribute(
      "src",
      "/help/images/docs-code-preview.png",
    );

    await user.click(screen.getByRole("button", { name: "进入项目" }));
    expect(onNavigate).toHaveBeenCalledWith("/projects");
  });

  it("navigates markdown local links through the shell callback", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ProductDocsPage onNavigate={onNavigate} />);

    await user.click(screen.getAllByRole("link", { name: "项目首页" })[0]);

    expect(onNavigate).toHaveBeenCalledWith("/projects");
  });

  it("keeps every manifest article attached to a local docs screenshot", () => {
    for (const article of PRODUCT_DOC_ARTICLES) {
      expect(article.screenshot, article.id).toBeDefined();
      expect(article.screenshot?.src, article.id).toMatch(
        /^\/help\/images\/docs-[a-z0-9-]+\.png$/u,
      );
      expect(article.screenshot?.alt, article.id).toBeTruthy();
      expect(article.screenshot?.caption, article.id).toBeTruthy();
      const screenshotPath = article.screenshot?.src.replace(/^\//u, "");
      expect(screenshotPath, article.id).toBeTruthy();
      const absolutePath = resolve(PUBLIC_DIRECTORY, screenshotPath!);
      expect(existsSync(absolutePath), article.id).toBe(true);
      expect(statSync(absolutePath).size, article.id).toBeGreaterThan(0);
    }
  });

  it("keeps every inline docs image attached to a non-empty local asset", () => {
    for (const article of PRODUCT_DOC_ARTICLES) {
      const imagePaths = [...article.content.matchAll(/\]\((\/help\/images\/[^)]+)\)/gu)]
        .map((match) => match[1]);
      for (const imagePath of imagePaths) {
        const relativePath = imagePath.replace(/^\//u, "");
        const absolutePath = resolve(PUBLIC_DIRECTORY, relativePath);
        expect(existsSync(absolutePath), `${article.id}: ${imagePath}`).toBe(true);
        expect(statSync(absolutePath).size, `${article.id}: ${imagePath}`).toBeGreaterThan(0);
      }
    }
  });

  it("localizes the new feasibility and billing navigation metadata", () => {
    expect(getProductDocCategories("en").map((category) => category.label)).toContain(
      "Feasibility analysis",
    );
    const englishArticles = getProductDocArticles("en");
    expect(englishArticles.find((article) => article.id === "feasibility-analysis")).toMatchObject({
      title:
        "Feasibility analysis: System Context Diagram (System Environment Diagram), implementation plan, and report",
      categoryLabel: "Feasibility analysis",
    });
    expect(englishArticles.find((article) => article.id === "billing-entitlements")?.content)
      .toContain("Generation credits");
  });

  it("attaches the quick start tutorial video to the first article", () => {
    const quickStart = PRODUCT_DOC_ARTICLES.find((article) => article.id === "quick-start");

    expect(quickStart?.video).toMatchObject({
      title: "快速开始项目演示视频",
      src: "https://guolola.oss-cn-hangzhou.aliyuncs.com/video/%E9%A1%B9%E7%9B%AE%E6%BC%94%E7%A4%BA.mp4",
    });
  });

  it("does not include the removed standalone model settings route in markdown links", () => {
    for (const article of PRODUCT_DOC_ARTICLES) {
      expect(article.content, article.id).not.toContain("/settings/models");
    }
  });
});

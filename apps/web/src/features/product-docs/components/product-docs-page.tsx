// Composes the in-app documentation center from modular docs data, search, and article panels.
import { useMemo, useState } from "react";
import { ArrowRight, BookOpenCheck, FolderOpen } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ScaleToFitFrame } from "../../../shared/ui/scale-to-fit";
import { PRODUCT_DOC_ARTICLES, PRODUCT_DOC_CATEGORIES } from "../model/docs-content";
import {
  extractMarkdownHeadings,
  searchProductDocs,
} from "../lib/docs-markdown";
import { DocsArticleView } from "./docs-article-view";
import { DocsOnThisPage } from "./docs-on-this-page";
import { DocsSidebar } from "./docs-sidebar";

type ProductDocsPageProps = {
  onNavigate?: (route: string) => void;
};

export function ProductDocsPage({ onNavigate }: ProductDocsPageProps) {
  const [selectedArticleId, setSelectedArticleId] = useState(PRODUCT_DOC_ARTICLES[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const selectedArticle =
    PRODUCT_DOC_ARTICLES.find((article) => article.id === selectedArticleId) ??
    PRODUCT_DOC_ARTICLES[0];
  const searchResults = useMemo(
    () => searchProductDocs(PRODUCT_DOC_ARTICLES, searchQuery),
    [searchQuery],
  );
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedArticle.content),
    [selectedArticle.content],
  );

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-4xl">
            <Badge variant="info" className="mb-3">
              项目内使用文档
            </Badge>
            <h1 className="break-words font-display text-3xl font-semibold leading-tight tracking-normal md:text-5xl">
              软件工程实践平台使用手册
            </h1>
            <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-muted-foreground md:text-base">
              面向普通用户，把项目创建、需求建模、UML、设计、代码原型、测试、说明书和排障收进项目内，不再依赖外部知识库入口。
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              type="button"
              className="h-10"
              onClick={() => onNavigate?.("/projects")}
            >
              <FolderOpen className="size-4" />
              进入项目
            </Button>
          </div>
        </section>

        <ScaleToFitFrame
          minWidth={980}
          contentClassName="grid min-h-0 w-full grid-cols-[292px_minmax(0,1fr)] gap-5 xl:grid-cols-[292px_minmax(0,1fr)_250px]"
        >
          <DocsSidebar
            articles={PRODUCT_DOC_ARTICLES}
            categories={PRODUCT_DOC_CATEGORIES}
            searchQuery={searchQuery}
            searchResults={searchResults}
            selectedArticleId={selectedArticle.id}
            onSearchQueryChange={setSearchQuery}
            onSelectArticle={setSelectedArticleId}
          />

          <DocsArticleView
            article={selectedArticle}
            headings={headings}
            onNavigate={onNavigate}
          />

          <DocsOnThisPage headings={headings} />
        </ScaleToFitFrame>

        <section className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <BookOpenCheck className="size-4 text-primary" />
            文档内容随项目代码维护，截图和路径以当前版本为准。
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            onClick={() => setSelectedArticleId(PRODUCT_DOC_ARTICLES[0]?.id ?? selectedArticle.id)}
          >
            回到快速开始
            <ArrowRight className="size-4" />
          </button>
        </section>
      </div>
    </main>
  );
}

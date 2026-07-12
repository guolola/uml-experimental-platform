// Composes the in-app documentation center from modular docs data, search, and article panels.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpenCheck, FolderOpen } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ScaleToFitFrame } from "../../../shared/ui/scale-to-fit";
import { i18n as appI18n } from "../../../shared/i18n";
import { getProductDocArticles, getProductDocCategories } from "../model/docs-content";
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
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.title") ? translate : appI18n.t.bind(appI18n);
  const locale = i18n.resolvedLanguage === "en" || i18n.language === "en" ? "en" : "zh-CN";
  const articles = useMemo(() => getProductDocArticles(locale), [locale]);
  const categories = useMemo(() => getProductDocCategories(locale), [locale]);
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const selectedArticle =
    articles.find((article) => article.id === selectedArticleId) ??
    articles[0];
  const searchResults = useMemo(
    () => searchProductDocs(articles, searchQuery),
    [articles, searchQuery],
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
              {t("docs.badge")}
            </Badge>
            <h1 className="break-words font-display text-3xl font-semibold leading-tight tracking-normal md:text-5xl">
              {t("docs.title")}
            </h1>
            <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-muted-foreground md:text-base">
              {t("docs.description")}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              type="button"
              className="h-10"
              onClick={() => onNavigate?.("/projects")}
            >
              <FolderOpen className="size-4" />
              {t("docs.openProjects")}
            </Button>
          </div>
        </section>

        <ScaleToFitFrame
          minWidth={980}
          contentClassName="grid min-h-0 w-full grid-cols-[292px_minmax(0,1fr)] gap-5 xl:grid-cols-[292px_minmax(0,1fr)_250px]"
        >
          <DocsSidebar
            articles={articles}
            categories={categories}
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
            {t("docs.maintainedNotice")}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            onClick={() => setSelectedArticleId(articles[0]?.id ?? selectedArticle.id)}
          >
            {t("docs.backToQuickStart")}
            <ArrowRight className="size-4" />
          </button>
        </section>
      </div>
    </main>
  );
}

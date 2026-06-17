// Owns documentation navigation, category grouping, and search result selection.
import { BookOpen, FileText, Search } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { cn } from "../../../shared/ui/utils";
import type {
  ProductDocArticle,
  ProductDocCategory,
} from "../model/docs-content";
import type { ProductDocSearchResult } from "../lib/docs-markdown";

type DocsSidebarProps = {
  articles: readonly ProductDocArticle[];
  categories: readonly ProductDocCategory[];
  searchQuery: string;
  searchResults: readonly ProductDocSearchResult[];
  selectedArticleId: string;
  onSearchQueryChange: (query: string) => void;
  onSelectArticle: (articleId: string) => void;
};

export function DocsSidebar({
  articles,
  categories,
  searchQuery,
  searchResults,
  selectedArticleId,
  onSearchQueryChange,
  onSelectArticle,
}: DocsSidebarProps) {
  const trimmedQuery = searchQuery.trim();
  const visibleArticles = trimmedQuery
    ? searchResults.map((result) => result.article)
    : articles;

  return (
    <aside
      aria-label="使用文档目录"
      className="min-w-0 overflow-x-hidden rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
    >
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-primary" />
        <h2 className="text-base font-semibold">文档目录</h2>
      </div>

      <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="product-docs-search">
        搜索使用文档
      </label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="product-docs-search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="搜索需求、说明书、模型配置..."
          className="pl-9"
        />
      </div>

      {trimmedQuery ? (
        <div className="mt-4 grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              搜索结果
            </span>
            <Badge variant="outline">{searchResults.length} 条</Badge>
          </div>
          {visibleArticles.length > 0 ? (
            visibleArticles.map((article) => (
              <ArticleButton
                key={article.id}
                article={article}
                active={article.id === selectedArticleId}
                onSelect={() => onSelectArticle(article.id)}
              />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-border p-3 text-sm leading-6 text-muted-foreground">
              没有找到匹配文档。可以换一个关键词，例如“生成失败”“导出”或“项目成员”。
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {categories.map((category) => {
            const categoryArticles = articles.filter(
              (article) => article.category === category.id,
            );
            return (
              <section key={category.id} aria-labelledby={`docs-category-${category.id}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3
                    id={`docs-category-${category.id}`}
                    className="min-w-0 break-words text-xs font-semibold text-muted-foreground"
                  >
                    {category.label}
                  </h3>
                  <Badge variant="outline">{categoryArticles.length}</Badge>
                </div>
                <div className="grid gap-1.5">
                  {categoryArticles.map((article) => (
                    <ArticleButton
                      key={article.id}
                      article={article}
                      active={article.id === selectedArticleId}
                      onSelect={() => onSelectArticle(article.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function ArticleButton({
  article,
  active,
  onSelect,
}: {
  article: ProductDocArticle;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-current={active ? "page" : undefined}
      className={cn(
        "h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-md px-3 py-2 text-left",
        active && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
      )}
      onClick={onSelect}
    >
      <FileText className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-normal">
        <span className="block break-words text-sm font-semibold leading-5">
          {article.title}
        </span>
        <span className="mt-1 block break-words whitespace-normal text-xs leading-5 text-muted-foreground">
          {article.summary}
        </span>
      </span>
    </Button>
  );
}

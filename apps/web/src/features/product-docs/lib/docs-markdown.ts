// Provides Markdown heading extraction, search indexing, and app-link classification for product docs.
import type { ProductDocArticle } from "../model/docs-content";

export type ProductDocHeading = {
  id: string;
  level: 1 | 2 | 3;
  title: string;
};

export type ProductDocSearchResult = {
  article: ProductDocArticle;
  score: number;
  matchedText: string;
};

const HEADING_PATTERN = /^(#{1,3})\s+(.+)$/gm;

export function extractMarkdownHeadings(markdown: string): ProductDocHeading[] {
  const slugs = new Map<string, number>();
  return [...markdown.matchAll(HEADING_PATTERN)].map((match) => {
    const level = match[1].length as 1 | 2 | 3;
    const title = stripInlineMarkdown(match[2]);
    return {
      id: slugifyMarkdownHeading(title, slugs),
      level,
      title,
    };
  });
}

export function slugifyMarkdownHeading(
  value: string,
  usedSlugs = new Map<string, number>(),
) {
  const base =
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .replace(/\s+/gu, "-")
      .replace(/-+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 72) || "section";
  const currentCount = usedSlugs.get(base) ?? 0;
  usedSlugs.set(base, currentCount + 1);
  return currentCount > 0 ? `${base}-${currentCount + 1}` : base;
}

export function searchProductDocs(
  articles: readonly ProductDocArticle[],
  query: string,
): ProductDocSearchResult[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  return articles
    .map((article) => {
      const title = normalizeText(article.title);
      const summary = normalizeText(article.summary);
      const tags = normalizeText(article.tags.join(" "));
      const artifacts = normalizeText(article.relatedArtifacts.join(" "));
      const content = normalizeText(article.content);
      const titleMatch = title.includes(normalizedQuery);
      const summaryMatch = summary.includes(normalizedQuery);
      const tagMatch = tags.includes(normalizedQuery);
      const artifactMatch = artifacts.includes(normalizedQuery);
      const contentMatch = content.includes(normalizedQuery);
      const score =
        (titleMatch ? 30 : 0) +
        (summaryMatch ? 12 : 0) +
        (tagMatch ? 10 : 0) +
        (artifactMatch ? 8 : 0) +
        (contentMatch ? 5 : 0);
      if (score === 0) return null;
      return {
        article,
        score,
        matchedText: titleMatch
          ? article.title
          : summaryMatch
            ? article.summary
            : getContentSnippet(article.content, normalizedQuery),
      };
    })
    .filter((result): result is ProductDocSearchResult => Boolean(result))
    .sort((left, right) => right.score - left.score);
}

export function isAppRouteHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  if (href.startsWith("/help/")) return false;
  return !/\.[a-z0-9]+(?:$|[?#])/iu.test(href);
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[`*_~]/gu, "")
    .trim();
}

function getContentSnippet(content: string, normalizedQuery: string) {
  const normalizedContent = normalizeText(content);
  const index = normalizedContent.indexOf(normalizedQuery);
  if (index < 0) return content.slice(0, 80);
  const start = Math.max(0, index - 24);
  const end = Math.min(content.length, index + normalizedQuery.length + 56);
  return content.slice(start, end).replace(/\s+/gu, " ").trim();
}

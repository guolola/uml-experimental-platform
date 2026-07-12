// Renders the H2/H3 outline for the currently selected documentation article.
import { ListTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../shared/ui/utils";
import { i18n as appI18n } from "../../../shared/i18n";
import type { ProductDocHeading } from "../lib/docs-markdown";

type DocsOnThisPageProps = {
  headings: readonly ProductDocHeading[];
};

export function DocsOnThisPage({ headings }: DocsOnThisPageProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.onThisPage") ? translate : appI18n.t.bind(appI18n);
  const visibleHeadings = headings.filter(
    (heading) => heading.level === 2 || heading.level === 3,
  );

  return (
    <aside aria-label={t("docs.outlineAria")} className="hidden min-w-0 xl:block">
      <div className="sticky top-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <ListTree className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">{t("docs.onThisPage")}</h2>
        </div>
        {visibleHeadings.length > 0 ? (
          <nav aria-label={t("docs.onThisPage")} className="mt-3 grid gap-1">
            {visibleHeadings.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(heading.id)?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}${window.location.search}#${heading.id}`,
                  );
                }}
                className={cn(
                  "block break-words rounded-md px-2 py-1.5 text-xs leading-5 text-muted-foreground hover:bg-secondary hover:text-foreground",
                  heading.level === 3 && "pl-5",
                )}
              >
                {heading.title}
              </a>
            ))}
          </nav>
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {t("docs.noOutline")}
          </p>
        )}
      </div>
    </aside>
  );
}

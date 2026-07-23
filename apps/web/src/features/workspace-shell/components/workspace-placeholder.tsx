import { useTranslation } from "react-i18next";

export function Workspace({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      <div className="m-3 flex flex-1 items-center justify-center border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
        {t("workspace.placeholder", { title })}
      </div>
    </div>
  );
}

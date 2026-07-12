// Renders the shared language preference menu used across public and authenticated shells.
import { useState } from "react";
import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { cn } from "../../ui/utils";
import {
  LOCALE_LABELS,
  type LocalePreference,
} from "../types";
import { useAppI18n } from "../i18n-provider";

type LanguagePreferenceMenuProps = {
  className?: string;
};

export function LanguagePreferenceMenu({ className }: LanguagePreferenceMenuProps) {
  const { t } = useTranslation();
  const { locale, preference, setPreference } = useAppI18n();
  const [open, setOpen] = useState(false);
  const preferenceItems: Array<{
    value: LocalePreference;
    label: string;
  }> = [
    { value: "system", label: t("language.system") },
    { value: "zh-CN", label: t("language.zhCN") },
    { value: "en", label: t("language.en") },
  ];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(className, (open || preference !== "system") && "text-primary")}
          title={t("language.title")}
          aria-label={t("language.title")}
        >
          <Languages className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t("language.menuLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {preferenceItems.map((item) => (
          <DropdownMenuItem
            key={item.value}
            className={cn(
              (preference === item.value ||
                (item.value !== "system" && locale === item.value)) &&
                "text-primary",
            )}
            onSelect={() => setPreference(item.value)}
          >
            <span>{item.label}</span>
            {item.value === "system" && preference === "system" && (
              <span className="ml-auto text-xs text-muted-foreground">
                {LOCALE_LABELS[locale]}
              </span>
            )}
            {item.value !== "system" && locale === item.value && (
              <Check className="ml-auto size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Renders the Figma-aligned public website pages while keeping app workspace logic separate.
import {
  ArrowRight,
  FileText,
  Network,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { MarketingRoutePath } from "../../../shared/lib/app-route-types";
import type { AppLocale } from "../../../shared/i18n";
import {
  MARKETING_PROMO_VIDEO_URL,
  WORKFLOW_CHAIN_VIDEO_URL,
} from "../../../shared/lib/video-assets";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { VideoPlayer } from "../../../shared/ui/video-player";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import { AccountDialog } from "../../user-platform/components/account-dialog";
import { useAuthSession } from "../../user-platform/lib/use-auth-session";
import {
  PlatformApiError,
  platformApi,
  type PlatformUser,
} from "../../user-platform/services/platform-api";
import {
  getMarketingContent,
} from "../model/marketing-content";

type MarketingHomePageProps = {
  path: MarketingRoutePath;
  onNavigate: (path: string) => void;
};

type MarketingAuthState = {
  authUser: PlatformUser | null;
  authChecking?: boolean;
};

type MarketingContent = ReturnType<typeof getMarketingContent>;

const pagePadding = "px-[clamp(1.5rem,4vw,7rem)]";
const wideContent = "mx-auto w-full max-w-[1760px]";

function resolvedAppLocale(language: string | undefined): AppLocale {
  return language?.startsWith("en") ? "en" : "zh-CN";
}

function MarketingHeader({
  path,
  onNavigate,
  authUser,
  content,
}: MarketingHomePageProps & MarketingAuthState & { content: MarketingContent }) {
  const { t } = useTranslation();
  const signedIn = Boolean(authUser);

  return (
    <header className="motion-header sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className={`${wideContent} flex h-[73px] items-center justify-between gap-3 ${pagePadding}`}>
        <button
          type="button"
          className="motion-brand max-w-[58vw] break-words font-display text-left text-[22px] font-black leading-[28px] tracking-normal text-primary sm:text-[28px] sm:leading-[36px] md:max-w-none md:text-[32px] md:leading-[40px]"
          onClick={() => onNavigate("/")}
          aria-label={t("marketing.header.homeAria")}
        >
          {t("common.appName")}
        </button>
        <nav className="hidden items-center gap-8 md:flex" aria-label={t("marketing.header.navAria")}>
          {content.marketingNavItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              aria-current={path === item.path ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.path);
              }}
              className={
                path === item.path
                  ? "motion-nav-link pb-1 text-[16px] font-medium leading-[24px] text-primary"
                  : "motion-nav-link pb-1 text-[16px] font-medium leading-[24px] text-muted-foreground hover:text-primary"
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <LanguagePreferenceMenu className="motion-action size-10 rounded-full bg-transparent text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground" />
          {signedIn ? (
            <AccountDialog onNavigate={onNavigate} initialUser={authUser} />
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                className="motion-action rounded-full px-2 text-[14px] font-medium leading-[22px] text-primary hover:text-primary sm:px-4 sm:text-[16px] sm:leading-[24px]"
                onClick={() => onNavigate("/login")}
              >
                {t("auth.login")}
              </Button>
              <Button
                type="button"
                className="motion-action hidden rounded-full px-4 text-[14px] font-medium leading-[22px] shadow-sm min-[480px]:inline-flex sm:px-6 sm:text-[16px] sm:leading-[24px]"
                onClick={() => onNavigate("/register")}
              >
                {t("auth.register")}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MarketingFooter({ content }: { content: MarketingContent }) {
  const { t } = useTranslation();
  return (
    <footer data-testid="marketing-footer" data-motion="marketing-footer" className="motion-footer border-t border-border bg-card">
      <div
        className={`${wideContent} grid gap-6 ${pagePadding} py-[clamp(1.5rem,3vh,2.5rem)] text-sm text-muted-foreground lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.8fr)] lg:items-start lg:gap-12`}
      >
        <div className="grid gap-2 lg:pt-1">
          <div className="font-display text-[18px] font-semibold leading-[26px] text-foreground">{t("common.appName")}</div>
          <p>{t("marketing.footer.copyright")}</p>
        </div>
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[16px] font-semibold leading-6 text-foreground">{t("marketing.footer.aboutTitle")}</h2>
            {content.footerLinks.map((link) => (
              <a key={link} href="#" className="underline-offset-4 hover:text-primary hover:underline">
                {link}
              </a>
            ))}
          </div>
          <p className="max-w-5xl break-words leading-6">
            {t("marketing.footer.aboutDescription")}
          </p>
          <address className="flex flex-wrap gap-x-4 gap-y-1 not-italic leading-6">
            <span>{t("marketing.footer.contact")}</span>
            <a
              href="mailto:672250123@qq.com"
              className="break-all text-primary underline-offset-4 hover:underline"
            >
              672250123@qq.com
            </a>
          </address>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center lg:col-span-2">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:text-primary hover:underline"
          >
            闽ICP备2026024395号
          </a>
          <a
            href="https://beian.mps.gov.cn/#/query/webSearch?code=35010402351938"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 underline-offset-4 hover:text-primary hover:underline"
          >
            <img
              src="/assets/beian/gongan.png"
              alt={t("marketing.footer.policeIconAlt")}
              className="size-5 shrink-0"
              loading="lazy"
            />
            <span>闽公网安备35010402351938号</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

function MarketingFitPage({ children, content }: { children: ReactNode; content: MarketingContent }) {
  return (
    <div
      data-testid="marketing-fit-page"
      data-fit-mode="viewport"
      data-motion="marketing-page"
      className="flex min-h-[calc(100dvh-73px)] flex-col"
    >
      <div className="flex flex-1 flex-col">{children}</div>
      <MarketingFooter content={content} />
    </div>
  );
}

function MarketingScrollPage({ children, content }: { children: ReactNode; content: MarketingContent }) {
  return (
    <div data-testid="marketing-scroll-page" data-fit-mode="scroll" data-motion="marketing-page">
      {children}
      <MarketingFooter content={content} />
    </div>
  );
}

function LayeredProductMockup({ content }: { content: MarketingContent }) {
  const { t } = useTranslation();
  const [reportCard, umlCard] = content.productPreviewCards;
  const ReportIcon = reportCard?.icon ?? FileText;
  const UmlIcon = umlCard?.icon ?? Network;
  return (
    <div className="relative mx-auto h-[clamp(31rem,38vw,38rem)] min-h-[31rem] w-full min-w-0 max-w-[58rem]">
      <div className="absolute right-[8%] top-[8%] size-[27rem] rounded-full bg-primary/10 blur-[40px]" />
      <div className="absolute bottom-[17%] left-[17%] size-[20rem] rounded-full bg-info/10 blur-[30px]" />

      <article
        data-testid="marketing-mockup-main-card"
        className="motion-layer-main absolute left-[16%] top-[11%] z-20 w-[min(37rem,70%)] overflow-hidden rounded-[24px] border border-border/60 bg-card/70 p-5 shadow-xl backdrop-blur-md md:p-10"
      >
        <div className="border-b border-border/60 pb-5 md:pb-6">
          <div className="flex min-w-0 items-center justify-between gap-3 md:gap-5">
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner md:size-12">
                <FileText className="size-4 md:size-5" />
              </span>
              <div className="grid min-w-0 gap-1">
                <h2 className="truncate font-display text-[18px] font-semibold leading-6 text-foreground md:text-[22px]">
                  {t("marketing.mockup.projectName")}
                </h2>
                <p className="font-mono text-[12px] font-medium leading-4 text-primary">
                  {t("marketing.mockup.progress", { progress: 68 })}
                </p>
              </div>
            </div>
            <div data-testid="marketing-mockup-status-dots" className="flex shrink-0 gap-1.5 md:gap-2" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-destructive/80 md:size-3.5" />
              <span className="size-2.5 rounded-full bg-info/80 md:size-3.5" />
              <span className="size-2.5 rounded-full bg-primary/80 md:size-3.5" />
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-3">
          <div className="flex items-center justify-between font-mono text-[12px] font-medium leading-4">
            <span className="text-muted-foreground">{t("marketing.mockup.generationProgress")}</span>
            <span className="text-primary">{t("marketing.mockup.generatingUml")}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-border/50 shadow-inner">
            <div className="motion-progress-bar h-full w-[68%] rounded-full bg-gradient-to-r from-primary via-info to-primary" />
          </div>
        </div>
      </article>

      <article className="motion-layer-secondary absolute left-[2%] top-[43%] z-10 w-[min(28rem,54%)] rotate-[-2deg] rounded-2xl border border-border/60 bg-card p-8 shadow-xl">
        <div className="flex items-center gap-3 text-primary">
          <ReportIcon className="size-5" />
          <h3 className="font-display text-[18px] font-semibold leading-6">{reportCard?.title}</h3>
        </div>
        <div className="mt-5 grid gap-4">
          <span className="h-2.5 w-3/4 rounded-full bg-border" />
          <span className="h-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-5/6 rounded-full bg-border" />
          <span className="h-2.5 w-2/3 rounded-full bg-border" />
        </div>
      </article>

      <article className="motion-layer-tertiary absolute right-[-1%] top-[54%] z-10 w-[min(24rem,46%)] rotate-[3deg] rounded-2xl border border-border/60 bg-card p-7 shadow-xl">
        <div className="flex items-center gap-3 text-info">
          <UmlIcon className="size-5" />
          <h3 className="font-display text-[18px] font-bold leading-6">{umlCard?.title}</h3>
        </div>
        <div className="mt-4 flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-background/30 text-muted-foreground">
          <span className="font-mono text-xl leading-none">...</span>
        </div>
      </article>
    </div>
  );
}

function IntegratedReferenceStandardsStrip({ content }: { content: MarketingContent }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("marketing.standards.aria")}
      data-testid="marketing-standards-row"
      className="relative z-10 mt-[clamp(1.25rem,2vh,2rem)] grid grid-cols-4 gap-2 border-t border-border/60 pt-5 md:flex md:flex-wrap md:gap-6 md:pt-6"
    >
      {content.referenceStandards.map((standard, index) => (
        <a
          key={standard.name}
          href={standard.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${standard.name}: ${standard.description}`}
          className="motion-standard-anchor min-w-0 rounded-lg border border-border/60 bg-card/80 px-1.5 py-2 text-center shadow-sm backdrop-blur-md md:w-[180px] md:shrink-0 md:rounded-xl md:p-[17px] md:text-left"
          style={{ "--motion-delay": `${360 + index * 80}ms` } as CSSProperties}
        >
          <span className="flex min-w-0 flex-col items-center gap-1 md:flex-row md:gap-2">
            <ShieldCheck className="size-4 shrink-0 text-primary md:size-[16.5px]" />
            <span className="max-w-full truncate font-display text-[12px] font-bold leading-4 text-foreground md:text-[15px] md:leading-6">
              {standard.shortName}
            </span>
          </span>
          <span className="mt-1 hidden truncate text-[12px] leading-6 text-muted-foreground md:block">
            {standard.topic}
          </span>
        </a>
      ))}
    </section>
  );
}

function HomeTab({
  onNavigate,
  authUser,
  content,
}: Pick<MarketingHomePageProps, "onNavigate"> & MarketingAuthState & { content: MarketingContent }) {
  const { t } = useTranslation();
  const signedIn = Boolean(authUser);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);

  return (
    <>
      <MarketingScrollPage content={content}>
        <section
          data-testid="marketing-home-hero"
          data-footer-fit="same-viewport"
          className={`relative flex min-h-[calc(100dvh-73px-92px)] max-w-full items-center overflow-hidden bg-background ${pagePadding} py-[clamp(1rem,2vh,2rem)]`}
        >
          <div className="absolute right-0 top-0 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 size-72 rounded-full bg-info/5 blur-3xl" />
          <div className="relative mx-auto w-full max-w-[1680px]">
            <div className="grid min-w-0 items-center gap-[clamp(3rem,5vw,6rem)] overflow-visible lg:grid-cols-[minmax(0,1fr)_minmax(620px,1.18fr)]">
              <div className="grid min-w-0 max-w-full gap-[clamp(2rem,3.4vh,3.25rem)]">
                <div className="motion-rise motion-delay-2 grid gap-4">
                  <h1
                    aria-label={t("marketing.home.heroAria")}
                    className="max-w-[820px] break-words font-display text-[32px] font-semibold leading-[40px] tracking-normal text-foreground [overflow-wrap:anywhere] md:text-[clamp(3.75rem,4vw,5rem)] md:font-bold md:leading-[1.12]"
                  >
                    <span className="block md:inline">{t("marketing.home.heroLine1")}</span>
                    <span className="block md:inline">{t("marketing.home.heroLine2")}</span>
                    <span className="block bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
                      {t("marketing.home.heroAccent")}
                    </span>
                  </h1>
                  <p className="max-w-[22rem] break-all text-[clamp(1rem,1.1vw,1.25rem)] font-normal leading-[1.6] text-muted-foreground md:max-w-3xl md:break-words">
                    {t("marketing.home.description")}
                  </p>
                </div>
                <div
                  data-testid="marketing-cta-row"
                  className="motion-rise motion-delay-3 grid grid-cols-2 gap-3 pt-4 md:flex md:flex-wrap md:gap-4"
                >
                  <Button
                    type="button"
                    className="motion-action h-12 min-w-0 justify-center rounded-full px-3 font-display text-[15px] font-semibold leading-5 shadow-xl md:h-[4.5rem] md:min-w-[16rem] md:px-14 md:text-[20px] md:leading-[28px]"
                    onClick={() => onNavigate(signedIn ? "/projects" : "/login")}
                  >
                    {t("marketing.home.start")}
                    <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="motion-action h-12 min-w-0 justify-center rounded-full border-2 border-border bg-card px-3 font-display text-[15px] font-semibold leading-5 text-primary hover:bg-accent md:h-[4.5rem] md:min-w-[16rem] md:px-14 md:text-[20px] md:leading-[28px]"
                    onClick={() => setPromoDialogOpen(true)}
                  >
                    {t("marketing.home.watchIntro")}
                    <PlayCircle className="size-4" />
                  </Button>
                </div>
                <div
                  data-testid="marketing-trust-row"
                  className="grid grid-cols-5 gap-1.5 border-t border-border/60 pt-6 md:flex md:max-w-none md:flex-wrap md:gap-6 md:pt-8"
                >
                  {content.heroTrustPoints.map(({ label, icon: Icon }, index) => (
                    <span
                      key={label}
                      className="motion-rise inline-flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 py-1 text-center text-[12px] font-medium leading-4 text-muted-foreground md:flex-row md:gap-2 md:px-3 md:text-[14px] md:font-normal md:leading-[20px]"
                      style={{ "--motion-delay": `${360 + index * 90}ms` } as CSSProperties}
                      aria-label={label}
                    >
                      <Icon className="size-4 shrink-0 text-primary md:size-5" />
                      <span className="max-w-full truncate">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <LayeredProductMockup content={content} />
            </div>
            <IntegratedReferenceStandardsStrip content={content} />
          </div>
        </section>
      </MarketingScrollPage>
      {clientReady && (
        <Dialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen}>
          <DialogContent
            hideCloseButton
            className="max-h-[92vh] w-[min(1120px,calc(100vw-2rem))] !max-w-none gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none"
          >
            <DialogTitle className="sr-only">{t("marketing.home.watchIntro")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("marketing.home.videoDialogDescription")}
            </DialogDescription>
            {promoDialogOpen && (
              <VideoPlayer
                src={MARKETING_PROMO_VIDEO_URL}
                title={t("marketing.home.videoTitle")}
                description={t("marketing.home.videoDescription")}
                caption={t("marketing.home.videoCaption")}
                autoPlay
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function FeaturesTab({ content }: { content: MarketingContent }) {
  const { t } = useTranslation();
  return (
    <MarketingFitPage content={content}>
      <section className={`flex flex-1 flex-col justify-center bg-background ${pagePadding} py-[clamp(2.5rem,5vh,5rem)] text-center`}>
        <h1
          aria-label={t("marketing.features.heroAria")}
          className="motion-rise motion-delay-1 mx-auto max-w-5xl font-display text-[24px] font-semibold leading-[32px] tracking-normal text-foreground md:text-[48px] md:font-bold md:leading-[56px]"
        >
          {t("marketing.features.heroLine1")}
          <span className="block bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
            {t("marketing.features.heroAccent")}
          </span>
        </h1>
        <p className="motion-rise motion-delay-2 mx-auto mt-6 max-w-4xl text-[16px] font-normal leading-[24px] text-muted-foreground">
          {t("marketing.features.description")}
        </p>
        <div className={`${wideContent} mt-[clamp(2rem,4vh,4rem)] grid gap-[clamp(1.25rem,1.5vw,2rem)] md:grid-cols-2 xl:grid-cols-3`}>
          {content.features.map(({ title, shortTitle, description, icon: Icon }, index) => (
            <article
              key={title}
              className="motion-card relative min-h-[clamp(12rem,18vh,17rem)] overflow-hidden rounded-xl border border-border bg-card p-[clamp(1.5rem,2vw,2.25rem)] text-left shadow-sm"
              style={{ "--motion-delay": `${260 + index * 80}ms` } as CSSProperties}
            >
              <div className="absolute right-0 top-0 size-32 rounded-bl-full bg-primary/5" />
              <span className="motion-icon inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-5 font-display text-[20px] font-semibold leading-[28px] text-foreground">{shortTitle}</h2>
              <p className="mt-3 text-[14px] font-normal leading-[20px] text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingFitPage>
  );
}

function WorkflowTab({ content }: { content: MarketingContent }) {
  const { t } = useTranslation();
  return (
    <MarketingScrollPage content={content}>
      <section className={`relative overflow-hidden bg-background ${pagePadding} pb-16 pt-20 text-center`}>
        <div className="absolute left-1/2 top-0 h-64 w-[60%] -translate-x-1/2 rounded-full bg-accent/50 blur-3xl" />
        <div className="relative mx-auto grid max-w-[22rem] justify-items-center gap-6 md:max-w-3xl">
          <h1 className="motion-rise motion-delay-1 break-words font-display text-[24px] font-semibold leading-[32px] tracking-normal text-foreground [overflow-wrap:anywhere] md:text-[48px] md:font-bold md:leading-[56px]">
            {t("marketing.workflow.title")}
          </h1>
          <p className="motion-rise motion-delay-2 w-full break-all text-[16px] font-normal leading-[24px] text-muted-foreground md:break-words">
            {t("marketing.workflow.description")}
          </p>
        </div>
      </section>
      <section
        data-testid="workflow-chain-video-section"
        className={`bg-background ${pagePadding} pb-16`}
      >
        <div className="mx-auto grid max-w-5xl justify-items-center gap-6 text-center">
          <div className="grid max-w-3xl gap-3">
            <h2 className="break-words font-display text-[24px] font-semibold leading-[32px] tracking-normal text-foreground md:text-[32px] md:leading-[40px]">
              {t("marketing.workflow.videoHeading")}
            </h2>
            <p className="break-words text-[16px] font-normal leading-[24px] text-muted-foreground">
              {t("marketing.workflow.videoDescription")}
            </p>
          </div>
          <VideoPlayer
            className="w-full shadow-xl"
            src={WORKFLOW_CHAIN_VIDEO_URL}
            title={t("marketing.workflow.videoTitle")}
            description={t("marketing.workflow.videoPlayerDescription")}
            caption={t("marketing.workflow.videoCaption")}
          />
        </div>
      </section>
      <section className={`bg-background ${pagePadding} pb-24`}>
        <div className="relative mx-auto max-w-5xl">
          <div className="absolute left-1/2 top-4 hidden h-[calc(100%-2rem)] w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/20 via-info/20 to-muted-foreground/20 lg:block" />
          <div className="grid gap-16">
            {content.workflowSteps.map((step, index) => {
              const alignLeft = index % 2 === 0;
              const Icon = step.icon;
              return (
                <article
                  key={step.title}
                  data-testid="workflow-motion-card"
                  className="relative grid min-w-0 lg:grid-cols-[1fr_96px_1fr]"
                  style={{ "--motion-delay": `${120 + index * 90}ms` } as CSSProperties}
                >
                  <div className={alignLeft ? "min-w-0 lg:col-start-1 lg:pr-12" : "min-w-0 lg:col-start-3 lg:pl-12"}>
                    <div className={alignLeft ? "motion-card w-full min-w-0 max-w-[22rem] rounded-xl border border-border/60 bg-card p-8 text-left shadow-xl lg:max-w-none lg:text-right" : "motion-card w-full min-w-0 max-w-[22rem] rounded-xl border border-border/60 bg-card p-8 text-left shadow-xl lg:max-w-none"}>
                      <h2 className="break-words font-display text-[20px] font-semibold leading-[28px] text-foreground [overflow-wrap:anywhere]">{step.title}</h2>
                      <p className="mt-3 break-words text-[14px] font-normal leading-[20px] text-muted-foreground [overflow-wrap:anywhere]">{step.description}</p>
                      {step.tags && (
                        <div className={alignLeft ? "mt-4 flex flex-wrap gap-2 lg:justify-end" : "mt-4 flex flex-wrap gap-2"}>
                          {step.tags.map((tag) => (
                            <span key={tag} className="rounded bg-muted px-2 py-1 font-mono text-[12px] font-medium leading-[16px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="motion-workflow-node absolute left-1/2 top-8 hidden size-12 -translate-x-1/2 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-sm lg:inline-flex">
                    <Icon className="size-5" />
                  </span>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </MarketingScrollPage>
  );
}

function createCaseLoginRedirectPath(caseId: string) {
  return `/login?redirect=${encodeURIComponent(`/cases?createCase=${caseId}`)}`;
}

function CasesTab({
  onNavigate,
  authUser,
  authChecking = false,
  content,
}: Pick<MarketingHomePageProps, "onNavigate"> & MarketingAuthState & { content: MarketingContent }) {
  const { t } = useTranslation();
  const signedIn = Boolean(authUser);
  const [creatingCaseId, setCreatingCaseId] = useState<string | null>(null);
  const [caseCreateError, setCaseCreateError] = useState<string | null>(null);
  const autoCreateCaseRef = useRef<string | null>(null);

  const createProjectFromCase = useCallback(async (study: MarketingContent["caseStudies"][number]) => {
    setCaseCreateError(null);
    if (authChecking) return;
    if (!signedIn) {
      onNavigate(createCaseLoginRedirectPath(study.id));
      return;
    }
    setCreatingCaseId(study.id);
    try {
      const response = await platformApi.createCaseProject(study.id);
      onNavigate(`/projects/${response.project.id}`);
    } catch (error) {
      if (error instanceof PlatformApiError && error.status === 401) {
        onNavigate(createCaseLoginRedirectPath(study.id));
        return;
      }
      setCaseCreateError(error instanceof Error ? error.message : t("marketing.cases.createFailed"));
    } finally {
      setCreatingCaseId((current) => (current === study.id ? null : current));
    }
  }, [authChecking, onNavigate, signedIn, t]);

  useEffect(() => {
    if (authChecking) return;
    const caseId = new URLSearchParams(window.location.search).get("createCase") ?? "";
    if (!caseId) return;
    const study = content.caseStudies.find((candidate) => candidate.id === caseId);
    if (!study) {
      setCaseCreateError(t("marketing.cases.notFound"));
      return;
    }
    if (!signedIn) {
      onNavigate(createCaseLoginRedirectPath(study.id));
      return;
    }
    if (autoCreateCaseRef.current === study.id) return;
    autoCreateCaseRef.current = study.id;
    void createProjectFromCase(study);
  }, [authChecking, content.caseStudies, createProjectFromCase, onNavigate, signedIn, t]);

  return (
    <MarketingFitPage content={content}>
      <section className={`flex flex-1 flex-col justify-center bg-background ${pagePadding} py-[clamp(3rem,7vh,6rem)] text-center`}>
        <h1 className="motion-rise motion-delay-1 font-display text-[24px] font-semibold leading-[32px] tracking-normal text-foreground md:text-[48px] md:font-bold md:leading-[56px]">
          {t("marketing.cases.title")}
        </h1>
        <p className="motion-rise motion-delay-2 mx-auto mt-6 max-w-5xl text-[16px] font-normal leading-[24px] text-muted-foreground">
          {t("marketing.cases.description")}
        </p>
        {caseCreateError && (
          <p role="alert" className="mx-auto mt-6 max-w-3xl rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {caseCreateError}
          </p>
        )}
        <div className="mx-auto mt-[clamp(2.5rem,5vh,5rem)] grid w-full max-w-[1500px] gap-[clamp(1.5rem,2vw,2.25rem)] md:grid-cols-2">
          {content.caseStudies.map((study, index) => {
            const creating = creatingCaseId === study.id;
            return (
              <article
                key={study.id}
                className="motion-card rounded-xl border border-border bg-card p-[clamp(1.75rem,2.2vw,2.75rem)] text-left shadow-sm"
                style={{ "--motion-delay": `${220 + index * 110}ms` } as CSSProperties}
              >
                <h2 className="font-display text-[20px] font-semibold leading-[28px] text-foreground">{study.title}</h2>
                <p className="mt-4 text-[16px] font-normal leading-[24px] text-muted-foreground">{study.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {study.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="bg-muted text-primary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    {t("marketing.cases.feasibilityLabel")}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {study.feasibilitySummary}
                  </p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-foreground">
                    {t("marketing.cases.includedArtifacts")}
                  </p>
                  <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                    {study.outputs.map((output) => (
                      <li key={output} className="flex gap-2">
                        <span aria-hidden="true" className="text-primary">•</span>
                        <span>{output}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="motion-action mt-6 px-0 text-primary hover:bg-transparent"
                  onClick={() => void createProjectFromCase(study)}
                  disabled={authChecking || Boolean(creatingCaseId)}
                  aria-busy={creating}
                >
                  {creating ? t("marketing.cases.creating") : t("marketing.cases.viewCase")}
                  <ArrowRight className="size-4" />
                </Button>
              </article>
            );
          })}
        </div>
      </section>
    </MarketingFitPage>
  );
}

export function MarketingHomePage({ path, onNavigate }: MarketingHomePageProps) {
  const { i18n } = useTranslation();
  const { checking: authChecking, user: authUser } = useAuthSession();
  const content = getMarketingContent(resolvedAppLocale(i18n.resolvedLanguage ?? i18n.language));

  return (
    <main className="min-h-0 flex-1 overflow-auto overflow-x-hidden bg-background font-sans text-[16px] leading-[24px] text-foreground">
      <MarketingHeader path={path} onNavigate={onNavigate} authUser={authUser} content={content} />
      {path === "/" && <HomeTab onNavigate={onNavigate} authUser={authUser} content={content} />}
      {path === "/features" && <FeaturesTab content={content} />}
      {path === "/workflow" && <WorkflowTab content={content} />}
      {path === "/cases" && (
        <CasesTab onNavigate={onNavigate} authUser={authUser} authChecking={authChecking} content={content} />
      )}
    </main>
  );
}

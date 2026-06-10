// Renders the Figma-aligned public website pages while keeping app workspace logic separate.
import {
  ArrowRight,
  FileText,
  Network,
  ShieldCheck,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { MarketingRoutePath } from "../../../app/app-routes";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { AccountDialog } from "../../user-platform/components/account-dialog";
import { PricingBillingPage } from "../../user-platform/components/billing-pages";
import { useAuthSession } from "../../user-platform/lib/use-auth-session";
import type { PlatformUser } from "../../user-platform/services/platform-api";
import {
  caseStudies,
  features,
  footerLinks,
  heroTrustPoints,
  marketingNavItems,
  referenceStandards,
  workflowSteps,
} from "../model/marketing-content";

type MarketingHomePageProps = {
  path: MarketingRoutePath;
  onNavigate: (path: string) => void;
};

type MarketingAuthState = {
  authUser: PlatformUser | null;
};

const pagePadding = "px-[clamp(1.5rem,4vw,7rem)]";
const wideContent = "mx-auto w-full max-w-[1760px]";

function MarketingHeader({
  path,
  onNavigate,
  authUser,
}: MarketingHomePageProps & MarketingAuthState) {
  const signedIn = Boolean(authUser);

  return (
    <header className="motion-header sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className={`${wideContent} flex h-[73px] items-center justify-between gap-3 ${pagePadding}`}>
        <button
          type="button"
          className="motion-brand max-w-[58vw] break-words font-display text-left text-[22px] font-black leading-[28px] tracking-normal text-primary sm:text-[28px] sm:leading-[36px] md:max-w-none md:text-[32px] md:leading-[40px]"
          onClick={() => onNavigate("/")}
          aria-label="软件工程实训平台官网"
        >
          软件工程实训平台
        </button>
        <nav className="hidden items-center gap-8 md:flex" aria-label="官网导航">
          {marketingNavItems.map((item) => (
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
                登录
              </Button>
              <Button
                type="button"
                className="motion-action hidden rounded-full px-4 text-[14px] font-medium leading-[22px] shadow-sm min-[480px]:inline-flex sm:px-6 sm:text-[16px] sm:leading-[24px]"
                onClick={() => onNavigate("/register")}
              >
                注册
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MarketingFooter() {
  return (
    <footer data-testid="marketing-footer" data-motion="marketing-footer" className="motion-footer border-t border-border bg-card">
      <div className={`${wideContent} flex items-center justify-between gap-6 ${pagePadding} py-[clamp(0.85rem,1.4vh,1.25rem)] text-sm text-muted-foreground`}>
        <div className="grid gap-2">
          <div className="font-display text-[18px] font-semibold leading-[26px] text-foreground">软件工程实训平台</div>
          <p>© 2026 软件工程实训平台。保留所有权利。</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-6">
          {footerLinks.map((link) => (
            <a key={link} href="#" className="underline-offset-4 hover:text-primary hover:underline">
              {link}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

function MarketingFitPage({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="marketing-fit-page"
      data-fit-mode="viewport"
      data-motion="marketing-page"
      className="flex min-h-[calc(100dvh-73px)] flex-col"
    >
      <div className="flex flex-1 flex-col">{children}</div>
      <MarketingFooter />
    </div>
  );
}

function MarketingScrollPage({ children }: { children: ReactNode }) {
  return (
    <div data-testid="marketing-scroll-page" data-fit-mode="scroll" data-motion="marketing-page">
      {children}
      <MarketingFooter />
    </div>
  );
}

function LayeredProductMockup() {
  return (
    <div className="relative mx-auto h-[clamp(31rem,38vw,38rem)] min-h-[31rem] w-full min-w-0 max-w-[58rem]">
      <div className="absolute right-[8%] top-[8%] size-[27rem] rounded-full bg-primary/10 blur-[40px]" />
      <div className="absolute bottom-[17%] left-[17%] size-[20rem] rounded-full bg-info/10 blur-[30px]" />

      <article className="motion-layer-main absolute left-[16%] top-[11%] z-20 w-[min(37rem,70%)] rounded-[24px] border border-border/60 bg-card/70 p-10 shadow-xl backdrop-blur-md">
        <div className="border-b border-border/60 pb-6">
          <div className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
                <FileText className="size-5" />
              </span>
              <div className="grid gap-1">
                <h2 className="whitespace-nowrap font-display text-[22px] font-semibold leading-6 text-foreground">
                  图书馆借阅系统
                </h2>
                <p className="font-mono text-[12px] font-medium leading-4 text-primary">
                  实验进度 68%
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <span className="size-3.5 rounded-full bg-destructive/80" />
              <span className="size-3.5 rounded-full bg-info/80" />
              <span className="size-3.5 rounded-full bg-primary/80" />
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-3">
          <div className="flex items-center justify-between font-mono text-[12px] font-medium leading-4">
            <span className="text-muted-foreground">生成进度</span>
            <span className="text-primary">正在生成 UML...</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-border/50 shadow-inner">
            <div className="motion-progress-bar h-full w-[68%] rounded-full bg-gradient-to-r from-primary via-info to-primary" />
          </div>
        </div>
      </article>

      <article className="motion-layer-secondary absolute left-[2%] top-[43%] z-10 w-[min(28rem,54%)] rotate-[-2deg] rounded-2xl border border-border/60 bg-card p-8 shadow-xl">
        <div className="flex items-center gap-3 text-primary">
          <FileText className="size-5" />
          <h3 className="font-display text-[18px] font-semibold leading-6">需求报告</h3>
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
          <Network className="size-5" />
          <h3 className="font-display text-[18px] font-bold leading-6">UML 预览</h3>
        </div>
        <div className="mt-4 flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-background/30 text-muted-foreground">
          <span className="font-mono text-xl leading-none">...</span>
        </div>
      </article>
    </div>
  );
}

function IntegratedReferenceStandardsStrip() {
  return (
    <section
      aria-label="参考标准"
      className="relative z-10 mt-[clamp(1.25rem,2vh,2rem)] grid max-w-[22rem] gap-4 border-t border-border/60 pt-6 min-[520px]:flex min-[520px]:max-w-none min-[520px]:flex-wrap min-[520px]:gap-6"
    >
      {referenceStandards.map((standard, index) => (
        <a
          key={standard.name}
          href={standard.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${standard.name}: ${standard.description}`}
          className="motion-standard-anchor w-[180px] shrink-0 rounded-xl border border-border/60 bg-card/80 p-[17px] text-left shadow-sm backdrop-blur-md"
          style={{ "--motion-delay": `${360 + index * 80}ms` } as CSSProperties}
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-[16.5px] shrink-0 text-primary" />
            <span className="font-display text-[15px] font-bold leading-6 text-foreground">
              {standard.shortName}
            </span>
          </span>
          <span className="mt-1 block truncate text-[12px] leading-6 text-muted-foreground">
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
}: Pick<MarketingHomePageProps, "onNavigate"> & MarketingAuthState) {
  const signedIn = Boolean(authUser);

  return (
    <MarketingScrollPage>
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
                  aria-label="让需求、UML模型、原型和说明书一站式生成"
                  className="max-w-[820px] break-words font-display text-[32px] font-semibold leading-[40px] tracking-normal text-foreground [overflow-wrap:anywhere] md:text-[clamp(3.75rem,4vw,5rem)] md:font-bold md:leading-[1.12]"
                >
                  <span className="block md:inline">让需求、UML模型、</span>
                  <span className="block md:inline">原型和说明书</span>
                  <span className="block bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
                    一站式生成
                  </span>
                </h1>
                <p className="max-w-[22rem] break-all text-[clamp(1rem,1.1vw,1.25rem)] font-normal leading-[1.6] text-muted-foreground md:max-w-3xl md:break-words">
                  输入需求文本，平台辅助生成需求规则、UML模型、React 原型与实训说明书。
                </p>
              </div>
              <div className="motion-rise motion-delay-3 flex flex-col gap-4 pt-4 min-[520px]:flex-row min-[520px]:flex-wrap">
                <Button
                  type="button"
                  className="motion-action h-14 w-full max-w-[22rem] justify-center rounded-full px-7 font-display text-[18px] font-semibold leading-[26px] shadow-xl min-[520px]:w-auto min-[520px]:min-w-[12rem] md:h-[4.5rem] md:min-w-[16rem] md:px-14 md:text-[20px] md:leading-[28px]"
                  onClick={() => onNavigate(signedIn ? "/projects" : "/register")}
                >
                  开始生成
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="motion-action h-14 w-full max-w-[22rem] rounded-full border-2 border-border bg-card px-7 font-display text-[18px] font-semibold leading-[26px] text-primary hover:bg-accent min-[520px]:w-auto md:h-[4.5rem] md:px-14 md:text-[20px] md:leading-[28px]"
                  onClick={() => onNavigate("/cases")}
                >
                  查看案例项目
                </Button>
              </div>
              <div className="grid max-w-[22rem] gap-4 border-t border-border/60 pt-8 min-[520px]:flex min-[520px]:max-w-none min-[520px]:flex-wrap min-[520px]:gap-6">
                {heroTrustPoints.map(({ label, icon: Icon }, index) => (
                  <span
                    key={label}
                    className="motion-rise inline-flex items-center gap-2 rounded-lg px-3 py-1 text-[14px] font-normal leading-[20px] text-muted-foreground"
                    style={{ "--motion-delay": `${360 + index * 90}ms` } as CSSProperties}
                  >
                    <Icon className="size-5 text-primary" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <LayeredProductMockup />
          </div>
          <IntegratedReferenceStandardsStrip />
        </div>
      </section>
    </MarketingScrollPage>
  );
}

function FeaturesTab() {
  return (
    <MarketingFitPage>
      <section className={`flex flex-1 flex-col justify-center bg-background ${pagePadding} py-[clamp(2.5rem,5vh,5rem)] text-center`}>
        <h1
          aria-label="阶段化 AI 辅助的软件工程实验室"
          className="motion-rise motion-delay-1 mx-auto max-w-5xl font-display text-[24px] font-semibold leading-[32px] tracking-normal text-foreground md:text-[48px] md:font-bold md:leading-[56px]"
        >
          阶段化 AI 辅助的
          <span className="block bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
            现代软件工程实验室
          </span>
        </h1>
        <p className="motion-rise motion-delay-2 mx-auto mt-6 max-w-4xl text-[16px] font-normal leading-[24px] text-muted-foreground">
          软件工程实训平台提供从需求分析到代码原型和说明书导出的阶段化工具链。平台通过大模型推理与结构化输出，把需求文本沉淀为可追踪、可渲染、可修复的实训产物。
        </p>
        <div className={`${wideContent} mt-[clamp(2rem,4vh,4rem)] grid gap-[clamp(1.25rem,1.5vw,2rem)] md:grid-cols-2 xl:grid-cols-3`}>
          {features.map(({ title, shortTitle, description, icon: Icon }, index) => (
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

function WorkflowTab() {
  return (
    <MarketingScrollPage>
      <section className={`relative overflow-hidden bg-background ${pagePadding} pb-16 pt-20 text-center`}>
        <div className="absolute left-1/2 top-0 h-64 w-[60%] -translate-x-1/2 rounded-full bg-accent/50 blur-3xl" />
        <div className="relative mx-auto grid max-w-[22rem] justify-items-center gap-6 md:max-w-3xl">
          <h1 className="motion-rise motion-delay-1 break-words font-display text-[24px] font-semibold leading-[32px] tracking-normal text-foreground [overflow-wrap:anywhere] md:text-[48px] md:font-bold md:leading-[56px]">
            智能研发实验全链路
          </h1>
          <p className="motion-rise motion-delay-2 w-full break-all text-[16px] font-normal leading-[24px] text-muted-foreground md:break-words">
            软件工程实训平台提供从需求输入到 UML模型、React 原型和 DOCX 说明书导出的标准化流程，通过大模型推理与结构化校验保留每一步实训产物。
          </p>
        </div>
      </section>
      <section className={`bg-background ${pagePadding} pb-24`}>
        <div className="relative mx-auto max-w-5xl">
          <div className="absolute left-1/2 top-4 hidden h-[calc(100%-2rem)] w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/20 via-info/20 to-muted-foreground/20 lg:block" />
          <div className="grid gap-16">
            {workflowSteps.map((step, index) => {
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

function CasesTab() {
  return (
    <MarketingFitPage>
      <section className={`flex flex-1 flex-col justify-center bg-background ${pagePadding} py-[clamp(3rem,7vh,6rem)] text-center`}>
        <h1 className="motion-rise motion-delay-1 font-display text-[24px] font-semibold leading-[32px] tracking-normal text-foreground md:text-[48px] md:font-bold md:leading-[56px]">
          探索工程验证案例
        </h1>
        <p className="motion-rise motion-delay-2 mx-auto mt-6 max-w-5xl text-[16px] font-normal leading-[24px] text-muted-foreground">
          通过常见课程与原型验证场景，体验软件工程实训平台如何在需求分析、架构设计与代码原型环节沉淀结构化实训产物。
        </p>
        <div className="mx-auto mt-[clamp(2.5rem,5vh,5rem)] grid w-full max-w-[1500px] gap-[clamp(1.5rem,2vw,2.25rem)] md:grid-cols-2">
          {caseStudies.map((study, index) => (
            <article
              key={study.title}
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
              <Button type="button" variant="ghost" className="motion-action mt-6 px-0 text-primary hover:bg-transparent">
                查看案例
                <ArrowRight className="size-4" />
              </Button>
            </article>
          ))}
        </div>
      </section>
    </MarketingFitPage>
  );
}

function PricingTab({
  onNavigate,
  authUser,
}: Pick<MarketingHomePageProps, "onNavigate"> & MarketingAuthState) {
  return (
    <MarketingFitPage>
      <PricingBillingPage signedIn={Boolean(authUser)} onNavigate={onNavigate} />
    </MarketingFitPage>
  );
}

export function MarketingHomePage({ path, onNavigate }: MarketingHomePageProps) {
  const { user: authUser } = useAuthSession();

  return (
    <main className="min-h-0 flex-1 overflow-auto overflow-x-hidden bg-background font-sans text-[16px] leading-[24px] text-foreground">
      <MarketingHeader path={path} onNavigate={onNavigate} authUser={authUser} />
      {path === "/" && <HomeTab onNavigate={onNavigate} authUser={authUser} />}
      {path === "/features" && <FeaturesTab />}
      {path === "/workflow" && <WorkflowTab />}
      {path === "/cases" && <CasesTab />}
      {path === "/pricing" && <PricingTab onNavigate={onNavigate} authUser={authUser} />}
    </main>
  );
}

// Defines the canonical metadata contract shared by runtime navigation and static prerendering.
import type { AppRoute, MarketingRoutePath } from "../../../shared/lib/app-route-types";

export const PUBLIC_SITE_URL = "https://jianglisoftware.com";
export const SEO_JSON_LD_ID = "marketing-seo-json-ld";

export type MarketingSeoMetadata = {
  path: MarketingRoutePath;
  title: string;
  description: string;
  canonicalPath: MarketingRoutePath;
  imagePath: "/og-cover.png";
  indexable: true;
  jsonLd?: Record<string, unknown>[];
};

const sharedApplication = {
  "@type": "SoftwareApplication",
  name: "软件工程实践平台",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: PUBLIC_SITE_URL,
  description: "面向软件工程教学与实践的需求分析、UML 建模、原型、代码和说明书生成平台。",
};

export const MARKETING_SEO: Record<MarketingRoutePath, MarketingSeoMetadata> = {
  "/": {
    path: "/",
    title: "软件工程实践平台｜AI 驱动的需求分析与 UML 建模",
    description: "面向软件工程教学与实践，从需求分析、UML 建模到原型、代码和说明书生成，提供可追踪的一站式工程工作流。",
    canonicalPath: "/",
    imagePath: "/og-cover.png",
    indexable: true,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "软件工程实践平台",
        url: PUBLIC_SITE_URL,
        inLanguage: "zh-CN",
      },
      { "@context": "https://schema.org", ...sharedApplication },
    ],
  },
  "/features": {
    path: "/features",
    title: "功能特性｜需求分析、UML 建模、原型与文档生成",
    description: "了解软件工程实践平台如何连接需求评审、UML 模型、设计推导、代码原型、测试追踪与说明书生成。",
    canonicalPath: "/features",
    imagePath: "/og-cover.png",
    indexable: true,
  },
  "/workflow": {
    path: "/workflow",
    title: "使用流程｜从需求输入到 UML、代码与说明书",
    description: "按照阶段化工作流完成需求输入、规则审查、UML 建模、设计推导、原型代码和软件说明书交付。",
    canonicalPath: "/workflow",
    imagePath: "/og-cover.png",
    indexable: true,
  },
  "/cases": {
    path: "/cases",
    title: "案例展示｜软件工程建模与生成实践",
    description: "通过实验室预约、订单履约、设备监控和图书借阅等案例了解需求到模型、代码与文档的完整实践链路。",
    canonicalPath: "/cases",
    imagePath: "/og-cover.png",
    indexable: true,
  },
  "/pricing": {
    path: "/pricing",
    title: "价格方案｜软件工程实践平台",
    description: "查看软件工程实践平台当前可用方案与生成权益，按实际需求选择适合的软件工程建模和交付能力。",
    canonicalPath: "/pricing",
    imagePath: "/og-cover.png",
    indexable: true,
  },
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value));
}

function removeManagedStructuredData() {
  document.getElementById(SEO_JSON_LD_ID)?.remove();
}

export function applyRouteMetadata(route: AppRoute, siteUrl = PUBLIC_SITE_URL) {
  const metadata = route.kind === "marketing-home" ? MARKETING_SEO[route.path] : null;
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!metadata) {
    document.title = route.kind === "not-found" ? "页面未找到｜软件工程实践平台" : "软件工程实践平台";
    upsertMeta('meta[name="robots"]', { name: "robots", content: "noindex, nofollow" });
    canonical?.remove();
    document.head.querySelector('meta[name="description"]')?.remove();
    document.head.querySelectorAll('[data-seo-social="true"]').forEach((element) => element.remove());
    removeManagedStructuredData();
    return;
  }

  const absoluteCanonical = new URL(metadata.canonicalPath, siteUrl).toString();
  const absoluteImage = new URL(metadata.imagePath, siteUrl).toString();
  document.title = metadata.title;
  upsertMeta('meta[name="description"]', { name: "description", content: metadata.description });
  upsertMeta('meta[name="robots"]', {
    name: "robots",
    content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  });

  const canonicalElement = canonical ?? document.createElement("link");
  canonicalElement.setAttribute("rel", "canonical");
  canonicalElement.setAttribute("href", absoluteCanonical);
  if (!canonical) document.head.appendChild(canonicalElement);

  document.head.querySelectorAll('[data-seo-social="true"]').forEach((element) => element.remove());
  const socialTags: Array<Record<string, string>> = [
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "zh_CN" },
    { property: "og:site_name", content: "软件工程实践平台" },
    { property: "og:title", content: metadata.title },
    { property: "og:description", content: metadata.description },
    { property: "og:url", content: absoluteCanonical },
    { property: "og:image", content: absoluteImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: metadata.title },
    { name: "twitter:description", content: metadata.description },
    { name: "twitter:image", content: absoluteImage },
  ];
  socialTags.forEach((attributes) => {
    const element = document.createElement("meta");
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    element.dataset.seoSocial = "true";
    document.head.appendChild(element);
  });

  removeManagedStructuredData();
  if (metadata.jsonLd?.length) {
    const script = document.createElement("script");
    script.id = SEO_JSON_LD_ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(metadata.jsonLd);
    document.head.appendChild(script);
  }
}

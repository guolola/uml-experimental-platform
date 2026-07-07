// Verifies the public metadata registry and runtime head transitions used by SPA navigation.
import { describe, expect, it } from "vitest";
import type { MarketingRoutePath } from "../../../shared/lib/app-route-types";
import { applyRouteMetadata, MARKETING_SEO, PUBLIC_SITE_URL, SEO_JSON_LD_ID } from "./seo";

const expectedRoutes: MarketingRoutePath[] = ["/", "/features", "/workflow", "/cases", "/pricing"];

describe("marketing SEO metadata", () => {
  it("defines complete unique metadata for every public route", () => {
    expect(Object.keys(MARKETING_SEO)).toEqual(expectedRoutes);
    expect(new Set(Object.values(MARKETING_SEO).map((item) => item.title)).size).toBe(expectedRoutes.length);
    expect(new Set(Object.values(MARKETING_SEO).map((item) => item.description)).size).toBe(expectedRoutes.length);

    expectedRoutes.forEach((route) => {
      const metadata = MARKETING_SEO[route];
      expect(metadata.path).toBe(route);
      expect(metadata.canonicalPath).toBe(route);
      expect(metadata.indexable).toBe(true);
      expect(metadata.description.length).toBeGreaterThan(30);
    });
  });

  it("applies public metadata and removes it when navigation enters a private route", () => {
    applyRouteMetadata({ kind: "marketing-home", path: "/" });

    expect(document.title).toBe(MARKETING_SEO["/"].title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      MARKETING_SEO["/"].description,
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("index, follow");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${PUBLIC_SITE_URL}/`);
    expect(document.getElementById(SEO_JSON_LD_ID)?.textContent).toContain("SoftwareApplication");
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      `${PUBLIC_SITE_URL}/og-cover.png`,
    );

    applyRouteMetadata({ kind: "projects-index", path: "/projects" });

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('[data-seo-social="true"]')).toBeNull();
    expect(document.getElementById(SEO_JSON_LD_ID)).toBeNull();
  });

  it("uses an explicit noindex title for unknown routes", () => {
    applyRouteMetadata({ kind: "not-found", path: "/missing" });
    expect(document.title).toBe("页面未找到｜软件工程实践平台");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });
});

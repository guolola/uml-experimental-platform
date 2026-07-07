// Runs post-release HTTP assertions for canonical pages, crawler files, private routes, and real 404s.
const baseUrl = new URL(process.env.PUBLIC_WEB_BASE_URL?.trim() || "https://jianglisoftware.com");
const publicRoutes = ["/", "/features", "/workflow", "/cases", "/pricing"];

async function request(pathname, init) {
  const response = await fetch(new URL(pathname, baseUrl), init);
  const body = await response.text();
  return { response, body };
}

for (const route of publicRoutes) {
  const { response, body } = await request(route);
  const canonical = new URL(route, baseUrl).toString();
  if (response.status !== 200 || !body.includes('data-prerendered="true"') || !body.includes(`<link rel="canonical" href="${canonical}"`)) {
    throw new Error(`Public SEO verification failed for ${route}: HTTP ${response.status}`);
  }
}

const privateRoute = await request("/login");
if (
  privateRoute.response.status !== 200 ||
  !privateRoute.response.headers.get("x-robots-tag")?.includes("noindex") ||
  !privateRoute.body.includes('content="noindex, nofollow"')
) {
  throw new Error("Private SPA shell verification failed for /login.");
}

const robots = await request("/robots.txt");
if (robots.response.status !== 200 || !robots.response.headers.get("content-type")?.includes("text/plain") || !robots.body.includes("Sitemap:")) {
  throw new Error("robots.txt verification failed.");
}

const sitemap = await request("/sitemap.xml");
if (sitemap.response.status !== 200 || !sitemap.response.headers.get("content-type")?.includes("xml") || !sitemap.body.includes("<urlset")) {
  throw new Error("sitemap.xml verification failed.");
}

const missing = await request("/__seo_missing_page_check__");
if (missing.response.status !== 404) throw new Error(`Expected a real 404, received HTTP ${missing.response.status}.`);

const trailingSlash = await request("/features/", { redirect: "manual" });
const redirectLocation = trailingSlash.response.headers.get("location");
if (
  trailingSlash.response.status !== 301 ||
  !redirectLocation ||
  new URL(redirectLocation, baseUrl).toString() !== new URL("/features", baseUrl).toString()
) {
  throw new Error("Trailing-slash canonical redirect verification failed.");
}

console.log(`SEO deployment verification passed for ${baseUrl.origin}.`);

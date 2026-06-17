import type {
  AppRoute,
  AuthRoutePath,
  MarketingRoutePath,
  ProjectRouteDrawer,
  ShellRoutePath,
} from "../shared/lib/app-route-types";
export type {
  AppRoute,
  AuthRoutePath,
  MarketingRoutePath,
  ProjectRouteDrawer,
  ShellRoutePath,
} from "../shared/lib/app-route-types";

const SHELL_PATHS = new Set<ShellRoutePath>(["/workspace", "/exam", "/tutorial"]);
const MARKETING_PATHS = new Set<MarketingRoutePath>([
  "/",
  "/features",
  "/workflow",
  "/cases",
  "/pricing",
]);
const AUTH_PATHS = new Set<AuthRoutePath>([
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

export function matchAppRoute(pathname: string): AppRoute {
  if (MARKETING_PATHS.has(pathname as MarketingRoutePath)) {
    return { kind: "marketing-home", path: pathname as MarketingRoutePath };
  }

  if (SHELL_PATHS.has(pathname as ShellRoutePath)) {
    return { kind: "shell", path: pathname as ShellRoutePath };
  }

  if (AUTH_PATHS.has(pathname as AuthRoutePath)) {
    return { kind: "auth", path: pathname as AuthRoutePath };
  }

  if (pathname === "/invitations/accept") {
    return { kind: "invitation-accept", path: "/invitations/accept" };
  }

  if (pathname === "/billing/alipay/return") {
    return { kind: "alipay-return", path: "/billing/alipay/return" };
  }

  if (pathname === "/account/billing") {
    return { kind: "account-billing", path: "/account/billing" };
  }

  if (pathname === "/account" || pathname === "/account/security") {
    return { kind: "legacy-account", path: pathname };
  }
  if (pathname === "/settings/models") {
    return { kind: "legacy-redirect", path: "/settings/models", to: "/projects" };
  }

  if (pathname === "/projects") return { kind: "projects-index", path: "/projects" };
  if (pathname === "/projects/new") return { kind: "projects-new", path: "/projects/new" };
  const projectMatch = pathname.match(
    /^\/projects\/([^/]+)(?:\/(settings|members|history|documents))?$/u,
  );
  if (projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const drawer = projectMatch[2] as ProjectRouteDrawer | undefined;
    return drawer
      ? { kind: "project-workspace", path: pathname, projectId, drawer }
      : { kind: "project-workspace", path: pathname, projectId };
  }

  return { kind: "marketing-home", path: "/" };
}

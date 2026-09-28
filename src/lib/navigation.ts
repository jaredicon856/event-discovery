export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/billing") {
    return pathname === "/billing" || pathname.startsWith("/billing/plans/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

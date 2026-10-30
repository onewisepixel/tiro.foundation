// The site's global navigation (decision 42): four groups, named for a
// visitor's questions (why, what, on what terms, how to help) rather than
// the site's page list. The header shows the groups; the narrow-screen menu
// and the footer list every destination, so each keeps a place.
//
// The mapping of existing pages into the groups is a proposal for founder
// review before release (decision 42; Milestone 3.0 Phase 3a gate report).
// /living-trace is not in the navigation, as before. /memories is listed in
// the footer only (footerOnly): it keeps a place (decision 42) while staying
// separate from the Memory Project demonstration in the header and the
// menu (decision 44).
export type NavLink = { href: string; label: string; footerOnly?: true };
export type NavGroup = { label: string; href: string; links: NavLink[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Purpose",
    href: "/manifesto",
    links: [
      { href: "/manifesto", label: "Manifesto" },
      { href: "/about", label: "About" },
    ],
  },
  {
    label: "Memory Project",
    href: "/memory-project",
    links: [
      { href: "/memory-project", label: "The Memory Project" },
      { href: "/memories", label: "Memory records", footerOnly: true },
    ],
  },
  {
    label: "Principles",
    href: "/community-rights",
    links: [{ href: "/community-rights", label: "Community Rights" }],
  },
  {
    label: "Get involved",
    href: "/pilot",
    links: [
      { href: "/pilot", label: "The pilot" },
      { href: "/nodes", label: "Nodes" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

export function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The links shown in the header and the narrow-screen menu.
export const menuLinks = (group: NavGroup) => group.links.filter((l) => !l.footerOnly);

// A group is current when the visitor is on any of its menu pages.
export const isActiveGroup = (pathname: string, group: NavGroup) => menuLinks(group).some((l) => isActivePath(pathname, l.href));

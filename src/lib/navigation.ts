// The site's global navigation (decision 42): four groups, named for a
// visitor's questions (why, what, on what terms, how to help) rather than
// the site's page list. The header shows the groups; the narrow-screen menu
// and the footer list every destination, so each keeps a place.
//
// The mapping of existing pages into the groups is a proposal for founder
// review before release (decision 42; Milestone 3.0 Phase 3a gate report).
// /living-trace and /memories are not in the navigation, as before.
export type NavLink = { href: string; label: string };
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
    links: [{ href: "/memory-project", label: "The Memory Project" }],
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

// A group is current when the visitor is on any of its pages.
export const isActiveGroup = (pathname: string, group: NavGroup) => group.links.some((l) => isActivePath(pathname, l.href));

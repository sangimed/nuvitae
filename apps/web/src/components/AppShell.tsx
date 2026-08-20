"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CommunityOwnerAccess } from "../features/community-auth/CommunityOwnerAccess";

const navigation = [
  { href: "/", label: "Home", matches: (path: string) => path === "/" },
  {
    href: "/import-resume",
    label: "Import resume",
    matches: (path: string) => path.startsWith("/import-resume"),
  },
  {
    href: "/resumes/new/manual",
    label: "Create resume",
    matches: (path: string) => path === "/resumes/new/manual",
  },
] as const;

type AppShellProps = {
  readonly children: ReactNode;
  readonly localPlayMode: boolean;
};

export function AppShell({ children, localPlayMode }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand-link" href="/" aria-label="Nuvitae home">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            <span className="brand-name">Nuvitae</span>
            <span className="brand-edition">Community</span>
          </span>
        </Link>

        <nav className="primary-navigation" aria-label="Primary navigation">
          {navigation.map((item) => {
            const current = item.matches(pathname);
            return (
              <Link
                className="navigation-link"
                href={item.href}
                key={item.href}
                aria-current={current ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {!localPlayMode ? (
          <div className="app-owner-access">
            <CommunityOwnerAccess />
          </div>
        ) : null}
      </header>
      <div className="app-content">{children}</div>
    </div>
  );
}

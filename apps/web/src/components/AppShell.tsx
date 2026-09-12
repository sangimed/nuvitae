"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CommunityOwnerAccess } from "../features/community-auth/CommunityOwnerAccess";
import { LanguageSelector, useTranslation } from "../i18n/LocaleProvider";

const navigation = [
  { href: "/", label: "shell.home", matches: (path: string) => path === "/" },
  {
    href: "/resumes",
    label: "shell.resumes",
    matches: (path: string) =>
      path === "/resumes" ||
      (path.startsWith("/resumes/") && path !== "/resumes/new/manual"),
  },
  {
    href: "/import-resume",
    label: "shell.import",
    matches: (path: string) => path.startsWith("/import-resume"),
  },
  {
    href: "/resumes/new/manual",
    label: "shell.create",
    matches: (path: string) => path === "/resumes/new/manual",
  },
] as const;

type AppShellProps = {
  readonly children: ReactNode;
  readonly localPlayMode: boolean;
};

export function AppShell({ children, localPlayMode }: AppShellProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("shell.skip")}
      </a>
      <header className="app-header">
        <Link className="brand-link" href="/" aria-label={t("shell.brand")}>
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            <span className="brand-name">Nuvitae</span>
            <span className="brand-edition">Community</span>
          </span>
        </Link>

        <nav className="primary-navigation" aria-label={t("shell.navigation")}>
          {navigation.map((item) => {
            const current = item.matches(pathname);
            return (
              <Link
                className="navigation-link"
                href={item.href}
                key={item.href}
                aria-current={current ? "page" : undefined}
              >
                {t(item.label)}
              </Link>
            );
          })}
        </nav>

        <LanguageSelector />
        {!localPlayMode ? (
          <div className="app-owner-access" lang="en" dir="ltr">
            <CommunityOwnerAccess />
          </div>
        ) : null}
      </header>
      {/* Unmigrated screens remain explicitly English until their copy is localized. */}
      <div className="app-content" id="main-content" lang="en" dir="ltr">
        {children}
      </div>
    </div>
  );
}

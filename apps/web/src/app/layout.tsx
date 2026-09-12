import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { direction, translate } from "../i18n/locale";
import { getAppLocale } from "../i18n/server";
import "./styles.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return {
    title: "Nuvitae",
    description: translate(locale, "metadata.description"),
  };
}

// A per-request render lets Next.js propagate the middleware CSP nonce to its
// framework bootstrap scripts and styles. Static assets remain independently
// cacheable under /_next/static.
export const dynamic = "force-dynamic";

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const localPlayMode = process.env.NUVITAE_LOCAL_PLAY_MODE === "true";
  const locale = await getAppLocale();

  return (
    <html
      lang={locale}
      dir={direction(locale)}
      className={`${inter.variable} ${sourceSerif.variable}`}
    >
      <body>
        <LocaleProvider initialLocale={locale}>
          <AppShell localPlayMode={localPlayMode}>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}

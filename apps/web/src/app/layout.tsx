import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import "./styles.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: "Nuvitae",
  description: "Create and improve your resume with Nuvitae Community",
};

// A per-request render lets Next.js propagate the middleware CSP nonce to its
// framework bootstrap scripts and styles. Static assets remain independently
// cacheable under /_next/static.
export const dynamic = "force-dynamic";

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  const localPlayMode = process.env.NUVITAE_LOCAL_PLAY_MODE === "true";

  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body>
        <AppShell localPlayMode={localPlayMode}>{children}</AppShell>
      </body>
    </html>
  );
}

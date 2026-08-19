import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import "./styles.css";

export const metadata: Metadata = {
  title: "Nuvitae",
  description: "Create and improve your resume with Nuvitae Community",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  const localPlayMode = process.env.NUVITAE_LOCAL_PLAY_MODE === "true";

  return (
    <html lang="en">
      <body>
        <AppShell localPlayMode={localPlayMode}>{children}</AppShell>
      </body>
    </html>
  );
}

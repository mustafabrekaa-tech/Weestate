import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Saira_Semi_Condensed } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });
const saira = Saira_Semi_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-saira" });
const plexAr = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "600", "700"], variable: "--font-plex-ar" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: { default: "WE-estate", template: "%s · WE-estate" },
  description: "Every project, one team.",
  applicationName: "WE-estate",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f7f6f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${saira.variable} ${plexAr.variable} ${plexMono.variable}`}>
      <body className="we-root">{children}</body>
    </html>
  );
}

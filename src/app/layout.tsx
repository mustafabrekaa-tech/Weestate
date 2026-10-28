import type { Metadata, Viewport } from "next";
import { Cinzel, IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Jost } from "next/font/google";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-jost" });
const cinzel = Cinzel({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-cinzel" });
const plexAr = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "600", "700"], variable: "--font-plex-ar" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: { default: "WE-estate", template: "%s · WE-estate" },
  description: "Every project, one team.",
  applicationName: "WE-estate",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#faf8f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jost.variable} ${cinzel.variable} ${plexAr.variable} ${plexMono.variable}`}>
      <body className="we-root">{children}</body>
    </html>
  );
}

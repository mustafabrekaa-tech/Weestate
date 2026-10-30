import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Saira_Semi_Condensed } from "next/font/google";
import { brandStyle, getBrand } from "@/lib/brand";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });
const saira = Saira_Semi_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-saira" });
const plexAr = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "600", "700"], variable: "--font-plex-ar" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  const name = b.company ? `${b.company.name} · ${b.appName}` : b.appName;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "Every project, one team.",
    applicationName: b.appName,
    manifest: "/manifest.webmanifest",
    icons: b.logo ? { icon: b.logo } : undefined,
    // Workspaces and the admin portal stay out of search results; the website opts in.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#f7f6f3",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const css = brandStyle((await getBrand()).color);
  return (
    <html lang="en" className={`${plex.variable} ${saira.variable} ${plexAr.variable} ${plexMono.variable}`}>
      <head>{css ? <style>{css}</style> : null}</head>
      <body className="we-root">{children}</body>
    </html>
  );
}

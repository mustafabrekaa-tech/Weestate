import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteInfo, type SiteText } from "@/lib/siteinfo";

// Text pages written in the admin portal: about us and the legal pages.
const PAGES: Record<string, [string, keyof SiteText]> = {
  about: ["About us", "about_text"],
  privacy: ["Privacy policy", "privacy_text"],
  terms: ["Terms of service", "terms_text"],
  refund: ["Refund policy", "refund_text"],
};

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const page = (await params).page;
  return { title: PAGES[page]?.[0], alternates: { canonical: `/${page}` } };
}

export default async function TextPage({ params }: { params: Promise<{ page: string }> }) {
  const page = PAGES[(await params).page];
  if (!page) notFound();
  const text = (await getSiteInfo())[page[1]].trim();
  if (!text) notFound();
  return (
    <main className="ws-sec">
      <article className="ws-wrap ws-legal">
        <h1>{page[0]}</h1>
        {text.split(/\n{2,}/).map((p, i) =>
          p.startsWith("## ") ? <h2 key={i}>{p.slice(3)}</h2> : <p key={i}>{p.split("\n").flatMap((l, j) => (j ? [<br key={j} />, l] : [l]))}</p>,
        )}
      </article>
    </main>
  );
}

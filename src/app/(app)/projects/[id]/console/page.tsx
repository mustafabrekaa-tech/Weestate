import type { Metadata } from "next";
import { ConsoleSection } from "@/components/ConsoleSection";

export const metadata: Metadata = { title: "Unit console" };

export default async function ConsolePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string; view?: string }> }) {
  const { id } = await params;
  const { mode, view } = await searchParams;
  const m = (["handover", "construction", "sales", "delivery"] as const).find((x) => x === mode);
  const v = (["plan", "tiles", "3d"] as const).find((x) => x === view);
  return (
    <div className="we-stack">
      {(await ConsoleSection({ projectId: id, mode: m ?? "handover", view: v, title: "Unit console", height: 680 })) ?? (
        <div className="we-card we-empty">
          <p>No units in this project yet. Add them under Units and sales, or upload them from Excel.</p>
        </div>
      )}
    </div>
  );
}

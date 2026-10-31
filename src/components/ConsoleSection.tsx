import { bulkConstruction, bulkDelivery, bulkHandover, bulkPriority } from "@/app/(app)/projects/[id]/actions";
import { loadConsole } from "@/lib/console";
import { acts, getMe } from "@/lib/data";
import { getScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { type Mode, UnitConsole } from "./UnitConsole";

// The unit console for one project, loaded on the server.
export async function ConsoleSection({ projectId, mode, view, title, height, q, stage }: {
  projectId: string; mode?: Mode; view?: "plan" | "tiles" | "3d"; title?: string; height?: number; q?: string; stage?: string;
}) {
  const supabase = await createClient();
  const [data, me, scope] = await Promise.all([loadConsole(supabase, projectId), getMe(), getScope(projectId)]);
  if (!data.units.length) return null;
  return (
    <UnitConsole
      projectId={projectId}
      {...data}
      initialMode={mode}
      initialView={view}
      title={title}
      height={height}
      initial={{ phase: scope.phase, zone: scope.zone }}
      initialQ={q}
      initialStage={stage}
      can={{
        handover: acts(me, ["pm", "handover", "quality", "site", "tech_office"]),
        build: acts(me, ["site", "tech_office", "quality", "pm", "cost_control"]),
        dates: acts(me, ["pm", "cost_control", "handover", "sales"]),
        priority: acts(me, ["pm", "handover", "quality", "site", "tech_office", "cost_control"]),
      }}
      actions={{
        handover: bulkHandover.bind(null, projectId),
        construction: bulkConstruction.bind(null, projectId),
        delivery: bulkDelivery.bind(null, projectId),
        priority: bulkPriority.bind(null, projectId),
      }}
    />
  );
}

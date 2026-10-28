import type { Metadata } from "next";
import { QueueTable } from "@/components/QueueTable";
import { getMe, sortQueue, type QueueItem } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Waiting on me" };

export default async function MyWork() {
  const me = await getMe();
  const supabase = await createClient();
  const { data } = me?.department
    ? await supabase.from("work_queue").select("*").eq("department", me.department)
    : { data: [] };
  const items = sortQueue((data ?? []) as QueueItem[]);
  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow">My work</div>
          <h1>Waiting on me</h1>
        </div>
      </div>
      <QueueTable items={items} myDepartment={me?.department} showProject empty="Nothing is waiting on you. Well done." />
    </>
  );
}

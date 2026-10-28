import { notFound } from "next/navigation";
import { QueueTable } from "@/components/QueueTable";
import { getMe, sortQueue, type QueueItem } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function DepartmentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: dept }, { data }] = await Promise.all([
    supabase.from("departments").select("*").eq("code", code).maybeSingle(),
    supabase.from("work_queue").select("*").eq("department", code),
  ]);
  if (!dept) notFound();
  const items = sortQueue((data ?? []) as QueueItem[]);
  const late = items.filter((q) => q.overdue).length;
  return (
    <>
      <div className="we-pagehead">
        <div>
          <div className="we-eyebrow" lang="ar" dir="rtl" style={{ textAlign: "left" }}>{dept.name_ar}</div>
          <h1>{dept.name}</h1>
        </div>
        <span className="we-help">{items.length} waiting · {late} overdue</span>
      </div>
      <QueueTable items={items} myDepartment={me?.department} showProject empty={`Nothing is waiting on ${dept.name}.`} />
    </>
  );
}

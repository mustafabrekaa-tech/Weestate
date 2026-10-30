import { redirect } from "next/navigation";
import { PortalNav } from "@/components/PortalNav";
import { getBrand } from "@/lib/brand";
import { getMe } from "@/lib/data";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [me, brand] = await Promise.all([getMe(), getBrand()]);
  if (!me?.is_platform_admin) redirect("/");
  return (
    <>
      <PortalNav appName={brand.appName} />
      {children}
    </>
  );
}

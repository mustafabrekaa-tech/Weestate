"use client";

import Link from "next/link";
import { Icon } from "./AppNav";
import { useCurrentProject, type ProjectItem } from "./useCurrentProject";

// The project picker and unit search in the top bar; both follow the project being viewed.
export function ProjectSwitch({ list, company, canSetup }: { list: ProjectItem[]; company: string; canSetup: boolean }) {
  const current = useCurrentProject(list);
  if (!current) return null;
  const at = (p: ProjectItem) => `/projects/${p.slug || p.id}`;
  return (
    <>
      <details className="we-menu we-appbar__switch" key={current.id}>
        <summary className="we-projbtn">
          <span className="we-projbtn__lbl">Project</span>
          <span className="we-projbtn__name">{current.name}</span>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
        </summary>
        <div className="we-menu__list">
          <span className="we-menu__who">{company}</span>
          {list.map((p) => <Link key={p.id} href={at(p)} aria-current={p.id === current.id ? "true" : undefined}>{p.name}</Link>)}
          {canSetup && <Link href="/projects/new">+ New project</Link>}
        </div>
      </details>
      <form className="we-appsearch" action={`${at(current)}/console`} method="get" role="search">
        <Icon name="map" size={18} />
        <input name="q" type="search" placeholder="Find a unit, e.g. A03-014" aria-label="Find a unit" />
      </form>
    </>
  );
}

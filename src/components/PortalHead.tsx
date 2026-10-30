// Page title block for portal pages.
export function PortalHead({ title, lead, children, eyebrow = "WE-estate platform" }: { title: string; lead?: string; children?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="we-pagehead we-portal__head">
      <div>
        <div className="we-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {lead && <p className="we-portal__lead">{lead}</p>}
      </div>
      {children && <div className="we-row">{children}</div>}
    </div>
  );
}

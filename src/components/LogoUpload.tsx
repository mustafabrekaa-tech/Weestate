"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Uploads a logo to the public branding store and keeps its address in a
// hidden form field, so the surrounding form saves it.
export function LogoUpload({ name, folder, value }: { name: string; folder: string; value: string }) {
  const [url, setUrl] = useState(value);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(f: File) {
    setError("");
    if (f.size > 2 * 1024 * 1024) return setError("Use a file under 2 MB.");
    setBusy(true);
    const ext = (f.name.split(".").pop() || "png").toLowerCase();
    const path = `${folder}/logo-${Date.now()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("branding").upload(path, f, { contentType: f.type, upsert: true });
    setBusy(false);
    if (error) return setError(error.message.includes("row-level") ? "Only an admin can change the logo." : error.message);
    setUrl(supabase.storage.from("branding").getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="we-stack" style={{ gap: 8 }}>
      <input type="hidden" name={name} value={url} />
      <div className="we-row">
        {url ? <img src={url} alt="Current logo" className="we-logo-preview" /> : <span className="we-help">No logo yet.</span>}
        <label className="we-btn we-btn--secondary we-btn--sm">
          {busy ? "Uploading…" : url ? "Replace" : "Upload logo"}
          <input type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        </label>
        {url && <button type="button" className="we-link" onClick={() => setUrl("")}>Remove</button>}
      </div>
      <span className="we-help">PNG, SVG or JPG, wide format works best. Press Save after uploading.</span>
      {error && <span className="we-help is-error">{error}</span>}
    </div>
  );
}

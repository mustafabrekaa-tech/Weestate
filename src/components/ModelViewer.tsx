"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { UNIT_STATUS, type SiteModel, type SiteUnit } from "@/lib/site";

// Shows an uploaded 3D model (glTF / GLB) of the project. Parts named after a
// unit code (for example "B01-101") are coloured by that unit's status and can
// be clicked to open the unit.
export function ModelViewer({
  projectId, models, units, canUpload, onPickUnit, pickedCode, addModel, removeModel,
}: {
  projectId: string;
  models: SiteModel[];
  units: SiteUnit[];
  canUpload: boolean;
  onPickUnit: (id: string) => void;
  pickedCode?: string;
  addModel: (m: { name: string; url: string; size: number }) => Promise<ActionResult>;
  removeModel: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(models[0]?.id ?? "");
  const [status, setStatus] = useState("");
  const [colour, setColour] = useState(true);
  const [busy, setBusy] = useState(false);
  const pickRef = useRef(onPickUnit);
  pickRef.current = onPickUnit;
  const model = models.find((m) => m.id === current) ?? models[0];
  const pickedRef = useRef(pickedCode);
  const colourRef = useRef(colour);
  const repaintRef = useRef<() => void>(() => {});
  pickedRef.current = pickedCode;
  colourRef.current = colour;

  useEffect(() => {
    if (!model || !box.current) return;
    let disposed = false;
    let cleanup = () => {};
    setStatus("Loading model…");
    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !box.current) return;
      const el = box.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#dfe6ea");
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(60, 120, 40);
      scene.add(sun);
      const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI / 2.05;

      const draco = new DRACOLoader();
      draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);

      const byCode = new Map(units.map((u) => [u.code.toLowerCase(), u]));
      const unitFor = (o: import("three").Object3D | null): SiteUnit | undefined => {
        for (let x = o; x; x = x.parent) {
          const u = byCode.get(x.name.toLowerCase().trim()) ?? byCode.get(x.name.toLowerCase().replace(/[_\s]+/g, "-"));
          if (u) return u;
        }
        return undefined;
      };
      let root: import("three").Object3D | null = null;
      const original = new Map<import("three").Mesh, import("three").Material | import("three").Material[]>();

      loader.load(
        model.url,
        (gltf) => {
          if (disposed) return;
          root = gltf.scene;
          scene.add(root);
          const bbox = new THREE.Box3().setFromObject(root);
          const size = bbox.getSize(new THREE.Vector3()).length() || 10;
          const mid = bbox.getCenter(new THREE.Vector3());
          camera.position.copy(mid).add(new THREE.Vector3(size * 0.6, size * 0.45, size * 0.6));
          camera.near = size / 1000;
          camera.far = size * 20;
          camera.updateProjectionMatrix();
          controls.target.copy(mid);
          let matched = 0;
          root.traverse((o) => {
            const m = o as import("three").Mesh;
            if (!m.isMesh) return;
            original.set(m, m.material);
            if (unitFor(m)) matched++;
          });
          paint();
          setStatus(matched ? `${matched} parts linked to units` : "No parts are named after unit codes yet");
        },
        (e) => e.total && setStatus(`Loading model… ${Math.round((e.loaded / e.total) * 100)}%`),
        () => setStatus("Could not open this file. Use .glb or .gltf with embedded textures."),
      );

      function paint() {
        for (const [m, mat] of original) {
          const u = unitFor(m);
          if (!u || !colourRef.current) { m.material = mat; continue; }
          const picked = pickedRef.current && u.code === pickedRef.current;
          m.material = new THREE.MeshStandardMaterial({
            color: picked ? "#ffffff" : UNIT_STATUS[u.status]?.color ?? "#c9c3b8",
            emissive: picked ? "#c9a24e" : "#000000",
            emissiveIntensity: picked ? 0.6 : 0,
            roughness: 0.7,
          });
        }
      }
      repaintRef.current = paint;

      const ray = new THREE.Raycaster();
      const down = { x: 0, y: 0 };
      const onDown = (e: PointerEvent) => { down.x = e.clientX; down.y = e.clientY; };
      const onUp = (e: PointerEvent) => {
        if (!root || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hit = ray.intersectObject(root, true)[0];
        const u = hit && unitFor(hit.object);
        if (u) pickRef.current(u.id);
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      const ro = new ResizeObserver(() => {
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
        camera.updateProjectionMatrix();
      });
      ro.observe(el);
      renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
      });
      cleanup = () => {
        ro.disconnect();
        renderer.setAnimationLoop(null);
        controls.dispose();
        draco.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, units]);

  // Re-colour when the picked unit or the colour switch changes.
  useEffect(() => repaintRef.current(), [pickedCode, colour]);

  async function upload(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["glb", "gltf"].includes(ext ?? "")) return setStatus("Upload a .glb or .gltf file. Export from Revit, SketchUp, Rhino or Blender as glTF.");
    if (f.size > 50 * 1024 * 1024) return setStatus("That file is over 50 MB. Export with Draco compression or simplify the model.");
    setBusy(true);
    setStatus("Uploading…");
    const supabase = createClient();
    const path = `${projectId}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from("models").upload(path, f, { contentType: ext === "glb" ? "model/gltf-binary" : "model/gltf+json" });
    if (error) {
      setBusy(false);
      return setStatus(error.message.includes("row-level") ? "Only PM, Technical office, Cost control or Sales can upload models." : error.message);
    }
    const url = supabase.storage.from("models").getPublicUrl(path).data.publicUrl;
    const r = await addModel({ name: f.name.replace(/\.(glb|gltf)$/i, ""), url, size: f.size });
    setBusy(false);
    setStatus(r?.error ?? "Uploaded.");
  }

  return (
    <div className="we-model">
      <div className="we-model__bar">
        {models.length > 1 && (
          <select className="we-input we-select we-input--sm" value={model?.id} onChange={(e) => setCurrent(e.target.value)} aria-label="Model">
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {model && (
          <label className="we-row" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={colour} onChange={(e) => setColour(e.target.checked)} /> Colour units by status
          </label>
        )}
        <span className="we-help" style={{ flex: 1 }}>{status}</span>
        {canUpload && (
          <label className="we-btn we-btn--secondary we-btn--sm">
            {busy ? "Uploading…" : "Upload 3D model"}
            <input type="file" hidden accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={busy} />
          </label>
        )}
        {canUpload && model && <button type="button" className="we-link" onClick={() => removeModel(model.id)}>Remove</button>}
      </div>
      {model ? (
        <div ref={box} className="we-model__stage" role="region" aria-label={`3D model ${model.name}`} />
      ) : (
        <div className="we-model__stage we-empty" style={{ display: "grid", placeContent: "center", gap: 8 }}>
          <b>No 3D model yet</b>
          <span className="we-help" style={{ maxWidth: 420 }}>
            Export the masterplan or a building from Revit, SketchUp, Rhino, 3ds Max or Blender as a .glb file (up to 50 MB) and upload it here.
            Name each unit&apos;s part after its unit code, such as B01-101, and it will light up by sales status and open when clicked.
          </span>
        </div>
      )}
    </div>
  );
}

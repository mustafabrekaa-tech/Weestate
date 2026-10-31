"use client";

import { useEffect, useRef, useState } from "react";
import type * as T from "three";
import { HANDOVER_BY_KEY } from "@/lib/handover";
import type { CBuilding, CUnit } from "./UnitConsole";

const FLOOR = 9; // storey height, in masterplan pixels

type Box = { id: string; cx: number; cz: number; w: number; d: number; y0: number; y1: number; a: number };

// Turns each unit's outline on the masterplan into a block. Buildings whose
// units sit on several floors are drawn on the plan as an elevation (top row =
// top floor), so those become one building with the units stacked inside it.
function blocks(units: CUnit[], buildings: CBuilding[]): Box[] {
  const bmap = new Map(buildings.map((b) => [b.id, b]));
  const groups = new Map<string, CUnit[]>();
  for (const u of units) {
    if (!u.poly || u.poly.length < 3) continue;
    const k = u.building ?? u.id;
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }
  const out: Box[] = [];
  for (const [k, us] of groups) {
    const b = bmap.get(k);
    const p0 = us[0]!.poly!;
    const a = Math.atan2(p0[1]![1] - p0[0]![1], p0[1]![0] - p0[0]![0]);
    const c = Math.cos(-a), s = Math.sin(-a);
    const loc = (p: [number, number]) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c] as const;
    const back = (x: number, y: number) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as const;
    const floors = new Set(us.map((u) => u.floor ?? 0));
    const stacked = floors.size > 1;
    const levels = Math.max(b?.floors ?? 0, stacked ? 4 : 2);
    const H = levels * FLOOR;
    const lb = us.map((u) => {
      const pts = u.poly!.map(loc);
      return { u, x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
    });
    if (stacked) {
      const Y0 = Math.min(...lb.map((l) => l.y0)), Y1 = Math.max(...lb.map((l) => l.y1));
      const span = Y1 - Y0 || 1;
      for (const l of lb) {
        const top = ((Y1 - l.y0) / span) * H, bot = ((Y1 - l.y1) / span) * H;
        const [cx, cz] = back((l.x0 + l.x1) / 2, (Y0 + Y1) / 2);
        out.push({ id: l.u.id, cx, cz, w: l.x1 - l.x0, d: span, y0: bot, y1: top, a });
      }
    } else {
      for (const l of lb) {
        const [cx, cz] = back((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2);
        out.push({ id: l.u.id, cx, cz, w: l.x1 - l.x0, d: l.y1 - l.y0, y0: 0, y1: H, a });
      }
    }
  }
  return out;
}

export function Plan3D({ image, w, h, units, buildings, matches, sel, colorOf, onPick }: {
  image: string; w: number; h: number; units: CUnit[]; buildings: CBuilding[];
  matches: Set<string>; sel: Set<string>; colorOf: (u: CUnit) => string; onPick: (id: string, additive: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const meshes = useRef(new Map<string, T.Mesh>());
  const paintRef = useRef<() => void>(() => {});
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const state = useRef({ matches, sel, colorOf });
  state.current = { matches, sel, colorOf };
  const [tip, setTip] = useState<null | { x: number; y: number; u: CUnit }>(null);
  const resetRef = useRef<() => void>(() => {});
  const viewRef = useRef<(k: "3d" | "plan" | "south" | "east") => void>(() => {});
  const [cam, setCam] = useState<"3d" | "plan" | "south" | "east">("3d");
  const unitsRef = useRef(new Map(units.map((u) => [u.id, u])));
  unitsRef.current = new Map(units.map((u) => [u.id, u]));
  // Rebuild the blocks only when the shapes change, not when a status does.
  const geoKey = units.map((u) => (u.poly ? u.id + u.poly[0]!.join() : "")).join("|").length + ":" + units.length + ":" + buildings.length;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !box.current) return;
      const el = box.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#e9eef1");
      scene.fog = new THREE.Fog("#e9eef1", w * 1.6, w * 3.2);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ad94, 1.5));
      const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
      sun.position.set(w * 0.2, 900, -h * 0.4);
      sun.target.position.set(w / 2, 0, h / 2);
      sun.castShadow = true;
      sun.shadow.mapSize.set(4096, 4096);
      Object.assign(sun.shadow.camera, { left: -w * 0.7, right: w * 0.7, top: h * 1.1, bottom: -h * 1.1, near: 10, far: 3000 });
      sun.shadow.bias = -0.0005;
      scene.add(sun, sun.target);

      // The masterplan as the ground, with a soft edge around it.
      const tex = await new THREE.TextureLoader().loadAsync(image);
      if (disposed) { renderer.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(w / 2, 0, h / 2);
      ground.receiveShadow = true;
      scene.add(ground);
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(w * 4, h * 6), new THREE.MeshLambertMaterial({ color: "#dfe3dc" }));
      apron.rotation.x = -Math.PI / 2;
      apron.position.set(w / 2, -0.5, h / 2);
      apron.receiveShadow = true;
      scene.add(apron);

      const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 5, 20000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI / 2.15;
      controls.minDistance = 60;
      controls.maxDistance = w * 2.2;
      controls.screenSpacePanning = false;
      const reset = () => {
        camera.position.set(w * 0.5, w * 0.42, h * 1.45);
        controls.target.set(w / 2, 0, h / 2);
        controls.update();
      };
      reset();
      resetRef.current = reset;
      // Camera presets: straight down (plan), from the south or east (elevations), or the 3D angle. Glides there.
      let tween: null | { t0: number; from: T.Vector3; to: T.Vector3; tf: T.Vector3; tt: T.Vector3 } = null;
      viewRef.current = (k) => {
        const to = new THREE.Vector3(), tt = new THREE.Vector3(w / 2, 0, h / 2);
        if (k === "plan") to.set(w / 2, Math.max(w, h * 2) * 0.95, h / 2 + 1);
        else if (k === "south") { to.set(w / 2, 45, h + w * 0.14); tt.set(w / 2, 30, h * 0.62); }
        else if (k === "east") { to.set(w + h * 0.3, 45, h / 2); tt.set(w * 0.72, 30, h / 2); }
        else to.set(w * 0.5, w * 0.42, h * 1.45);
        controls.maxPolarAngle = k === "south" || k === "east" ? Math.PI / 2 : Math.PI / 2.15;
        tween = { t0: performance.now(), from: camera.position.clone(), to, tf: controls.target.clone(), tt };
      };
      const step = () => {
        if (!tween) return;
        const k = Math.min(1, (performance.now() - tween.t0) / 700);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        camera.position.lerpVectors(tween.from, tween.to, e);
        controls.target.lerpVectors(tween.tf, tween.tt, e);
        if (k >= 1) tween = null;
      };

      const byId = { get: (id: string) => unitsRef.current.get(id) };
      const edgeMat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 });
      const group = new THREE.Group();
      for (const bx of blocks(units, buildings)) {
        const gap = 0.6;
        const geo = new THREE.BoxGeometry(Math.max(1, bx.w - gap), Math.max(1, bx.y1 - bx.y0 - gap * 0.6), Math.max(1, bx.d - gap));
        const mat = new THREE.MeshLambertMaterial({ color: "#cccccc", transparent: true });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(bx.cx, (bx.y0 + bx.y1) / 2, bx.cz);
        m.rotation.y = -bx.a;
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.id = bx.id;
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
        group.add(m);
        meshes.current.set(bx.id, m);
      }
      scene.add(group);

      const paint = () => {
        const { matches: mt, sel: sl, colorOf: col } = state.current;
        for (const [id, m] of meshes.current) {
          const u = byId.get(id);
          if (!u) continue;
          const mat = m.material as T.MeshLambertMaterial;
          const on = mt.has(id);
          const picked = sl.has(id);
          mat.color.set(on ? col(u) : "#d5d9de");
          mat.opacity = on ? 1 : 0.28;
          mat.depthWrite = on;
          mat.emissive.set(picked ? "#c9a24e" : "#000000");
          mat.emissiveIntensity = picked ? 0.35 : 0;
          m.scale.y = picked ? 1.06 : 1;
          m.castShadow = on;
        }
      };
      paintRef.current = paint;
      paint();

      let frame = 0;
      const loop = () => { frame = requestAnimationFrame(loop); step(); controls.update(); renderer.render(scene, camera); };
      loop();

      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const hit = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObjects(group.children, false);
        for (const x of hits) {
          const id = x.object.userData.id as string | undefined;
          if (id && state.current.matches.has(id)) return id;
        }
        return null;
      };
      let down: { x: number; y: number } | null = null;
      let hoverAt = 0;
      const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        if (down && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) < 5 && e.button === 0) {
          const id = hit(e);
          if (id) pickRef.current(id, e.ctrlKey || e.metaKey || e.shiftKey);
        }
        down = null;
      };
      const onMove = (e: PointerEvent) => {
        if (down) { setTip(null); return; }
        const now = performance.now();
        if (now - hoverAt < 60) return;
        hoverAt = now;
        const id = hit(e);
        const u = id ? byId.get(id) : undefined;
        const r = el.getBoundingClientRect();
        setTip(u ? { x: e.clientX - r.left, y: e.clientY - r.top, u } : null);
        renderer.domElement.style.cursor = u ? "pointer" : "grab";
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerleave", () => setTip(null));
      const ro = new ResizeObserver(() => {
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      });
      ro.observe(el);

      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        controls.dispose();
        group.traverse((o) => {
          const m = o as T.Mesh;
          m.geometry?.dispose();
          const mat = m.material as T.Material | undefined;
          mat?.dispose?.();
        });
        tex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        meshes.current.clear();
      };
    })();
    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, w, h, geoKey]);

  useEffect(() => { paintRef.current(); }, [matches, sel, colorOf, units]);

  return (
    <div className="we-uc__stage we-uc__stage--3d" ref={box}>
      <div className="we-uc__cams" role="group" aria-label="Camera">
        {([["3d", "3D"], ["plan", "Plan"], ["south", "Elevation S"], ["east", "Elevation E"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={cam === k} className={cam === k ? "is-on" : ""} onClick={() => { setCam(k); viewRef.current(k); }}>{l}</button>
        ))}
      </div>
      {tip && (
        <div className="we-uc__tip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          <b>{tip.u.code}</b> · {tip.u.type}<br />
          {HANDOVER_BY_KEY[tip.u.ho]?.label} · built {tip.u.pct.toFixed(0)}%
        </div>
      )}
    </div>
  );
}

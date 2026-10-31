"use client";

import type { Map as MlMap } from "maplibre-gl";
import type { ModelPlacement } from "@/lib/site";

// Draws uploaded glTF / GLB models on the MapLibre satellite map with three.js, each standing at its
// saved spot, turned and scaled. The model's own footprint is centred on that spot and its lowest
// point sits on the ground (plus the height offset), so exports with large site coordinates still land.
export type MapModel = { id: string; url: string; placement: ModelPlacement };

export async function addModelLayer(map: MlMap, initial: MapModel[]) {
  const THREE = await import("three");
  const ml = await import("maplibre-gl");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");

  type Entry = { root: import("three").Object3D | null; placement: ModelPlacement; url: string };
  const entries = new Map<string, Entry>();
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(60, 120, 40);
  scene.add(sun);
  let renderer: import("three").WebGLRenderer | null = null;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  loader.setDRACOLoader(draco);

  const load = (id: string, url: string) => {
    loader.load(url, (gltf) => {
      const e = entries.get(id);
      if (!e || e.url !== url) return;
      const inner = gltf.scene;
      // CAD exports often mix face directions: draw both sides so no wall goes missing.
      inner.traverse((o) => {
        const mesh = o as import("three").Mesh;
        if (!mesh.isMesh) return;
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.side = THREE.DoubleSide;
      });
      const box = new THREE.Box3().setFromObject(inner);
      const c = box.getCenter(new THREE.Vector3());
      inner.position.set(-c.x, -box.min.y, -c.z);
      const holder = new THREE.Group();
      holder.add(inner);
      holder.visible = false;
      scene.add(holder);
      e.root = holder;
      map.triggerRepaint();
    });
  };

  const set = (list: MapModel[]) => {
    const keep = new Set(list.map((m) => m.id));
    for (const [id, e] of entries) if (!keep.has(id)) { if (e.root) scene.remove(e.root); entries.delete(id); }
    for (const m of list) {
      const e = entries.get(m.id);
      if (e && e.url === m.url) { e.placement = m.placement; continue; }
      if (e?.root) scene.remove(e.root);
      entries.set(m.id, { root: null, placement: m.placement, url: m.url });
      load(m.id, m.url);
    }
    map.triggerRepaint();
  };

  map.addLayer({
    id: "models3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(_m, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    },
    render(_gl, args) {
      if (!renderer) return;
      const main = new THREE.Matrix4().fromArray((args as { defaultProjectionData: { mainMatrix: number[] } }).defaultProjectionData.mainMatrix);
      for (const e of entries.values()) {
        if (!e.root) continue;
        const p = e.placement;
        const mc = ml.MercatorCoordinate.fromLngLat([p.lng, p.lat], p.alt ?? 0);
        const s = mc.meterInMercatorCoordinateUnits() * (p.scale || 1);
        const local = new THREE.Matrix4()
          .makeTranslation(mc.x, mc.y, mc.z ?? 0)
          .scale(new THREE.Vector3(s, -s, s))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
          .multiply(new THREE.Matrix4().makeRotationY((-(p.rot || 0) * Math.PI) / 180));
        camera.projectionMatrix = main.clone().multiply(local);
        for (const o of entries.values()) if (o.root) o.root.visible = o === e;
        renderer.resetState();
        renderer.render(scene, camera);
      }
    },
  });
  set(initial);
  return { set };
}

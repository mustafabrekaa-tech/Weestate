// MapLibre loads its tile worker from a separate file; serve the installed
// version from /public so the bundler doesn't have to.
import { copyFileSync } from "node:fs";

copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");

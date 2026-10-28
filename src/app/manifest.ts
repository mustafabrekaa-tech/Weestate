import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WE-estate",
    short_name: "WE-estate",
    description: "Project control for M Squared Developments",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1f6",
    theme_color: "#1a3a8f",
    icons: [
      { src: "/weestate-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

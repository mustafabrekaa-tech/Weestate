import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WE-estate",
    short_name: "WE-estate",
    description: "Project control for real-estate developers",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#faf8f3",
    icons: [
      { src: "/weestate-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

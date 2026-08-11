import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "360Configurator",
    short_name: "360Configurator",
    description: "Industrial 3D visual and spatial product configuration for complex products.",
    start_url: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#0761AA",
    categories: ["business", "productivity", "design"],
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

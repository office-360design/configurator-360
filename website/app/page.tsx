import type { Metadata } from "next";
import { LocalizedHome } from "../components/localized-home";
import { pageMetadata } from "../lib/seo";

export const metadata: Metadata = pageMetadata({
  locale: "en",
  title: "Industrial 3D Product Configuration",
  description: "Industrial 3D visual and spatial product configuration for complex products, real-time pricing and production-ready outputs.",
});

export default function Home() {
  return <LocalizedHome locale="en" />;
}

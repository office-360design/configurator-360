import type { Metadata } from "next";
import { LocalizedHome } from "../components/localized-home";
import { pageMetadata } from "../lib/seo";
import { homeMetadata } from "../lib/commercial-content";

export const metadata: Metadata = pageMetadata({
  locale: "en",
  ...homeMetadata.en,
});

export default function Home() {
  return <LocalizedHome locale="en" />;
}

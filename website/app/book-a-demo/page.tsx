import type { Metadata } from "next";
import { DemoRequestPage } from "../../components/demo-request-page";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({
  locale: "en",
  path: "/book-a-demo",
  title: "Book a demo",
  description: "Request a focused 360Configurator product demonstration.",
});

export default function Page() {
  return <DemoRequestPage locale="en" />;
}

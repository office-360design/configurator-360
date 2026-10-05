import type { Metadata } from "next";
import { LocalizedConfiguratorPage } from "../../../components/localized-configurator-page";
import { getConfigurator } from "../../../lib/configurators";
import { pageMetadata } from "../../../lib/seo";

const item = getConfigurator("roof");

if (!item) {
  throw new Error("Roof configurator marketing data is missing.");
}

export const metadata: Metadata = pageMetadata({
  locale: "en",
  path: "/configurators/roof",
  title: item.seoTitle,
  description: item.seoDescription,
});

export default function RoofConfiguratorMarketingPage() {
  return <LocalizedConfiguratorPage locale="en" slug="roof" />;
}

import type { Metadata } from "next";
import { configurators, getConfigurator } from "../../../lib/configurators";
import { LocalizedConfiguratorPage } from "../../../components/localized-configurator-page";
import { pageMetadata } from "../../../lib/seo";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return configurators.filter((item) => item.slug !== "roof").map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = getConfigurator(slug);
  if (!item) return {};
  return pageMetadata({ locale: "en", path: `/configurators/${item.slug}`, title: item.seoTitle, description: item.seoDescription });
}

export default async function ConfiguratorPage({ params }: PageProps) {
  const { slug } = await params;
  return <LocalizedConfiguratorPage locale="en" slug={slug} />;
}

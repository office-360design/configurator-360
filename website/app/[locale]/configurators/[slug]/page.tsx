import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { configurators } from "../../../../lib/configurators";
import { getLocalizedConfigurator } from "../../../../lib/configurators-localized";
import { pageMetadata } from "../../../../lib/seo";
import { isLocale } from "../../../../lib/i18n";
import { LocalizedConfiguratorPage } from "../../../../components/localized-configurator-page";
type Props = { params: Promise<{ locale: string; slug: string }> };
export function generateStaticParams() { return ["ro", "de"].flatMap(locale => configurators.map(item => ({ locale, slug: item.slug }))); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale, slug } = await params; if (!isLocale(locale) || locale === "en") return {}; const item = getLocalizedConfigurator(locale, slug); if (!item) return {}; return pageMetadata({ locale, path: `/configurators/${slug}`, title: item.seoTitle, description: item.seoDescription }); }
export default async function LocaleConfigurator({ params }: Props) { const { locale, slug } = await params; if (!isLocale(locale) || locale === "en") notFound(); return <LocalizedConfiguratorPage locale={locale} slug={slug} />; }

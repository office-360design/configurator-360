import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalizedHome } from "../../components/localized-home";
import { isLocale } from "../../lib/i18n";
import { pageMetadata } from "../../lib/seo";
import { homeMetadata } from "../../lib/commercial-content";

type Props = { params: Promise<{ locale: string }> };
export function generateStaticParams() { return [{ locale: "ro" }, { locale: "de" }]; }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || locale === "en") return {};
  return pageMetadata({ locale, ...homeMetadata[locale] });
}
export default async function LocaleHome({ params }: Props) { const { locale } = await params; if (!isLocale(locale) || locale === "en") notFound(); return <LocalizedHome locale={locale} />; }

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingPage } from "../../../components/pricing-page";
import { isLocale } from "../../../lib/i18n";
import { pageMetadata } from "../../../lib/seo";
import { pricingGuideCopy } from "../../../lib/commercial-content";

type Props = { params: Promise<{ locale: string }> };
export function generateStaticParams() { return [{ locale: "ro" }, { locale: "de" }]; }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale) || locale === "en") return {}; return pageMetadata({ locale, path: "/pricing", ...pricingGuideCopy[locale].metadata }); }
export default async function Page({ params }: Props) { const { locale } = await params; if (!isLocale(locale) || locale === "en") notFound(); return <PricingPage locale={locale}/>; }

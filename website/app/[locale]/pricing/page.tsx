import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingPage } from "../../../components/pricing-page";
import { isLocale } from "../../../lib/i18n";
import { pageMetadata } from "../../../lib/seo";

type Props = { params: Promise<{ locale: string }> };
export function generateStaticParams() { return [{ locale: "ro" }, { locale: "de" }]; }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale) || locale === "en") return {}; return locale === "ro" ? pageMetadata({ locale, path: "/pricing", title: "Modele de implementare și prețuri", description: "Compară traseele comerciale prin abonament, sistem adaptat și sistem personalizat pentru 360Configurator." }) : pageMetadata({ locale, path: "/pricing", title: "Implementierungsmodelle und Preise", description: "Vergleichen Sie Abonnement, angepasstes System und individuelle Implementierung für 360Configurator." }); }
export default async function Page({ params }: Props) { const { locale } = await params; if (!isLocale(locale) || locale === "en") notFound(); return <PricingPage locale={locale}/>; }

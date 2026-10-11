import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoRequestPage } from "../../../components/demo-request-page";
import { isLocale } from "../../../lib/i18n";
import { pageMetadata } from "../../../lib/seo";

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return [{ locale: "ro" }, { locale: "de" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || locale === "en") return {};
  return locale === "ro"
    ? pageMetadata({ locale, path: "/book-a-demo", title: "Programează un demo", description: "Solicită o demonstrație 360Configurator adaptată produsului tău." })
    : pageMetadata({ locale, path: "/book-a-demo", title: "Demo anfragen", description: "Fordern Sie eine gezielte 360Configurator Produktdemo an." });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale) || locale === "en") notFound();
  return <DemoRequestPage locale={locale} />;
}

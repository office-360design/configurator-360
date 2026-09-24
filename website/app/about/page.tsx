import type { Metadata } from "next";
import { AboutPage } from "../../components/editorial-pages";
import { pageMetadata } from "../../lib/seo";
export const metadata: Metadata = pageMetadata({ locale: "en", path: "/about", title: "About us", description: "The product thinking, engineering principles and research behind 360Configurator." });
export default function Page(){ return <AboutPage locale="en"/>; }

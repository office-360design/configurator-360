import type { Metadata } from "next";
import { ContactPage } from "../../components/editorial-pages";
import { pageMetadata } from "../../lib/seo";
export const metadata: Metadata = pageMetadata({ locale: "en", path: "/contact", title: "Contact us", description: "Discuss a custom spatial 3D product configurator with 360Configurator." });
export default function Page(){ return <ContactPage locale="en"/>; }

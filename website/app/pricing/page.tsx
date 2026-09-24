import type { Metadata } from "next";
import { PricingPage } from "../../components/pricing-page";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ locale: "en", path: "/pricing", title: "Deployment paths and pricing", description: "Compare subscription, adapted-system and custom-system deployment paths for 360Configurator." });
export default function Page() { return <PricingPage locale="en"/>; }

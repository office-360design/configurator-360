import type { Metadata } from "next";
import { PricingPage } from "../../components/pricing-page";
import { pricingGuideCopy } from "../../lib/commercial-content";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ locale: "en", path: "/pricing", ...pricingGuideCopy.en.metadata });
export default function Page() { return <PricingPage locale="en"/>; }

"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const GA_ID = "G-2E433G5VM7";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();
  const firstPath = useRef(true);

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    window.gtag?.("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  return (
    <>
      <Script id="google-analytics-bootstrap" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
      <Script
        id="google-analytics"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="lazyOnload"
      />
    </>
  );
}

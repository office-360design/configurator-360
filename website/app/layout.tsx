import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./homepage-polish.css";
import { languageAlternates, SITE_URL } from "../lib/seo";
import { GoogleAnalytics } from "../components/google-analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "360Configurator — Industrial 3D Product Configuration",
    template: "%s — 360Configurator",
  },
  description:
    "Industrial 3D visual and spatial product configuration for complex products, real-time pricing and production-ready outputs.",
  applicationName: "360Configurator",
  authors: [{ name: "360Configurator", url: SITE_URL }],
  creator: "360Configurator",
  publisher: "360Configurator",
  category: "Industrial product configuration software",
  alternates: { canonical: SITE_URL, languages: languageAlternates("/") },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-32x32.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "360Configurator",
    title: "360Configurator — Industrial 3D Product Configuration",
    description: "Spatial product configuration for complex industrial products, real-time pricing and production-ready outputs.",
    images: [{ url: "/og-360configurator.png", width: 1200, height: 630, alt: "360Configurator spatial product configuration platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "360Configurator — Industrial 3D Product Configuration",
    description: "Spatial product configuration for complex industrial products.",
    images: ["/og-360configurator.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#080a0d" },
  ],
};

const themeBootstrap = `
  try {
    const stored = localStorage.getItem('360-theme');
    const preferred = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : preferred;
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}

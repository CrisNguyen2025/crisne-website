import type { Metadata } from "next";
import Script from "next/script";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JsonLd } from "@/components/json-ld";
import "./styles/globals.css";

const GA_ID = "G-XYFE5H3634";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK"],
  style: ["normal", "italic"],
  weight: "variable",
});

const SITE_URL = "https://crisne.blog";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme")||"dark";var r=t==="system"?window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":t;document.documentElement.classList.add(r);document.documentElement.style.colorScheme=r}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}})()`;

export const metadata: Metadata = {
  verification: {
    google:
      "google-site-verification=OMKBg-dLxNUwnKB8y8snJzMlTOr6pr5SrO6zosQ53xM",
  },
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Cris Nguyen — Frontend Developer",
    template: "%s | Cris Nguyen",
  },
  description:
    "Hi, I'm Cris Nguyen. I craft modern, performant web experiences with React, Next.js, and TypeScript. Explore my portfolio, skills, and projects.",
  keywords: [
    "Cris Nguyen",
    "Frontend Developer",
    "React Developer",
    "Next.js Developer",
    "TypeScript",
    "Portfolio",
    "Web Developer",
    "UI/UX",
    "JavaScript",
    "Ho Chi Minh City",
  ],
  authors: [{ name: "Cris Nguyen", url: SITE_URL }],
  creator: "Cris Nguyen",
  publisher: "Cris Nguyen",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Cris Nguyen",
    title: "Cris Nguyen — Frontend Developer",
    description:
      "I craft modern, performant web experiences with React, Next.js, and TypeScript. Let's build something great together.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Cris Nguyen — Frontend Developer Portfolio",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cris Nguyen — Frontend Developer",
    description:
      "I craft modern, performant web experiences with React, Next.js, and TypeScript.",
    images: ["/og-image.png"],
    creator: "@crisne",
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <JsonLd />
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}

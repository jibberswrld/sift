import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif-display", subsets: ["latin"], weight: ["400", "500"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Sift: one inbox, sorted", template: "%s · Sift" },
  description: "Gmail, Outlook and Slack in one inbox. Sift sorts what needs you from what can wait, and learns what matters to you.",
  applicationName: "Sift",
  metadataBase: new URL("https://sift-nu-ebon.vercel.app"),
  openGraph: {
    title: "Sift: every inbox, sorted by what needs you",
    description: "Gmail, Outlook and Slack in one list. Sift tells you why each message matters and learns what you care about. Free.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Sift: every inbox, sorted by what needs you" }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og.jpg"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1a17" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} antialiased`}>
      <body className="min-h-[100dvh] bg-bg text-ink">{children}</body>
    </html>
  );
}

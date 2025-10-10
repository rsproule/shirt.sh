import Header from "@/app/_components/header";
import { Providers } from "@/providers";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "shirt.sh",
  description: "AI-powered shirt creator with x402 payments",
  openGraph: {
    title: "shirt.sh",
    description: "AI-powered shirt creator with x402 payments",
    // For OG images, use an absolute URL, not a relative path
    images: [
      {
        url: "https://shirt.sh/shirt.png",
        width: 1200,
        height: 630,
        alt: "Shirt.sh preview",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex h-screen flex-col antialiased`}
      >
        <Providers>
          <Header title="x402 Shirt" />
          <div className="min-h-0 flex-1">{children}</div>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}

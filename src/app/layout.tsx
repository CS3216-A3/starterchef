import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "StarterChef — Your kitchen, your next meal",
    template: "%s · StarterChef",
  },
  description:
    "A personalized cooking assistant for beginners. Scan your kitchen, get recipes that fit your ingredients, equipment, and taste — then cook hands-free with an AI sous-chef.",
  openGraph: {
    siteName: "StarterChef",
    title: "StarterChef — Your kitchen, your next meal",
    description:
      "Scan your kitchen, get recipes that fit what you have, and cook hands-free with an AI sous-chef.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream font-sans text-espresso">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://starterchef.vercel.app",
  ),
  title: {
    default: "StarterChef · Your start to great cooking",
    template: "%s · StarterChef",
  },
  description:
    "A personalized cooking assistant for beginners. Scan your kitchen, get recipes that fit your ingredients, equipment, and taste, then cook hands-free with an AI sous-chef.",
  openGraph: {
    siteName: "StarterChef",
    title: "StarterChef · Your start to great cooking",
    description:
      "Scan your kitchen, get recipes that fit what you have, and cook hands-free with an AI sous-chef.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StarterChef — Your start to great cooking",
    description:
      "Scan your kitchen, get recipes that fit what you have, and cook hands-free with an AI sous-chef.",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logowbg.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream font-sans text-espresso">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}

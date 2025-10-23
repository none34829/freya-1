import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Freya · Agent Console",
  description:
    "Production-minded agent console showcasing prompt management, real-time chat, voice, and observability."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-950">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-full bg-slate-950 font-sans text-slate-100 antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

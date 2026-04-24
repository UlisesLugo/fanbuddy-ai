import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-headline",
});

export const metadata: Metadata = {
  title: "FanBuddy.AI - El Pitch Digital",
  description:
    "FanBuddy.AI analyzes thousands of combinations to deliver the perfect itinerary: tickets, flights, and stays all in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className="light">
        <body
          className={`${inter.className} ${inter.variable} ${manrope.variable} min-h-screen antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

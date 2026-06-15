import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "WorkLog — Daily productivity & time tracking",
    template: "%s | WorkLog",
  },
  description:
    "Track working hours, manage daily tasks with priorities, log Ilme Deen goals, and review streaks and weekly charts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}

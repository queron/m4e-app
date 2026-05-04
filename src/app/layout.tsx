import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "M4E Crew Optimizer",
  description: "Malifaux Fourth Edition matchup-aware crew planning tool",
  manifest: "/manifest.webmanifest"
};

export const viewport = {
  themeColor: "#0b0a08"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

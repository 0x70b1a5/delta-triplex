import type { Metadata } from "next";
import "./globals.css";
import copy from "../game-source/locales/en.json";

export const metadata: Metadata = {
  title: copy["app.name"],
  description: copy["site.description"],
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

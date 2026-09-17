import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delta Triplex",
  description: "A triangular nonogram. Solve puzzles in three directions or create your own.",
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

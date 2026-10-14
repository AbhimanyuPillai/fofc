import type { Metadata } from "next";
import "./globals.css";

// Use system fonts instead of Google Fonts to avoid network dependency on Raspberry Pi
const systemSans = {
  variable: "--font-geist-sans",
  style: {
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  }
};

const systemMono = {
  variable: "--font-geist-mono", 
  style: {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  }
};

export const metadata: Metadata = {
  title: "Experience Center - 3D Product Showcase",
  description: "Futuristic 3D product experience center with interactive carousel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body suppressHydrationWarning={true} className={`${systemSans.variable} ${systemMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

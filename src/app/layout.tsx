import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GastronomyAI — Zero-Willpower Fat Loss",
  description:
    "Gourmet culinary physics meets strict macronutrient fat-loss calculations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Source+Sans+3:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--charcoal)] text-[var(--cream)]">
        {children}
      </body>
    </html>
  );
}

import "./globals.css";
import { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { AgeGate } from "@/components/age-gate";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "FetishUI",
  description: "Guided AI workflows, models, and an interactive chat companion — powered by Venice.ai",
};

// Applies the saved/system theme class before React hydrates, so there's no flash of the
// wrong theme on first paint (matches the logic in ThemeProvider).
const themeInitScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme') || 'system';
    var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Loaded by its real family name (not next/font's scoped class) since the caption
            editor's "Bubbly" font option references "Fredoka" directly in plain CSS strings and
            in canvas ctx.font — both need an actual @font-face named "Fredoka" to resolve. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this rule targets the
            Pages Router's per-page _document.js; this is the App Router ROOT layout, so the
            link already applies globally, not per-page. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} min-h-screen`}>
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.10),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.16),transparent)]"
        />
        <ThemeProvider>
          <AgeGate />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

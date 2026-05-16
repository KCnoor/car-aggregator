import type { Metadata } from "next";
import { Geist, Tajawal, Reem_Kufi } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

const reemKufi = Reem_Kufi({
  variable: "--font-reem-kufi",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "سيارة AI — كل إعلانات السيارات في السعودية، من مصدر واحد",
  description: "كل إعلانات السيارات في السعودية، من مصدر واحد — نجمع من ٩ مصادر (سيارة، سوم، حراج، موتري، يلا موتور، سعودي سيل، كار سويتش، GoGoMotor، Carly) في مكان واحد.",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-512.png',  sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'سيارة AI',
    description: 'كل إعلانات السيارات في السعودية، من مصدر واحد.',
    images: ['/og-image.png'],
    locale: 'ar_SA',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${geist.variable} ${tajawal.variable} ${reemKufi.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

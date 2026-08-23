import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { WalletProvider } from '@/components/providers/WalletProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Agent Bazaar — AI Agent Marketplace on BNB Chain',
  description: 'Discover, compare, and hire AI agents on BNB Smart Chain. Powered by ERC-8004 and x402 payments.',
  openGraph: {
    title: 'Agent Bazaar',
    description: 'AI Agent Marketplace on BNB Chain',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#030712',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
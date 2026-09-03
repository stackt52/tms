import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import '@/components/m3/m3.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: { default: 'IHM Travel Management System', template: '%s · IHM TMS' },
  description: 'IHM Southern Africa Travel Management System — travel requests, approvals, advances, fleet, mileage and liquidation.',
  applicationName: 'IHM TMS',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#00696D',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..900&display=swap" rel="stylesheet" />
        {/* Icon font uses display=block so icon names never flash as text while it loads. */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..700,0..1,0&display=block" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

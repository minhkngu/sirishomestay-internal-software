import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Providers } from '@/components/providers'
import './globals.css'

const beVietnam = localFont({
  src: [
    {
      path: './fonts/BeVietnamPro-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/BeVietnamPro-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/BeVietnamPro-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/BeVietnamPro-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-sans',
  display: 'swap',
  adjustFontFallback: false,
  preload: true,
})

export const metadata: Metadata = {
  title: 'Siris Residences',
  description: 'Quản lý khách thuê dài hạn',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${beVietnam.variable} ${beVietnam.className} h-full antialiased`}>
      <body className={`${beVietnam.className} min-h-full flex flex-col font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

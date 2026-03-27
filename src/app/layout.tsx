import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CommUp — Completion Management System',
  description: 'Industrial project completion, commissioning and start-up management platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

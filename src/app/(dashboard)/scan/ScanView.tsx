'use client'

import dynamic from 'next/dynamic'

const QRNFCScanner = dynamic(() => import('@/components/QRNFCScanner'), { ssr: false })

export default function ScanView() {
  return <QRNFCScanner />
}

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Round Robin Quiz Duel',
  description: 'Phone-first multiplayer quiz duel built for Vercel and Supabase.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

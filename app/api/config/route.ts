import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    pushSupported: false,
    pushConfigured: false,
  })
}

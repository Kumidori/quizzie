import { NextRequest, NextResponse } from 'next/server'
import { getRoomSnapshot } from '../../../../lib/game-service'
import { createSupabaseAdminClient } from '../../../../lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params
    const playerId = request.nextUrl.searchParams.get('playerId') ?? ''
    const room = await getRoomSnapshot(createSupabaseAdminClient(), roomId, playerId)
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getRoomSnapshot, startGame } from '../../../../../lib/game-service'
import { createSupabaseAdminClient } from '../../../../../lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params
    const { playerId } = (await request.json()) as { playerId?: string }
    const supabase = createSupabaseAdminClient()
    await startGame(supabase, roomId, playerId ?? '')
    const room = await getRoomSnapshot(supabase, roomId, playerId ?? '')
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 400 })
  }
}

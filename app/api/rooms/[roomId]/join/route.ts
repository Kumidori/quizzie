import { NextRequest, NextResponse } from 'next/server'
import { getRoomSnapshot, joinRoom, reconnectPlayer } from '../../../../../lib/game-service'
import { createSupabaseAdminClient } from '../../../../../lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params
    const { name, playerId } = (await request.json()) as { name?: string; playerId?: string }
    const supabase = createSupabaseAdminClient()
    let resolvedPlayerId = playerId?.trim() ?? ''
    if (resolvedPlayerId) {
      await reconnectPlayer(supabase, roomId, resolvedPlayerId)
    } else {
      resolvedPlayerId = await joinRoom(supabase, roomId, name ?? '')
    }
    const room = await getRoomSnapshot(supabase, roomId, resolvedPlayerId)
    return NextResponse.json({ playerId: resolvedPlayerId, room })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 400 })
  }
}

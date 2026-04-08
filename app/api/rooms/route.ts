import { NextRequest, NextResponse } from 'next/server'
import { createRoom, getRoomSnapshot } from '../../../lib/game-service'
import { createSupabaseAdminClient } from '../../../lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { name } = (await request.json()) as { name?: string }
    if (!name?.trim()) {
      throw new Error('Please enter your display name.')
    }
    const supabase = createSupabaseAdminClient()
    const created = await createRoom(supabase, name)
    const room = await getRoomSnapshot(supabase, created.roomId, created.playerId)
    return NextResponse.json({ playerId: created.playerId, room })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 400 })
  }
}

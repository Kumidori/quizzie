import { NextRequest, NextResponse } from 'next/server'
import { chooseCategory, getRoomSnapshot } from '../../../../../lib/game-service'
import { createSupabaseAdminClient } from '../../../../../lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params
    const { playerId, categoryId } = (await request.json()) as { playerId?: string; categoryId?: string }
    const supabase = createSupabaseAdminClient()
    await chooseCategory(supabase, roomId, playerId ?? '', categoryId ?? '')
    const room = await getRoomSnapshot(supabase, roomId, playerId ?? '')
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getRoomSnapshot, submitAnswers } from '../../../../../lib/game-service'
import { createSupabaseAdminClient } from '../../../../../lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params
    const { playerId, payload } = (await request.json()) as { playerId?: string; payload?: { answers?: Record<string, string> } }
    const supabase = createSupabaseAdminClient()
    await submitAnswers(supabase, roomId, playerId ?? '', payload?.answers ?? {})
    const room = await getRoomSnapshot(supabase, roomId, playerId ?? '')
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 400 })
  }
}

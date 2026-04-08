import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { CategoryOption, PlayerProgress, PublicQuestion, RoomSnapshot } from '../shared/types'
import { getCategoryDeck, getQuestionsForCategory, type PreparedQuestion } from './questions'

type DbRoom = {
  id: string
  invite_code: string
  host_player_id: string | null
  phase: RoomSnapshot['phase']
  total_rounds: number
  current_round_number: number
}

type DbPlayer = {
  id: string
  room_id: string
  name: string
  score: number
  is_connected: boolean
}

type DbRound = {
  id: string
  room_id: string
  round_number: number
  chooser_player_id: string
  category_choices: CategoryOption[]
  selected_category_id: string | null
  selected_category_title: string | null
  questions: PreparedQuestion[]
  round_scores: Record<string, number> | null
}

type DbAnswer = {
  round_id: string
  player_id: string
  answers: Record<string, string>
}

type LoadedRoom = {
  room: DbRoom
  players: DbPlayer[]
  currentRound: DbRound | null
  answers: DbAnswer[]
}

function randomInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function requireSingle<T>(value: T | null, errorMessage: string): T {
  if (!value) {
    throw new Error(errorMessage)
  }
  return value
}

function fromError(error: PostgrestError | null): void {
  if (error) {
    throw new Error(error.message)
  }
}

export async function createRoom(supabase: SupabaseClient, playerName: string) {
  const roomInsert = await supabase
    .from('rooms')
    .insert({
      invite_code: randomInviteCode(),
      phase: 'lobby',
      total_rounds: 6,
      current_round_number: 0,
    })
    .select()
    .single<DbRoom>()
  fromError(roomInsert.error)
  const room = requireSingle(roomInsert.data, 'Failed to create room.')

  const playerInsert = await supabase
    .from('players')
    .insert({
      room_id: room.id,
      name: playerName.trim(),
      score: 0,
      is_connected: true,
    })
    .select()
    .single<DbPlayer>()
  fromError(playerInsert.error)
  const player = requireSingle(playerInsert.data, 'Failed to create player.')

  await supabase.from('rooms').update({ host_player_id: player.id }).eq('id', room.id)
  return { roomId: room.id, playerId: player.id }
}

export async function joinRoom(supabase: SupabaseClient, roomId: string, playerName: string) {
  const loaded = await loadRoomState(supabase, roomId)
  if (loaded.room.phase !== 'lobby') {
    throw new Error('This game already started.')
  }
  const normalized = playerName.trim()
  if (!normalized) {
    throw new Error('Please enter your display name.')
  }
  if (loaded.players.some((player) => player.name.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('That name is already in the room.')
  }
  const insert = await supabase
    .from('players')
    .insert({
      room_id: roomId,
      name: normalized,
      score: 0,
      is_connected: true,
    })
    .select()
    .single<DbPlayer>()
  fromError(insert.error)
  return requireSingle(insert.data, 'Could not join room.').id
}

export async function reconnectPlayer(supabase: SupabaseClient, roomId: string, playerId: string) {
  const update = await supabase.from('players').update({ is_connected: true }).eq('room_id', roomId).eq('id', playerId)
  fromError(update.error)
}

export async function startGame(supabase: SupabaseClient, roomId: string, playerId: string) {
  const loaded = await loadRoomState(supabase, roomId)
  ensureHost(loaded.room, playerId)
  if (loaded.players.length < 2) {
    throw new Error('You need at least 2 players to start.')
  }
  const chooser = loaded.players[0]
  const insertRound = await supabase.from('rounds').insert({
    room_id: roomId,
    round_number: 1,
    chooser_player_id: chooser.id,
    category_choices: getCategoryDeck(4),
    selected_category_id: null,
    selected_category_title: null,
    questions: [],
    round_scores: {},
  })
  fromError(insertRound.error)
  const updateRoom = await supabase.from('rooms').update({ phase: 'category-selection', current_round_number: 1 }).eq('id', roomId)
  fromError(updateRoom.error)
}

export async function chooseCategory(supabase: SupabaseClient, roomId: string, playerId: string, categoryId: string) {
  const loaded = await loadRoomState(supabase, roomId)
  const round = requireSingle(loaded.currentRound, 'No active round exists.')
  if (loaded.room.phase !== 'category-selection') {
    throw new Error('The game is not waiting on a category pick.')
  }
  if (round.chooser_player_id !== playerId) {
    throw new Error('Only the active chooser can pick the category.')
  }
  const category = round.category_choices.find((entry) => entry.id === categoryId)
  if (!category) {
    throw new Error('That category is not available.')
  }
  const questions = await getQuestionsForCategory(categoryId)
  const updateRound = await supabase
    .from('rounds')
    .update({
      selected_category_id: category.id,
      selected_category_title: category.title,
      questions,
    })
    .eq('id', round.id)
  fromError(updateRound.error)
  const updateRoom = await supabase.from('rooms').update({ phase: 'answering' }).eq('id', roomId)
  fromError(updateRoom.error)
}

export async function submitAnswers(supabase: SupabaseClient, roomId: string, playerId: string, answers: Record<string, string>) {
  const loaded = await loadRoomState(supabase, roomId)
  const round = requireSingle(loaded.currentRound, 'No active round exists.')
  if (loaded.room.phase !== 'answering') {
    throw new Error('Answers can only be sent during the question phase.')
  }
  if (Object.keys(answers).length !== round.questions.length) {
    throw new Error('Please answer all 3 questions before submitting.')
  }
  const upsert = await supabase
    .from('answers')
    .upsert(
      {
        room_id: roomId,
        round_id: round.id,
        player_id: playerId,
        answers,
      },
      { onConflict: 'round_id,player_id' },
    )
  fromError(upsert.error)

  const refreshed = await loadRoomState(supabase, roomId)
  if (refreshed.answers.length < refreshed.players.length) {
    return
  }

  const roundScores: Record<string, number> = {}
  for (const player of refreshed.players) {
    const playerAnswers = refreshed.answers.find((entry) => entry.player_id === player.id)?.answers ?? {}
    const earned = round.questions.reduce((sum, question) => {
      return sum + (playerAnswers[question.id] === question.correctChoiceId ? 1 : 0)
    }, 0)
    roundScores[player.id] = earned
    const updatePlayer = await supabase.from('players').update({ score: player.score + earned }).eq('id', player.id)
    fromError(updatePlayer.error)
  }

  const updateRound = await supabase.from('rounds').update({ round_scores: roundScores }).eq('id', round.id)
  fromError(updateRound.error)
  const updateRoom = await supabase.from('rooms').update({ phase: 'round-reveal' }).eq('id', roomId)
  fromError(updateRoom.error)
}

export async function advanceGame(supabase: SupabaseClient, roomId: string, playerId: string) {
  const loaded = await loadRoomState(supabase, roomId)
  ensureHost(loaded.room, playerId)
  if (loaded.room.phase !== 'round-reveal') {
    throw new Error('You can only advance after the score reveal.')
  }
  if (loaded.room.current_round_number >= loaded.room.total_rounds) {
    const updateGameOver = await supabase.from('rooms').update({ phase: 'game-over' }).eq('id', roomId)
    fromError(updateGameOver.error)
    return
  }

  const nextRoundNumber = loaded.room.current_round_number + 1
  const chooser = loaded.players[(nextRoundNumber - 1) % loaded.players.length]
  const insertRound = await supabase.from('rounds').insert({
    room_id: roomId,
    round_number: nextRoundNumber,
    chooser_player_id: chooser.id,
    category_choices: getCategoryDeck(4),
    selected_category_id: null,
    selected_category_title: null,
    questions: [],
    round_scores: {},
  })
  fromError(insertRound.error)
  const updateRoom = await supabase
    .from('rooms')
    .update({ phase: 'category-selection', current_round_number: nextRoundNumber })
    .eq('id', roomId)
  fromError(updateRoom.error)
}

export async function getRoomSnapshot(supabase: SupabaseClient, roomId: string, viewerPlayerId: string): Promise<RoomSnapshot> {
  const loaded = await loadRoomState(supabase, roomId)
  const viewer = loaded.players.find((player) => player.id === viewerPlayerId)
  if (!viewer) {
    throw new Error('Player not found in this room.')
  }
  const round = loaded.currentRound
  const myAnswers = loaded.answers.find((answer) => answer.player_id === viewerPlayerId)?.answers ?? {}
  return {
    roomId: loaded.room.id,
    inviteCode: loaded.room.invite_code,
    invitePath: `/?room=${loaded.room.id}`,
    viewerPlayerId,
    hostPlayerId: loaded.room.host_player_id ?? '',
    phase: loaded.room.phase,
    totalRounds: loaded.room.total_rounds,
    currentRoundNumber: loaded.room.current_round_number,
    players: loaded.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      connected: player.is_connected,
    })),
    currentRound: round
      ? {
          index: round.round_number,
          chooserPlayerId: round.chooser_player_id,
          chooserName: loaded.players.find((player) => player.id === round.chooser_player_id)?.name ?? 'Chooser',
          categoryChoices: round.category_choices,
          selectedCategoryId: round.selected_category_id ?? undefined,
          selectedCategoryTitle: round.selected_category_title ?? undefined,
          questions: round.questions.map((question) => makePublicQuestion(question, loaded.room.phase !== 'answering')),
          progress: loaded.players.map((player) => makeProgress(player, round, loaded.answers)),
          roundScores: loaded.room.phase === 'round-reveal' || loaded.room.phase === 'game-over' ? round.round_scores ?? {} : undefined,
        }
      : undefined,
    myAnswers,
    pushSupported: false,
    pushConfigured: false,
    notificationsEnabled: false,
  }
}

async function loadRoomState(supabase: SupabaseClient, roomId: string): Promise<LoadedRoom> {
  const roomResult = await supabase.from('rooms').select('*').eq('id', roomId).single<DbRoom>()
  fromError(roomResult.error)
  const room = requireSingle(roomResult.data, 'Room not found.')

  const playersResult = await supabase.from('players').select('*').eq('room_id', roomId).order('joined_at', { ascending: true })
  fromError(playersResult.error)
  const players = (playersResult.data ?? []) as DbPlayer[]

  const roundResult =
    room.current_round_number > 0
      ? await supabase.from('rounds').select('*').eq('room_id', roomId).eq('round_number', room.current_round_number).single<DbRound>()
      : { data: null, error: null as PostgrestError | null }
  fromError(roundResult.error)
  const currentRound = roundResult.data as DbRound | null

  const answersResult =
    currentRound
      ? await supabase.from('answers').select('*').eq('round_id', currentRound.id)
      : { data: [], error: null as PostgrestError | null }
  fromError(answersResult.error)

  return {
    room,
    players,
    currentRound,
    answers: (answersResult.data ?? []) as DbAnswer[],
  }
}

function ensureHost(room: DbRoom, playerId: string) {
  if (room.host_player_id !== playerId) {
    throw new Error('Only the room host can do that.')
  }
}

function makePublicQuestion(question: PreparedQuestion, revealCorrectAnswer: boolean): PublicQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: question.choices,
    correctChoiceId: revealCorrectAnswer ? question.correctChoiceId : undefined,
  }
}

function makeProgress(player: DbPlayer, round: DbRound, answers: DbAnswer[]): PlayerProgress {
  const answeredCount = Object.keys(answers.find((entry) => entry.player_id === player.id)?.answers ?? {}).length
  return {
    playerId: player.id,
    name: player.name,
    answeredCount,
    isComplete: answeredCount === round.questions.length && round.questions.length > 0,
  }
}

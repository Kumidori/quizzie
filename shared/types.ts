export type GamePhase = 'lobby' | 'category-selection' | 'answering' | 'round-reveal' | 'game-over'

export type CategoryOption = {
  id: string
  title: string
  description: string
}

export type PublicChoice = {
  id: string
  label: string
  text: string
}

export type PublicQuestion = {
  id: string
  prompt: string
  choices: PublicChoice[]
  correctChoiceId?: string
}

export type PlayerSummary = {
  id: string
  name: string
  score: number
  connected: boolean
}

export type PlayerProgress = {
  playerId: string
  name: string
  answeredCount: number
  isComplete: boolean
}

export type RoundSummary = {
  index: number
  chooserPlayerId: string
  chooserName: string
  categoryChoices: CategoryOption[]
  selectedCategoryId?: string
  selectedCategoryTitle?: string
  questions: PublicQuestion[]
  progress: PlayerProgress[]
  roundScores?: Record<string, number>
}

export type RoomSnapshot = {
  roomId: string
  inviteCode: string
  invitePath: string
  viewerPlayerId: string
  hostPlayerId: string
  phase: GamePhase
  totalRounds: number
  currentRoundNumber: number
  players: PlayerSummary[]
  currentRound?: RoundSummary
  myAnswers: Record<string, string>
  pushSupported: boolean
  pushConfigured: boolean
  notificationsEnabled: boolean
}

export type ApiConfig = {
  pushSupported: boolean
  pushConfigured: boolean
  vapidPublicKey?: string
}

export type RoomActionResult = {
  room: RoomSnapshot
}

export type AnswerPayload = {
  answers: Record<string, string>
}

export type SocketMessage =
  | {
      type: 'room-state'
      room: RoomSnapshot
    }
  | {
      type: 'system'
      message: string
    }

'use client'

import { useEffect, useRef, useState } from 'react'
import type { ApiConfig, PublicQuestion, RoomSnapshot } from '../shared/types'

type RoomResponse = {
  room: RoomSnapshot
}

type CreateOrJoinResponse = RoomResponse & {
  playerId: string
}

type Session = {
  roomId: string
  playerId: string
  name?: string
}

type ScreenState = {
  room: RoomSnapshot | null
  playerId: string | null
  playerName: string
  config: ApiConfig | null
  error: string | null
  busy: boolean
  joining: boolean
}

const initialState: ScreenState = {
  room: null,
  playerId: null,
  playerName: '',
  config: null,
  error: null,
  busy: false,
  joining: false,
}

function sessionKey(roomId: string): string {
  return `quiz-duel-session:${roomId}`
}

function saveSession(session: Session): void {
  localStorage.setItem(sessionKey(session.roomId), JSON.stringify(session))
}

function loadSession(roomId: string): Session | null {
  const raw = localStorage.getItem(sessionKey(roomId))
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    ...init,
  })
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(body.error ?? 'Request failed.')
  }
  return body
}

export function QuizDuelApp() {
  const [state, setState] = useState(initialState)
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [questionIndex, setQuestionIndex] = useState(0)
  const [shareStatus, setShareStatus] = useState('')
  const [roomIdFromUrl, setRoomIdFromUrl] = useState('')
  const roundResetKeyRef = useRef('')

  useEffect(() => {
    setRoomIdFromUrl(new URL(window.location.href).searchParams.get('room')?.trim() ?? '')
  }, [])

  useEffect(() => {
    requestJson<ApiConfig>('/api/config')
      .then((config) => setState((current) => ({ ...current, config })))
      .catch((error: Error) => setState((current) => ({ ...current, error: error.message })))
  }, [])

  useEffect(() => {
    if (!roomIdFromUrl) {
      return
    }
    const saved = loadSession(roomIdFromUrl)
    if (!saved?.playerId) {
      return
    }
    setState((current) => ({ ...current, playerName: saved.name ?? '', joining: true, error: null }))
    requestJson<CreateOrJoinResponse>(`/api/rooms/${roomIdFromUrl}/join`, {
      method: 'POST',
      body: JSON.stringify({ playerId: saved.playerId }),
    })
      .then(({ playerId, room }) => {
        saveSession({ roomId: room.roomId, playerId, name: saved.name })
        setState((current) => ({ ...current, joining: false, playerId, room }))
      })
      .catch(() => {
        setState((current) => ({ ...current, joining: false }))
      })
  }, [roomIdFromUrl])

  useEffect(() => {
    if (!state.room || !state.playerId) {
      return
    }
    const poll = window.setInterval(() => {
      requestJson<RoomResponse>(`/api/rooms/${state.room!.roomId}?playerId=${encodeURIComponent(state.playerId!)}`)
        .then(({ room }) => setState((current) => ({ ...current, room })))
        .catch(() => undefined)
    }, 1400)
    return () => window.clearInterval(poll)
  }, [state.room?.roomId, state.playerId])

  const room = state.room
  const viewerId = state.playerId
  const currentRound = room?.currentRound
  const isHost = Boolean(room && viewerId && room.hostPlayerId === viewerId)
  const isChooser = Boolean(currentRound && viewerId && currentRound.chooserPlayerId === viewerId)
  const inviteMode = Boolean(roomIdFromUrl && !room)
  const inviteUrl = room ? new URL(room.invitePath, window.location.origin).toString() : ''
  const canUseShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const canUseClipboard = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
  const activeQuestion = currentRound?.questions[questionIndex]
  const alreadySubmitted = currentRound
    ? currentRound.questions.length > 0 && currentRound.questions.every((question) => Boolean(room?.myAnswers[question.id]))
    : false
  const myPlayer = room?.players.find((player) => player.id === viewerId)

  useEffect(() => {
    const roundQuestions = room?.currentRound?.questions ?? []
    const resetKey = `${room?.phase ?? 'none'}:${room?.currentRound?.index ?? 0}`

    if (roundResetKeyRef.current !== resetKey) {
      const synced: Record<string, string> = {}
      for (const question of roundQuestions) {
        if (room?.myAnswers[question.id]) {
          synced[question.id] = room.myAnswers[question.id]
        }
      }
      roundResetKeyRef.current = resetKey
      setDraftAnswers(synced)
      setQuestionIndex(0)
      return
    }

    if (alreadySubmitted) {
      const synced: Record<string, string> = {}
      for (const question of roundQuestions) {
        if (room?.myAnswers[question.id]) {
          synced[question.id] = room.myAnswers[question.id]
        }
      }
      setDraftAnswers(synced)
    }
  }, [room, alreadySubmitted])

  async function withBusy(action: () => Promise<void>) {
    setState((current) => ({ ...current, busy: true, error: null }))
    try {
      await action()
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'Something went wrong.' }))
    } finally {
      setState((current) => ({ ...current, busy: false }))
    }
  }

  async function handleCreateRoom() {
    await withBusy(async () => {
      const result = await requestJson<CreateOrJoinResponse>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name: state.playerName.trim() }),
      })
      saveSession({ roomId: result.room.roomId, playerId: result.playerId, name: state.playerName.trim() })
      window.history.replaceState({}, '', result.room.invitePath)
      setState((current) => ({ ...current, room: result.room, playerId: result.playerId }))
    })
  }

  async function handleJoinRoom() {
    await withBusy(async () => {
      const result = await requestJson<CreateOrJoinResponse>(`/api/rooms/${roomIdFromUrl}/join`, {
        method: 'POST',
        body: JSON.stringify({ name: state.playerName.trim() }),
      })
      saveSession({ roomId: result.room.roomId, playerId: result.playerId, name: state.playerName.trim() })
      setState((current) => ({ ...current, room: result.room, playerId: result.playerId }))
    })
  }

  async function handleShareInvite() {
    if (!room) {
      return
    }
    try {
      if (canUseShare) {
        await navigator.share({ title: 'Join my quiz duel', text: "Join my room and let's play.", url: inviteUrl })
        setShareStatus('Invite shared.')
      } else if (canUseClipboard) {
        await navigator.clipboard.writeText(inviteUrl)
        setShareStatus('Invite link copied.')
      } else {
        window.prompt('Copy this invite link', inviteUrl)
        setShareStatus('Invite link ready to copy.')
      }
    } catch {
      setShareStatus('Invite sharing was cancelled.')
    }
    window.setTimeout(() => setShareStatus(''), 2200)
  }

  async function handleQuestionAnswer(question: PublicQuestion, choiceId: string) {
    if (!room || !viewerId || !currentRound || alreadySubmitted) {
      return
    }
    const nextAnswers = { ...draftAnswers, [question.id]: choiceId }
    setDraftAnswers(nextAnswers)
    if (questionIndex < currentRound.questions.length - 1) {
      setQuestionIndex((current) => current + 1)
      return
    }
    await withBusy(async () => {
      const result = await requestJson<RoomResponse>(`/api/rooms/${room.roomId}/answers`, {
        method: 'POST',
        body: JSON.stringify({ playerId: viewerId, payload: { answers: nextAnswers } }),
      })
      setState((current) => ({ ...current, room: result.room }))
    })
  }

  function winnerLabel(snapshot: RoomSnapshot): string {
    const sorted = [...snapshot.players].sort((left, right) => right.score - left.score)
    if (sorted.length > 1 && sorted[0].score === sorted[1].score) {
      return 'Tie game'
    }
    return `${sorted[0]?.name ?? 'Nobody'} wins`
  }

  return (
    <main className="app-shell">
      <div className="app-panel">
        {!room && (
          <section className="screen join-screen">
            <div className="screen-header">
              <div>
                <p className="eyebrow">{inviteMode ? `Invite ${roomIdFromUrl}` : 'New game'}</p>
                <h1>{inviteMode ? 'Join the quiz' : 'Make quiz night easy'}</h1>
                <p className="subcopy">{inviteMode ? 'Enter your name and jump in.' : 'Create a room, send one link, and take turns choosing categories.'}</p>
              </div>
            </div>
            {state.error && <div className="banner error">{state.error}</div>}
            <div className="content-zone">
              <label className="field">
                <span>Your name</span>
                <input value={state.playerName} onChange={(event) => setState((current) => ({ ...current, playerName: event.target.value }))} placeholder="Nico" />
              </label>
              <div className="bottom-actions">
                {inviteMode ? (
                  <button disabled={state.busy || state.joining || !state.playerName.trim()} onClick={handleJoinRoom}>
                    Join room
                  </button>
                ) : (
                  <button disabled={state.busy || !state.playerName.trim()} onClick={handleCreateRoom}>
                    Create room
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {room && (
          <section className="screen">
            <header className="screen-header compact">
              <div>
                <p className="eyebrow">
                  {room.phase === 'lobby'
                    ? 'Lobby'
                    : room.phase === 'category-selection'
                      ? `Round ${room.currentRoundNumber} pick`
                      : room.phase === 'answering'
                        ? currentRound?.selectedCategoryTitle ?? 'Round'
                        : room.phase === 'round-reveal'
                          ? 'Round result'
                          : 'Final score'}
                </p>
                <h1>
                  {room.phase === 'lobby'
                    ? 'Ready to play'
                    : room.phase === 'category-selection'
                      ? isChooser
                        ? 'Choose a category'
                        : `${currentRound?.chooserName} is choosing`
                      : room.phase === 'answering'
                        ? alreadySubmitted
                          ? 'Waiting for answers'
                          : `Question ${questionIndex + 1} of ${currentRound?.questions.length ?? 3}`
                        : room.phase === 'round-reveal'
                          ? 'Scores updated'
                          : winnerLabel(room)}
                </h1>
              </div>
              <div className="soft-badge">{myPlayer?.score ?? 0} pts</div>
            </header>

            {state.error && <div className="banner error">{state.error}</div>}
            {state.busy && <div className="banner info">Updating...</div>}

            <div className="content-zone">
              {room.phase === 'lobby' && (
                <>
                  <div className="hero-card">
                    <h2>{isHost ? 'Share the room and start when everyone joined.' : 'The host will start when ready.'}</h2>
                    <p>{shareStatus || inviteUrl}</p>
                  </div>
                  <div className="roster-grid">
                    {room.players.map((player) => (
                      <div key={player.id} className={player.id === viewerId ? 'person-card active' : 'person-card'}>
                        <strong>{player.name}</strong>
                        <span>{player.score} pts</span>
                      </div>
                    ))}
                  </div>
                  <div className="bottom-actions">
                    <button className="secondary" onClick={handleShareInvite}>
                      {canUseShare ? 'Share invite' : 'Copy invite'}
                    </button>
                    {isHost && (
                      <button
                        disabled={room.players.length < 2 || state.busy}
                        onClick={() =>
                          withBusy(async () => {
                            const result = await requestJson<RoomResponse>(`/api/rooms/${room.roomId}/start`, {
                              method: 'POST',
                              body: JSON.stringify({ playerId: viewerId }),
                            })
                            setState((current) => ({ ...current, room: result.room }))
                          })
                        }
                      >
                        Start game
                      </button>
                    )}
                  </div>
                </>
              )}

              {currentRound && room.phase === 'category-selection' && (
                <>
                  <div className="hero-card">
                    <h2>{isChooser ? 'Tap a category to lock it in.' : `${currentRound.chooserName} is choosing now.`}</h2>
                    <p>Everyone gets the same 3 questions right after the pick.</p>
                  </div>
                  {isChooser ? (
                    <div className="answers-grid">
                      {currentRound.categoryChoices.map((category) => (
                        <button
                          key={category.id}
                          className="answer-option category-option"
                          disabled={state.busy}
                          onClick={() =>
                            withBusy(async () => {
                              const result = await requestJson<RoomResponse>(`/api/rooms/${room.roomId}/category`, {
                                method: 'POST',
                                body: JSON.stringify({ playerId: viewerId, categoryId: category.id }),
                              })
                              setState((current) => ({ ...current, room: result.room }))
                            })
                          }
                        >
                          <span>Category</span>
                          <strong>{category.title}</strong>
                          <em>{category.description}</em>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="waiting-card">
                      <strong>{currentRound.chooserName} is choosing</strong>
                      <span>You will both see the questions as soon as the pick is locked.</span>
                    </div>
                  )}
                </>
              )}

              {currentRound && room.phase === 'answering' && (
                <>
                  {!alreadySubmitted && activeQuestion && (
                    <>
                      <div className="hero-card question-card">
                        <div className="tiny-meter">
                          {currentRound.questions.map((question, index) => (
                            <span
                              key={question.id}
                              className={
                                draftAnswers[question.id]
                                  ? 'meter-dot done'
                                  : index === questionIndex
                                    ? 'meter-dot active'
                                    : 'meter-dot'
                              }
                            />
                          ))}
                        </div>
                        <h2>{activeQuestion.prompt}</h2>
                      </div>
                      <div className="answers-grid">
                        {activeQuestion.choices.map((choice) => (
                          <button key={choice.id} className="answer-option" disabled={state.busy} onClick={() => handleQuestionAnswer(activeQuestion, choice.id)}>
                            <span>{choice.label}</span>
                            <strong>{choice.text}</strong>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {alreadySubmitted && (
                    <>
                      <div className="hero-card waiting-tall">
                        <h2>Answers sent</h2>
                        <p>{currentRound.progress.filter((player) => player.isComplete).length} of {room.players.length} players finished</p>
                      </div>
                      <div className="roster-grid compact">
                        {currentRound.progress.map((player) => (
                          <div key={player.playerId} className={player.isComplete ? 'person-card active' : 'person-card'}>
                            <strong>{player.name}</strong>
                            <span>{player.answeredCount}/3</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {currentRound && room.phase === 'round-reveal' && (
                <>
                  <div className="hero-card">
                    <h2>{room.currentRoundNumber === room.totalRounds ? 'Last round finished' : 'Round complete'}</h2>
                    <p>The next player picks the next category right after this.</p>
                  </div>
                  <div className="score-list">
                    {[...room.players]
                      .sort((left, right) => right.score - left.score)
                      .map((player, index) => (
                        <div key={player.id} className={player.id === viewerId ? 'score-row active' : 'score-row'}>
                          <div>
                            <span>#{index + 1}</span>
                            <strong>{player.name}</strong>
                          </div>
                          <div>
                            <small>+{currentRound.roundScores?.[player.id] ?? 0}</small>
                            <strong>{player.score}</strong>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="bottom-actions">
                    {isHost ? (
                      <button
                        disabled={state.busy}
                        onClick={() =>
                          withBusy(async () => {
                            const result = await requestJson<RoomResponse>(`/api/rooms/${room.roomId}/advance`, {
                              method: 'POST',
                              body: JSON.stringify({ playerId: viewerId }),
                            })
                            setState((current) => ({ ...current, room: result.room }))
                          })
                        }
                      >
                        {room.currentRoundNumber === room.totalRounds ? 'Show winner' : 'Next round'}
                      </button>
                    ) : (
                      <div className="waiting-card">
                        <strong>Waiting for the host</strong>
                        <span>The next picker screen will appear automatically.</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {room.phase === 'game-over' && (
                <>
                  <div className="hero-card">
                    <h2>{winnerLabel(room)}</h2>
                    <p>Six rounds done.</p>
                  </div>
                  <div className="score-list">
                    {[...room.players]
                      .sort((left, right) => right.score - left.score)
                      .map((player, index) => (
                        <div key={player.id} className={player.id === viewerId ? 'score-row active' : 'score-row'}>
                          <div>
                            <span>#{index + 1}</span>
                            <strong>{player.name}</strong>
                          </div>
                          <div>
                            <strong>{player.score}</strong>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

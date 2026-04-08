import type { CategoryOption } from '../shared/types'

type InternalQuestion = {
  prompt: string
  correctAnswer: string
  incorrectAnswers: string[]
}

export type PreparedChoice = {
  id: string
  label: string
  text: string
}

export type PreparedQuestion = {
  id: string
  prompt: string
  choices: PreparedChoice[]
  correctChoiceId: string
}

type QuestionCategory = CategoryOption & {
  apiCategory: number
}

const questionCategories: QuestionCategory[] = [
  { id: 'science', title: 'Science', description: 'Curious facts, nature, chemistry, and space.', apiCategory: 17 },
  { id: 'history', title: 'History', description: 'Moments, empires, inventions, and turning points.', apiCategory: 23 },
  { id: 'geography', title: 'Geography', description: 'Capitals, landmarks, maps, and countries.', apiCategory: 22 },
  { id: 'film', title: 'Film', description: 'Movies, quotes, directors, and big-screen classics.', apiCategory: 11 },
  { id: 'sports', title: 'Sports', description: 'Athletes, records, teams, and competitions.', apiCategory: 21 },
  { id: 'games', title: 'Games', description: 'Video games, tabletop, and gaming culture.', apiCategory: 15 },
]

const fallbackBank: Record<string, InternalQuestion[]> = {
  science: [
    { prompt: 'What is the chemical symbol for gold?', correctAnswer: 'Au', incorrectAnswers: ['Ag', 'Go', 'Gd'] },
    { prompt: 'Which planet is known for the Great Red Spot?', correctAnswer: 'Jupiter', incorrectAnswers: ['Mars', 'Saturn', 'Venus'] },
    { prompt: 'DNA stands for what?', correctAnswer: 'Deoxyribonucleic acid', incorrectAnswers: ['Dynamic nitrogen acid', 'Dual ribonuclear acid', 'Deoxynitric array'] },
  ],
  history: [
    { prompt: 'In which year did the Berlin Wall fall?', correctAnswer: '1989', incorrectAnswers: ['1987', '1991', '1979'] },
    { prompt: 'Who was the first emperor of Rome?', correctAnswer: 'Augustus', incorrectAnswers: ['Nero', 'Caesar', 'Hadrian'] },
    { prompt: 'The Magna Carta was first issued in which country?', correctAnswer: 'England', incorrectAnswers: ['France', 'Spain', 'Germany'] },
  ],
  geography: [
    { prompt: 'What is the capital of Canada?', correctAnswer: 'Ottawa', incorrectAnswers: ['Toronto', 'Vancouver', 'Montreal'] },
    { prompt: 'Mount Kilimanjaro is in which country?', correctAnswer: 'Tanzania', incorrectAnswers: ['Kenya', 'Uganda', 'Ethiopia'] },
    { prompt: 'Which is the largest hot desert?', correctAnswer: 'Sahara', incorrectAnswers: ['Gobi', 'Atacama', 'Arabian'] },
  ],
  film: [
    { prompt: 'Who directed Pulp Fiction?', correctAnswer: 'Quentin Tarantino', incorrectAnswers: ['David Fincher', 'Steven Spielberg', 'Ridley Scott'] },
    { prompt: 'Which movie says "I\'ll be back"?', correctAnswer: 'The Terminator', incorrectAnswers: ['Predator', 'Die Hard', 'RoboCop'] },
    { prompt: 'What is the kingdom in Frozen?', correctAnswer: 'Arendelle', incorrectAnswers: ['Corona', 'Atlantica', 'DunBroch'] },
  ],
  sports: [
    { prompt: 'How many players are on a soccer team during play?', correctAnswer: '11', incorrectAnswers: ['9', '10', '12'] },
    { prompt: 'Which sport uses the term birdie?', correctAnswer: 'Golf', incorrectAnswers: ['Tennis', 'Cricket', 'Baseball'] },
    { prompt: 'The Tour de France is associated with which sport?', correctAnswer: 'Cycling', incorrectAnswers: ['Running', 'Motorsport', 'Rowing'] },
  ],
  games: [
    { prompt: 'Which company created The Legend of Zelda?', correctAnswer: 'Nintendo', incorrectAnswers: ['Sega', 'Sony', 'Capcom'] },
    { prompt: 'Which chess piece only moves diagonally?', correctAnswer: 'Bishop', incorrectAnswers: ['Rook', 'Knight', 'King'] },
    { prompt: 'What color is Pac-Man?', correctAnswer: 'Yellow', incorrectAnswers: ['Blue', 'Green', 'Red'] },
  ],
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function decodeText(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function prepareQuestions(categoryId: string, questions: InternalQuestion[]): PreparedQuestion[] {
  return questions.slice(0, 3).map((question, questionIndex) => {
    const choices = shuffle([question.correctAnswer, ...question.incorrectAnswers]).map((choice, choiceIndex) => ({
      id: `${categoryId}-${questionIndex + 1}-${choiceIndex + 1}`,
      label: String.fromCharCode(65 + choiceIndex),
      text: choice,
    }))
    const correct = choices.find((choice) => choice.text === question.correctAnswer)
    if (!correct) {
      throw new Error('Could not prepare valid question choices.')
    }
    return {
      id: `${categoryId}-question-${questionIndex + 1}-${crypto.randomUUID()}`,
      prompt: question.prompt,
      choices,
      correctChoiceId: correct.id,
    }
  })
}

export function getCategoryDeck(count = 4): CategoryOption[] {
  return shuffle(questionCategories)
    .slice(0, count)
    .map(({ apiCategory: _ignored, ...category }) => category)
}

export async function getQuestionsForCategory(categoryId: string): Promise<PreparedQuestion[]> {
  const category = questionCategories.find((entry) => entry.id === categoryId)
  if (!category) {
    throw new Error(`Unknown category: ${categoryId}`)
  }
  const fromApi = await fetchTriviaQuestions(category.apiCategory)
  if (fromApi.length >= 3) {
    return prepareQuestions(categoryId, fromApi)
  }
  return prepareQuestions(categoryId, shuffle(fallbackBank[categoryId] ?? fallbackBank.science))
}

async function fetchTriviaQuestions(apiCategory: number): Promise<InternalQuestion[]> {
  const endpoint = `https://opentdb.com/api.php?amount=3&type=multiple&encode=url3986&category=${apiCategory}`
  try {
    const response = await fetch(endpoint, { cache: 'no-store' })
    if (!response.ok) {
      return []
    }
    const payload = (await response.json()) as {
      response_code: number
      results: Array<{ question: string; correct_answer: string; incorrect_answers: string[] }>
    }
    if (payload.response_code !== 0) {
      return []
    }
    return payload.results.map((entry) => ({
      prompt: decodeText(entry.question),
      correctAnswer: decodeText(entry.correct_answer),
      incorrectAnswers: entry.incorrect_answers.map((answer) => decodeText(answer)),
    }))
  } catch {
    return []
  }
}

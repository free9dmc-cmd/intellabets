import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface AIBet {
  game: string
  homeTeam: string
  awayTeam: string
  pick: string
  odds: number
  betType: string
  line: string
  sport: string
  gameDate: string
  reasoning: string
}

export interface AIBetslip {
  title: string
  description: string
  sport: string
  league: string
  bets: AIBet[]
  totalOdds: number
  stake: number
  potentialReturn: number
  confidence: number
  analysis: string
}

export async function generateAIBetslip(
  sport: string,
  betType: "single" | "parlay" | "same-game-parlay",
  riskLevel: "low" | "medium" | "high"
): Promise<AIBetslip> {
  const betCount = {
    low: { single: 1, parlay: 2, "same-game-parlay": 2 },
    medium: { single: 1, parlay: 3, "same-game-parlay": 3 },
    high: { single: 1, parlay: 5, "same-game-parlay": 4 },
  }[riskLevel][betType]

  const oddsRange = {
    low: "between -250 and -110 (strong favorites only)",
    medium: "between -150 and +150 (balanced picks)",
    high: "between +100 and +350 (upsets and value plays)",
  }[riskLevel]

  const currentDate = new Date().toISOString().split("T")[0]

  const prompt = `You are an elite sports betting analyst with a proven track record. Generate a realistic ${betType} betslip for ${sport} with ${riskLevel} risk.

Today's date: ${currentDate}

Requirements:
- Generate exactly ${betCount} bet(s)
- All odds must be ${oddsRange}
- Use real ${sport} teams and realistic upcoming matchups
- Provide sharp, data-driven reasoning for each pick
- Stake between $50-$200 depending on confidence

Return ONLY a valid JSON object with this exact structure:
{
  "title": "catchy betslip title (e.g. 'Thursday Night Value Play' or 'NBA Fade Package')",
  "description": "1 sentence strategy summary",
  "sport": "${sport}",
  "league": "specific league name",
  "bets": [
    {
      "game": "Away Team @ Home Team",
      "homeTeam": "Home Team Name",
      "awayTeam": "Away Team Name",
      "pick": "specific pick description (e.g. 'Kansas City Chiefs -3.5' or 'LeBron Over 25.5 pts')",
      "odds": -110,
      "betType": "${betType === "parlay" ? "parlay" : "moneyline or spread or total or prop"}",
      "line": "the spread/total number or team name for ML",
      "sport": "${sport}",
      "gameDate": "YYYY-MM-DD",
      "reasoning": "2-3 sentence analytical reasoning with stats/trends"
    }
  ],
  "totalOdds": combined American odds (negative if parlay under 2x, positive if 2x+),
  "stake": recommended stake in dollars (integer),
  "potentialReturn": stake * decimal_odds (2 decimal places),
  "confidence": confidence score 1-100,
  "analysis": "2-3 sentence overall strategy and edge explanation"
}`

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system:
      "You are an expert sports betting analyst. Always respond with valid JSON only, no markdown, no explanation. Generate realistic, data-driven betting recommendations.",
    messages: [{ role: "user", content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== "text") throw new Error("Unexpected AI response type")

  const text = content.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "")

  const betslip = JSON.parse(text) as AIBetslip
  return betslip
}

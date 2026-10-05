import Anthropic from "@anthropic-ai/sdk"
import { anthropicKey } from "./anthropic-key"
import type { AIBet, AIBetslip } from "./ai-types"

// Re-exported so existing imports from "@/lib/ai" keep working.
export type { AIBet, AIBetslip }

const anthropic = new Anthropic({
  apiKey: anthropicKey() ?? undefined,
})

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
    model: process.env.AI_MODEL ?? "claude-opus-5",
    // Must cover the thinking blocks AND the JSON. The old value of 1500 was
    // sized for the JSON alone; with thinking on, the answer gets truncated
    // mid-object and JSON.parse throws on a response that is otherwise fine.
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    // This is structured extraction against odds we supply, not open-ended
    // analysis. Low effort is both sufficient and materially cheaper per call.
    output_config: { effort: "low" },
    system:
      "You are an expert sports betting analyst. Always respond with valid JSON only, no markdown, no explanation. Generate realistic, data-driven betting recommendations.",
    messages: [{ role: "user", content: prompt }],
  })

  // Find the text block rather than assuming it is first.
  //
  // This threw "Unexpected AI response type" on every call. content[0] is a
  // thinking block on models that think by default (Claude Opus 5 does), so
  // indexing position 0 and demanding type "text" always failed. It went
  // unnoticed because the API key was returning 401 -- the moment the key was
  // fixed, this became the next error in line.
  const textBlock = message.content.find(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
  )
  if (!textBlock) {
    throw new Error(
      `No text block in AI response (stop_reason: ${message.stop_reason}, blocks: ${message.content
        .map((b) => b.type)
        .join(", ")})`
    )
  }

  // A truncated response parses as invalid JSON with a confusing message; say
  // what actually happened instead.
  if (message.stop_reason === "max_tokens") {
    throw new Error("AI response hit the token limit before completing the betslip JSON")
  }

  const text = textBlock.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "")

  const betslip = JSON.parse(text) as AIBetslip
  return betslip
}

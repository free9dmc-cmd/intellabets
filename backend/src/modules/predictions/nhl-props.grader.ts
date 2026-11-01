import { Injectable, Logger } from "@nestjs/common"
import type { Prediction } from "@prisma/client"
import { PrismaService } from "../../common/prisma/prisma.service"
import { parsePropOutcomeId } from "../ingestion/prop-markets"
import { NhlStatsService, type NhlGameStats } from "./nhl-stats.service"
import { matchPlayer } from "./player-names"

type PropResult = "won" | "lost" | "push" | "void"

/**
 * Grades pending NHL player props (points, shots on goal) from the NHL's own
 * box score once the game is official. A player who did not dress is voided;
 * a name that cannot be matched for certain stays pending, logged with the
 * prediction id so it can be graded by hand.
 */
@Injectable()
export class NhlPropsGrader {
  private readonly logger = new Logger(NhlPropsGrader.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly nhlStats: NhlStatsService
  ) {}

  /** @returns how many predictions it settled. */
  async settle(gameId: string, homeTeam: string, awayTeam: string, commenceTime: Date): Promise<number> {
    const props = await this.prisma.prediction.findMany({
      where: { gameId, status: "pending", marketType: "prop" },
    })
    if (props.length === 0) return 0

    const game = await this.nhlStats.getGameStats(commenceTime, homeTeam, awayTeam)
    if (!game) return 0

    let graded = 0
    for (const pred of props) {
      const status = this.grade(pred, game)
      if (!status) continue
      await this.prisma.prediction.update({
        where: { id: pred.id },
        data: { status, settledAt: new Date() },
      })
      graded++
    }
    this.logger.log(`Graded ${graded} NHL props for game ${gameId}`)
    return graded
  }

  /** The prop's result, or null to leave it pending. */
  private grade(pred: Pick<Prediction, "id" | "outcomeId">, game: NhlGameStats): PropResult | null {
    const prop = parsePropOutcomeId(pred.outcomeId)
    if (!prop) {
      this.logger.warn(`Prop ${pred.id} left pending: unreadable outcome id "${pred.outcomeId}"`)
      return null
    }

    const match = matchPlayer(game.players, prop.player)
    if (match.kind === "absent") return "void" // did not dress
    if (match.kind === "ambiguous") {
      const ids = match.candidates.map((p) => `${p.team} ${p.playerId}`).join(", ")
      this.logger.warn(`Prop ${pred.id} left pending: "${prop.player}" matches ${ids} in NHL game ${game.gameId}`)
      return null
    }
    if (match.kind === "unsure") {
      this.logger.warn(`Prop ${pred.id} left pending: no exact match for "${prop.player}" in NHL game ${game.gameId}, but a dressed player has that surname`)
      return null
    }

    const line = match.player.line
    const actual = line ? this.nhlStats.statForKey(prop.statKey, line) : null
    if (actual == null) {
      this.logger.warn(`Prop ${pred.id} left pending: no ${prop.statKey} for "${prop.player}" in NHL game ${game.gameId}`)
      return null
    }
    if (actual === prop.point) return "push"
    return (actual > prop.point) === (prop.side === "Over") ? "won" : "lost"
  }
}

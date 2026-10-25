import { ExecutionContext, Injectable } from "@nestjs/common"
import { ThrottlerGuard } from "@nestjs/throttler"
import { timingSafeEqual } from "crypto"

/**
 * The global rate limit, minus the web app's own server-to-server calls.
 *
 * Every request from the web app arrives from Vercel's few egress addresses
 * carrying ENGINE_SERVICE_KEY. Throttled per IP like anonymous traffic, one
 * busy client on a shared address could lock every customer out of picks.
 * The web app rate-limits its own users before it calls the engine.
 */
@Injectable()
export class EngineThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(ctx: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(ctx)) return true
    const key = process.env.ENGINE_SERVICE_KEY
    const presented = ctx.switchToHttp().getRequest()?.headers?.["x-engine-key"]
    if (!key || key.length < 16 || typeof presented !== "string") return false
    const a = Buffer.from(presented)
    const b = Buffer.from(key)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}

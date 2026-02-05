import { Router } from "express"
import { matchIdParamSchema } from "../validation/matches.js"
import { createCommentarySchema, listCommentaryQuerySchema } from "../validation/commentary.js"
import { commentary, matches } from "../db/schema.js"
import { db } from "../db/db.js"
import { eq, desc } from "drizzle-orm"
import { httpArcjet } from "../arcjet.js"

export const commentaryRouter = Router({ mergeParams: true })

const MAX_LIMIT = 100

commentaryRouter.get("/", async (req, res) => {
    if (httpArcjet) {
        try {
            const decision = await httpArcjet.protect(req)

            if (decision.isDenied()) {
                if (decision.reason.isRateLimit()) {
                    return res.status(429).json({ error: "Too many requests." })
                }

                return res.status(403).json({ error: "Forbidden." })
            }
        } catch (e) {
            console.error("Arcjet HTTP protect error:", e)
            return res.status(503).json({ error: "Service Unavailable." })
        }
    }

    const paramsParsed = matchIdParamSchema.safeParse(req.params)

    if (!paramsParsed.success) {
        return res.status(400).json({
            error: "Invalid parameters",
            details: paramsParsed.error.issues
        })
    }

    const queryParsed = listCommentaryQuerySchema.safeParse(req.query)

    if (!queryParsed.success) {
        return res.status(400).json({
            error: "Invalid query",
            details: queryParsed.error.issues
        })
    }

    const limit = Math.min(queryParsed.data.limit ?? 100, MAX_LIMIT)

    try {
        const data = await db
            .select()
            .from(commentary)
            .where(eq(commentary.matchId, paramsParsed.data.id))
            .orderBy(desc(commentary.createdAt))
            .limit(limit)

        res.json({ data })
    } catch (e) {
        console.error("Failed to list commentary:", e)
        res.status(500).json({ error: "Failed to list commentary." })
    }
})

commentaryRouter.post("/", async (req, res) => {
    if (httpArcjet) {
        try {
            const decision = await httpArcjet.protect(req)

            if (decision.isDenied()) {
                if (decision.reason.isRateLimit()) {
                    return res.status(429).json({ error: "Too many requests." })
                }

                return res.status(403).json({ error: "Forbidden." })
            }
        } catch (e) {
            console.error("Arcjet HTTP protect error:", e)
            return res.status(503).json({ error: "Service Unavailable." })
        }
    }

    const paramsParsed = matchIdParamSchema.safeParse(req.params)

    if (!paramsParsed.success) {
        return res.status(400).json({
            error: "Invalid parameters",
            details: paramsParsed.error.issues
        })
    }

    const bodyParsed = createCommentarySchema.safeParse(req.body)

    if (!bodyParsed.success) {
        return res.status(400).json({
            error: "Invalid payload",
            details: bodyParsed.error.issues
        })
    }

    try {
        const [match] = await db
            .select()
            .from(matches)
            .where(eq(matches.id, paramsParsed.data.id))

        if (!match) {
            return res.status(404).json({ error: "Match not found." })
        }

        const [result] = await db.insert(commentary).values({
            matchId: paramsParsed.data.id,
            minute: bodyParsed.data.minute,
            sequence: bodyParsed.data.sequence,
            period: bodyParsed.data.period,
            eventType: bodyParsed.data.eventType,
            actor: bodyParsed.data.actor,
            team: bodyParsed.data.team,
            message: bodyParsed.data.message,
            metadata: bodyParsed.data.metadata,
            tags: bodyParsed.data.tags,
        }).returning()

        if (res.app.locals.broadcastCommentary) {
            res.app.locals.broadcastCommentary(result.matchId, result)
        }

        res.status(201).json({ data: result })
    } catch (e) {
        console.error("Failed to create commentary:", e)
        res.status(500).json({ error: "Failed to create commentary." })
    }
})
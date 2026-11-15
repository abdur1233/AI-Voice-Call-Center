import type { Request, Response, NextFunction } from "express";
import { verifyAgentToken, type AgentTokenPayload } from "../utils/token.js";

// Extend Express's Request type so req.agent is recognized
// by TypeScript everywhere it's used.
declare global {
    namespace Express {
        interface Request {
            agent?: AgentTokenPayload;
        }
    }
}

export function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
): void {

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

    if (!token) {

        res.status(401).json({
            success: false,
            message: "Not authenticated."
        });

        return;

    }

    try {

        req.agent = verifyAgentToken(token);
        next();

    } catch (error) {

        res.status(401).json({
            success: false,
            message: "Session expired. Please log in again."
        });

    }

}

export function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
): void {

    if (req.agent?.role !== "admin") {

        res.status(403).json({
            success: false,
            message: "Admin access required."
        });

        return;

    }

    next();

}

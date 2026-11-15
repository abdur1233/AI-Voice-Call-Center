import jwt from "jsonwebtoken";

export type AgentTokenPayload = {
    agentId: number;
    email: string;
    role: string;
};

function getJwtSecret(): string {

    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error(
            "JWT_SECRET is not set. Copy .env.example to " +
            ".env and set a real secret."
        );
    }

    return secret;
}

export function signAgentToken(
    payload: AgentTokenPayload
): string {

    return jwt.sign(payload, getJwtSecret(), {
        expiresIn: "12h"
    });

}

export function verifyAgentToken(
    token: string
): AgentTokenPayload {

    return jwt.verify(
        token,
        getJwtSecret()
    ) as AgentTokenPayload;

}

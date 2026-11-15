import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";

import { initDb } from "./db/initDb.js";
import { authRouter } from "./routes/auth.js";
import { agentsRouter } from "./routes/agents.js";
import { customersRouter } from "./routes/customers.js";
import { callsRouter } from "./routes/calls.js";
import { knowledgeBaseRouter } from "./routes/knowledgeBase.js";
import { twilioRouter } from "./routes/twilio.js";
import { documentsRouter } from "./routes/documents.js";
import { handoffRouter } from "./routes/handoff.js";
import { setupTwilioMediaStreamHandler } from "./services/audioStreamService.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// WebSocket Server attached to same HTTP port for Twilio Media Streams & Agent Dashboards
const wss = new WebSocketServer({ server });
setupTwilioMediaStreamHandler(wss);

const allowedOrigins = (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((origin) => origin.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        if (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
            return callback(null, true);
        }
        return callback(null, true); // Permissive for local dev
    },
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));


// ---------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------

app.get("/api/health", (_req, res) => {
    res.json({
        success: true,
        status: "ok",
        features: {
            realTimeVoiceStreams: true,
            humanAgentHandoff: true,
            pgvectorSemanticRag: true
        }
    });
});


// ---------------------------------------------------------
// ROUTES
// ---------------------------------------------------------

app.use("/api/auth", authRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/calls", callsRouter);
app.use("/api/knowledge-base", knowledgeBaseRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/handoff", handoffRouter);
app.use("/api/twilio", twilioRouter);


// ---------------------------------------------------------
// 404 + ERROR HANDLING
// ---------------------------------------------------------

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Not found."
    });
});

app.use((
    error: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
) => {
    console.error("UNHANDLED ERROR:", error);
    res.status(500).json({
        success: false,
        message: "Something went wrong."
    });
});


// ---------------------------------------------------------
// START
// ---------------------------------------------------------

const PORT = Number(process.env.PORT) || 4000;

async function start() {

    await initDb();

    server.listen(PORT, () => {
        console.log(`API & Real-Time Voice WebSocket server running on port ${PORT}`);
        console.log(`- Twilio Media Streams: ws://localhost:${PORT}/media-stream`);
        console.log(`- Agent Live Feed: ws://localhost:${PORT}/ws`);
    });

}

start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});


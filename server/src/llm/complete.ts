import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { logRun } from "../store/runLog.js";

export type CompleteInput = {
  system: string;
  prompt: string;
  json?: boolean;
  agent?: string;
};

export type CompleteResult = {
  text: string;
  provider: "gemini" | "groq";
  model: string;
  tokens: number;
  ms: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  return status === 429 || (status !== undefined && status >= 500);
}

async function callGemini(input: CompleteInput): Promise<CompleteResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.MODEL_MAIN;
  if (!apiKey || !model) throw new Error("GEMINI_API_KEY and MODEL_MAIN must be set");

  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 15000 } });
  const started = Date.now();
  const res = await ai.models.generateContent({
    model,
    contents: input.prompt,
    config: {
      systemInstruction: input.system,
      responseMimeType: input.json ? "application/json" : "text/plain",
    },
  });

  return {
    text: res.text ?? "",
    provider: "gemini",
    model,
    tokens: res.usageMetadata?.totalTokenCount ?? 0,
    ms: Date.now() - started,
  };
}

async function callGroq(input: CompleteInput): Promise<CompleteResult> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.MODEL_FAST;
  if (!apiKey || !model) throw new Error("GROQ_API_KEY and MODEL_FAST must be set");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
    timeout: 20000,
    maxRetries: 0,
  });
  const started = Date.now();
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.prompt },
    ],
    ...(input.json ? { response_format: { type: "json_object" as const } } : {}),
  });

  return {
    text: res.choices[0]?.message?.content ?? "",
    provider: "groq",
    model,
    tokens: res.usage?.total_tokens ?? 0,
    ms: Date.now() - started,
  };
}

async function completeWithFallback(input: CompleteInput): Promise<CompleteResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await callGemini(input);
    } catch (err) {
      if (!isRetryable(err)) {
        console.warn("Gemini failed, not retryable:", (err as Error).message.slice(0, 120));
        break;
      }
      console.warn(`Gemini busy (attempt ${attempt} of 2)`);
      await sleep(1500 * attempt);
    }
  }
  console.warn("Falling back to Groq");
  return callGroq(input);
}

export async function complete(input: CompleteInput): Promise<CompleteResult> {
  const result = await completeWithFallback(input);
  await logRun({
    agent: input.agent ?? "unknown",
    provider: result.provider,
    model: result.model,
    tokens: result.tokens,
    ms: result.ms,
  });
  return result;
}
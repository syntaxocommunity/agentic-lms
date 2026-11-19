import "dotenv/config";
import { complete } from "./llm/complete.js";

const result = await complete({
  agent: "smoke",
  system: "You are a terse assistant.",
  prompt: "Reply with exactly: Agentic LMS is alive.",
});

console.log(result);
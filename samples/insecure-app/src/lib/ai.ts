// PLANTED: hardcoded API key
const OPENAI_API_KEY = "__OPENAI_KEY__";

export async function summarize(text: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: text }] }),
  });
  return res.json();
}

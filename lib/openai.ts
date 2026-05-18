export function hasOpenAIConfig() { return Boolean(process.env.OPENAI_API_KEY); }

export async function createOpenAIResponse<T>(input: unknown): Promise<T> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(`OpenAI request failed: ${await response.text()}`);
  return (await response.json()) as T;
}

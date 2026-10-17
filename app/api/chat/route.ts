import { NextRequest, NextResponse } from "next/server";

// In-memory IP rate limiter (20 requests per minute per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return false;
  }

  if (record.count >= MAX_REQUESTS) {
    return true;
  }

  record.count += 1;
  return false;
}

export async function POST(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? "127.0.0.1");

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute before sending another message." },
      { status: 429 }
    );
  }

  try {
    const { provider, apiKey, model, baseUrl, systemPrompt, messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required." }, { status: 400 });
    }

    if (provider !== "ollama" && !apiKey) {
      return NextResponse.json({ error: `API key is required for ${provider}.` }, { status: 400 });
    }

    const effectiveSystemPrompt = systemPrompt || messages.find((m: { role: string }) => m.role === "system")?.content;
    const formattedMessages = effectiveSystemPrompt
      ? [
          { role: "system", content: effectiveSystemPrompt },
          ...messages.filter((m: { role: string }) => m.role !== "system"),
        ]
      : messages;

    let responseText = "";

    switch (provider) {
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: formattedMessages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "OpenAI request failed");
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || "anthropic/claude-opus-5.5",
            messages: formattedMessages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "OpenRouter request failed");
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      case "ollama": {
        const host = (baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
        const res = await fetch(`${host}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: model || "llama3",
            messages: formattedMessages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Ollama request failed");
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      case "anthropic": {
        const nonSystemMessages = messages
          .filter((m: { role: string }) => m.role !== "system")
          .map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          }));

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: model || "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            ...(effectiveSystemPrompt ? { system: effectiveSystemPrompt } : {}),
            messages: nonSystemMessages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Anthropic request failed");
        responseText = data.content?.[0]?.text || "";
        break;
      }

      case "google": {
        const selectedModel = model || "gemini-1.5-flash";
        const contents = messages
          .filter((m: { role: string }) => m.role !== "system")
          .map((m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              ...(effectiveSystemPrompt ? { system_instruction: { parts: [{ text: effectiveSystemPrompt }] } } : {}),
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Google AI request failed");
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        break;
      }

      case "custom": {
        if (!baseUrl) {
          return NextResponse.json({ error: "Base URL is required for Custom provider." }, { status: 400 });
        }
        const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: model || "default",
            messages: formattedMessages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Custom provider request failed");
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

    return NextResponse.json({ content: responseText });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

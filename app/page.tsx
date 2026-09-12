"use client";

import { useState, useEffect, useRef } from "react";

type Provider = "openai" | "openrouter" | "google" | "anthropic" | "ollama" | "custom";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const PROVIDERS: { id: Provider; name: string; defaultModel: string; placeholderKey: string }[] = [
  { id: "openai", name: "OpenAI", defaultModel: "gpt-4o-mini", placeholderKey: "sk-..." },
  { id: "openrouter", name: "OpenRouter", defaultModel: "openai/gpt-4o-mini", placeholderKey: "sk-or-..." },
  { id: "google", name: "Google AI", defaultModel: "gemini-1.5-flash", placeholderKey: "AIzaSy..." },
  { id: "anthropic", name: "Anthropic", defaultModel: "claude-3-5-sonnet-20241022", placeholderKey: "sk-ant-..." },
  { id: "ollama", name: "Ollama (Local)", defaultModel: "llama3", placeholderKey: "Optional key" },
  { id: "custom", name: "Custom (OpenAI-compatible)", defaultModel: "default", placeholderKey: "API key" },
];

function getStored(key: string, fallback: string = ""): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) || fallback;
}

export default function Home() {
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState<string>(() => getStored("chat_key_openai"));
  const [model, setModel] = useState<string>(() => getStored("chat_model_openai"));
  const [baseUrl, setBaseUrl] = useState<string>(() => getStored("chat_url_openai"));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setApiKey(getStored(`chat_key_${newProvider}`));
    setModel(getStored(`chat_model_${newProvider}`));
    const storedUrl = getStored(`chat_url_${newProvider}`);
    setBaseUrl(storedUrl || (newProvider === "ollama" ? "http://127.0.0.1:11434" : ""));
    setError(null);
  };

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem(`chat_key_${provider}`, val);
  };

  const handleModelChange = (val: string) => {
    setModel(val);
    localStorage.setItem(`chat_model_${provider}`, val);
  };

  const handleUrlChange = (val: string) => {
    setBaseUrl(val);
    localStorage.setItem(`chat_url_${provider}`, val);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    if (provider !== "ollama" && !apiKey.trim()) {
      setError(`Please enter your ${provider.toUpperCase()} API key.`);
      return;
    }

    setError(null);
    const newMessages: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          model: model.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
          messages: newMessages,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch response");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activeProviderConfig = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 md:p-6">
      {/* Header controls: Provider, API key, Model */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold">Provider:</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <label className="text-sm font-semibold whitespace-nowrap">API Key:</label>
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder={activeProviderConfig?.placeholderKey}
                suppressHydrationWarning
                className="w-full px-3 py-1.5 pr-14 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <span>Model:</span>
            <input
              type="text"
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder={activeProviderConfig?.defaultModel}
              suppressHydrationWarning
              className="flex-1 px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {(provider === "ollama" || provider === "custom") && (
            <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
              <span>Base URL:</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={provider === "ollama" ? "http://127.0.0.1:11434" : "https://api.example.com/v1"}
                suppressHydrationWarning
                className="flex-1 px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="px-2.5 py-1 text-xs text-red-500 hover:underline cursor-pointer"
            >
              Clear Chat
            </button>
          )}
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mb-3 px-3 py-2 text-sm text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-sm">
            <p className="font-medium">No messages yet.</p>
            <p className="text-xs text-zinc-500 mt-1">Enter your API key and start chatting.</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <span className="text-[11px] text-zinc-400 mb-1 px-1 capitalize">
                {msg.role === "user" ? "You" : activeProviderConfig?.name || "AI"}
              </span>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-none"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex flex-col items-start">
            <span className="text-[11px] text-zinc-400 mb-1 px-1">AI</span>
            <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-2xl rounded-bl-none px-4 py-2.5 text-sm animate-pulse">
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Form */}
      <form onSubmit={sendMessage} className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
          className="flex-1 resize-none rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

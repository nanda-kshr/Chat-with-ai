"use client";

import { useState, useEffect, useRef } from "react";

type Provider = "openai" | "openrouter" | "google" | "anthropic" | "ollama" | "custom";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const PROVIDERS: { id: Provider; name: string; defaultModel: string; placeholderKey: string }[] = [
  { id: "openrouter", name: "OpenRouter", defaultModel: "anthropic/claude-opus-5.5", placeholderKey: "sk-or-..." },
  { id: "openai", name: "OpenAI", defaultModel: "gpt-4o-mini", placeholderKey: "sk-..." },
  { id: "google", name: "Google AI", defaultModel: "gemini-1.5-flash", placeholderKey: "AIzaSy..." },
  { id: "anthropic", name: "Anthropic", defaultModel: "claude-3-5-sonnet-20241022", placeholderKey: "sk-ant-..." },
  { id: "ollama", name: "Ollama (Local)", defaultModel: "llama3", placeholderKey: "Optional key" },
  { id: "custom", name: "Custom (OpenAI-compatible)", defaultModel: "default", placeholderKey: "API key" },
];


interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
}

const DEFAULT_PROMPTS: SavedPrompt[] = [
  { id: "none", name: "None (Default)", prompt: "" },
  { id: "helpful", name: "Helpful Assistant", prompt: "You are a helpful and concise AI assistant." },
  { id: "coder", name: "Code Expert", prompt: "You are an expert software engineer. Provide clean, efficient code and concise explanations." },
  { id: "teacher", name: "Teacher / Explainer", prompt: "Explain concepts simply with clear real-world examples and step-by-step reasoning." },
];

function getStored(key: string, fallback: string = ""): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) || fallback;
}

function getStoredPrompts(): SavedPrompt[] {
  if (typeof window === "undefined") return DEFAULT_PROMPTS;
  const raw = localStorage.getItem("chat_saved_prompts");
  if (!raw) return DEFAULT_PROMPTS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fallback
  }
  return DEFAULT_PROMPTS;
}

export default function Home() {
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [apiKey, setApiKey] = useState<string>(() => getStored("chat_key_openrouter"));
  const [model, setModel] = useState<string>(() => getStored("chat_model_openrouter"));
  const [baseUrl, setBaseUrl] = useState<string>(() => getStored("chat_url_openrouter"));
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(getStoredPrompts);
  const [selectedPromptId, setSelectedPromptId] = useState<string>(() => {
    const storedId = getStored("chat_selected_prompt_id");
    if (storedId) return storedId;
    const current = getStored("chat_system_prompt");
    if (!current) return "none";
    const match = DEFAULT_PROMPTS.find((p) => p.prompt === current);
    return match ? match.id : "custom";
  });
  const [systemPrompt, setSystemPrompt] = useState<string>(() => getStored("chat_system_prompt"));
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

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

  const handleSelectPrompt = (id: string) => {
    setSelectedPromptId(id);
    localStorage.setItem("chat_selected_prompt_id", id);
    if (id !== "custom") {
      const found = savedPrompts.find((p) => p.id === id);
      if (found) {
        setSystemPrompt(found.prompt);
        localStorage.setItem("chat_system_prompt", found.prompt);
      }
    }
  };

  const handleSystemPromptChange = (val: string) => {
    setSystemPrompt(val);
    localStorage.setItem("chat_system_prompt", val);
    const active = savedPrompts.find((p) => p.id === selectedPromptId);
    if (!active || active.prompt !== val) {
      setSelectedPromptId("custom");
      localStorage.setItem("chat_selected_prompt_id", "custom");
    }
  };

  const handleOpenSavePrompt = () => {
    setNewPromptName("");
    setNewPromptContent(systemPrompt);
    setIsSavingPrompt(true);
  };

  const handleSaveNewPrompt = () => {
    const name = newPromptName.trim();
    const prompt = newPromptContent.trim();
    if (!name || !prompt) return;

    const newPrompt: SavedPrompt = {
      id: `custom_${Date.now()}`,
      name,
      prompt,
    };

    const updated = [...savedPrompts, newPrompt];
    setSavedPrompts(updated);
    localStorage.setItem("chat_saved_prompts", JSON.stringify(updated));

    setSelectedPromptId(newPrompt.id);
    localStorage.setItem("chat_selected_prompt_id", newPrompt.id);

    setSystemPrompt(newPrompt.prompt);
    localStorage.setItem("chat_system_prompt", newPrompt.prompt);

    setIsSavingPrompt(false);
  };

  const handleDeletePrompt = (idToDelete: string) => {
    const updated = savedPrompts.filter((p) => p.id !== idToDelete);
    setSavedPrompts(updated);
    localStorage.setItem("chat_saved_prompts", JSON.stringify(updated));

    setSelectedPromptId("none");
    localStorage.setItem("chat_selected_prompt_id", "none");
    setSystemPrompt("");
    localStorage.setItem("chat_system_prompt", "");
  };

  const handleClearStorage = () => {
    if (typeof window !== "undefined" && window.confirm("Clear all stored data from localStorage?")) {
      localStorage.clear();
      setApiKey("");
      setModel("");
      setBaseUrl(provider === "ollama" ? "http://127.0.0.1:11434" : "");
      setSystemPrompt("");
      setSavedPrompts(DEFAULT_PROMPTS);
      setSelectedPromptId("none");
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendChat = async (msgsToSend: Message[]) => {
    if (loading) return;

    if (provider !== "ollama" && !apiKey.trim()) {
      setError(`Please enter your ${provider.toUpperCase()} API key.`);
      return;
    }

    setError(null);
    setMessages(msgsToSend);
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
          systemPrompt: systemPrompt.trim() || undefined,
          messages: msgsToSend,
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

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    await sendChat([...messages, { role: "user", content: trimmed }]);
  };

  const handleEditSubmit = async (index: number) => {
    const trimmed = editText.trim();
    if (!trimmed || loading) return;
    setEditingIndex(null);
    const updatedMessages: Message[] = [
      ...messages.slice(0, index),
      { role: "user", content: trimmed },
    ];
    await sendChat(updatedMessages);
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

        <div className="flex flex-col gap-1.5 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap font-semibold text-zinc-700 dark:text-zinc-300">
                System Prompt:
              </span>
              <select
                value={selectedPromptId}
                onChange={(e) => handleSelectPrompt(e.target.value)}
                suppressHydrationWarning
                className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {selectedPromptId === "custom" && (
                  <option value="custom">Custom (Modified)</option>
                )}
                {savedPrompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {!DEFAULT_PROMPTS.some((p) => p.id === selectedPromptId) && selectedPromptId !== "custom" && (
                <button
                  type="button"
                  onClick={() => handleDeletePrompt(selectedPromptId)}
                  className="text-red-500 hover:text-red-600 hover:underline cursor-pointer"
                  title="Delete this saved prompt"
                >
                  Delete
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleOpenSavePrompt}
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
            >
              + Save as New
            </button>
          </div>

          <textarea
            rows={2}
            value={systemPrompt}
            onChange={(e) => handleSystemPromptChange(e.target.value)}
            placeholder="Optional system instructions (e.g. You are a helpful assistant)"
            suppressHydrationWarning
            className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-zinc-400">
          <span>
            In case you don&apos;t trust any website or extension you have installed, clear local storage before going.
          </span>
          <button
            type="button"
            onClick={handleClearStorage}
            className="text-red-500 hover:text-red-600 hover:underline cursor-pointer font-medium"
          >
            Clear Local Storage
          </button>
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
              <div className="flex items-center gap-2 mb-1 px-1">
                {msg.role === "user" && editingIndex !== index && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setEditingIndex(index);
                      setEditText(msg.content);
                    }}
                    className="text-[11px] text-zinc-400 hover:text-blue-500 cursor-pointer disabled:opacity-50"
                  >
                    Edit
                  </button>
                )}
                <span className="text-[11px] text-zinc-400 capitalize">
                  {msg.role === "user" ? "You" : activeProviderConfig?.name || "AI"}
                </span>
              </div>
              {msg.role === "user" && editingIndex === index ? (
                <div className="w-full max-w-[85%] flex flex-col gap-2">
                  <textarea
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEditSubmit(index);
                      }
                    }}
                    className="w-full p-2.5 rounded-xl border border-blue-500 bg-white dark:bg-zinc-900 text-sm focus:outline-none text-zinc-900 dark:text-zinc-100"
                  />
                  <div className="flex justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditingIndex(null)}
                      className="px-3 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={loading || !editText.trim()}
                      onClick={() => handleEditSubmit(index)}
                      className="px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer font-medium"
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-none"
                  }`}
                >
                  {msg.content}
                </div>
              )}
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

      {/* Save Prompt Modal */}
      {isSavingPrompt && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setIsSavingPrompt(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full p-4 shadow-xl flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Save System Prompt</h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Prompt Name</label>
              <input
                type="text"
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
                placeholder="e.g. Code Reviewer"
                autoFocus
                className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Prompt Content</label>
              <textarea
                rows={4}
                value={newPromptContent}
                onChange={(e) => setNewPromptContent(e.target.value)}
                placeholder="Enter system prompt instructions..."
                className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100 resize-y"
              />
            </div>
            <div className="flex justify-end gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => setIsSavingPrompt(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newPromptName.trim() || !newPromptContent.trim()}
                onClick={handleSaveNewPrompt}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

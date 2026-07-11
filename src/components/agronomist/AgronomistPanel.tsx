"use client";

import { useState, useRef, useEffect } from "react";
import type { WeatherResult } from "@/lib/weather";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What should I focus on today?",
  "Is my fertility program on track?",
  "How does my budget look this year?",
  "What's my current N applied vs. target?",
];

function greeting() {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${timeOfDay}. Ask me anything about your course today.`;
}

export default function AgronomistPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: greeting() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open || weather) return;
    fetch("/api/weather")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setWeather(data))
      .catch(() => {});
  }, [open, weather]);

  async function sendMessage(text?: string) {
    const content = text || input.trim();
    if (!content || loading) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.content },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "I'm having trouble connecting right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function formatContent(content: string) {
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/35 z-[299] transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 bottom-0 w-[440px] bg-white flex flex-col shadow-[-8px_0_32px_rgba(0,0,0,0.15)] z-[300] transition-[right] duration-300 ${
          open ? "right-0" : "-right-[480px]"
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-green-dark to-[#1a4a32] px-4 py-4 flex items-center gap-3 shrink-0">
          <div className="w-[42px] h-[42px] bg-green-bright/20 border-2 border-green-bright/40 rounded-full flex items-center justify-center text-lg shrink-0">
            🌿
          </div>
          <div className="flex-1">
            <div className="font-serif text-base text-white">
              Ask the Agronomist
            </div>
            <div className="text-[10px] text-white/55 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-bright rounded-full animate-pulse-dot" />
              AI · full course context loaded
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-white/10 border-none text-white/70 w-7 h-7 rounded-md cursor-pointer text-lg flex items-center justify-center hover:bg-white/20 hover:text-white transition-all shrink-0"
          >
            ×
          </button>
        </div>

        {/* Context chips */}
        <div className="bg-green-dark px-4 py-2 flex gap-1.5 overflow-x-auto shrink-0 border-b border-white/7 [&::-webkit-scrollbar]:hidden">
          {weather ? (
            <>
              <span className="text-[10px] font-mono text-white/50 bg-white/7 border border-white/11 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                {weather.current.tempF}°F
                {weather.current.humidity != null ? ` · ${weather.current.humidity}% RH` : ""}
              </span>
              <span className="text-[10px] font-mono text-white/50 bg-white/7 border border-white/11 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                ET {weather.agronomics.et0In.toFixed(2)}&quot;
              </span>
              <span className="text-[10px] font-mono text-white/50 bg-white/7 border border-white/11 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                {weather.agronomics.gddSeasonToDate.toFixed(0)} GDD
              </span>
            </>
          ) : (
            <span className="text-[10px] font-mono text-white/40 px-2 py-0.5 whitespace-nowrap shrink-0">
              Loading course context...
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5 bg-chalk [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-rule [&::-webkit-scrollbar-thumb]:rounded">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 items-start ${
                msg.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-sm shrink-0 mt-0.5">
                  🌿
                </div>
              )}
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-green-mid text-white flex items-center justify-center text-[10px] font-bold font-mono shrink-0 mt-0.5">
                  You
                </div>
              )}
              <div
                className={`max-w-[320px] px-3 py-2 rounded-[10px] text-xs leading-relaxed ${
                  msg.role === "assistant"
                    ? "bg-white border-[1.5px] border-rule text-ink rounded-tl-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                    : "bg-green-mid text-white rounded-tr-[3px]"
                }`}
                dangerouslySetInnerHTML={{
                  __html: formatContent(msg.content),
                }}
              />
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-sm shrink-0 mt-0.5">
                🌿
              </div>
              <div className="bg-white border-[1.5px] border-rule rounded-tl-[3px] rounded-[10px] px-3.5 py-2.5 flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-mist rounded-full animate-[typeBounce_1.2s_infinite]" />
                <span className="w-1.5 h-1.5 bg-mist rounded-full animate-[typeBounce_1.2s_infinite_0.2s]" />
                <span className="w-1.5 h-1.5 bg-mist rounded-full animate-[typeBounce_1.2s_infinite_0.4s]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        <div className="px-3.5 pt-1.5 pb-0.5 bg-chalk flex gap-1.5 flex-wrap shrink-0">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-[10px] px-2 py-1 border-[1.5px] border-rule rounded-full bg-white text-green-mid cursor-pointer transition-all font-medium hover:bg-green-pale hover:border-green-mid"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 bg-white border-t border-rule flex gap-2 items-end shrink-0">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your course today..."
            rows={1}
            className="flex-1 border-[1.5px] border-rule rounded-[9px] px-3 py-2 text-xs text-ink resize-none outline-none max-h-[100px] min-h-[38px] leading-relaxed focus:border-green-mid focus:shadow-[0_0_0_2px_rgba(45,106,79,0.1)] placeholder:text-mist"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 bg-green-mid border-none rounded-lg cursor-pointer flex items-center justify-center transition-all shrink-0 hover:bg-green-dark disabled:bg-rule disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-white">
              <path d="M2.94 5.66l13.51-2.7a1 1 0 011.2 1.2l-2.7 13.51a1 1 0 01-1.81.3L9.5 12.5 3.24 8.87a1 1 0 01-.3-1.81z" />
            </svg>
          </button>
        </div>

        <div className="text-[9px] text-mist text-center py-1 px-3.5 bg-white italic">
          AI responses are informational — always verify recommendations
        </div>
      </div>
    </>
  );
}

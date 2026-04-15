/**
 * CommUP — AI Assistant Chat UI (Stage 15.4)
 *
 * Chat interface para el asistente conversacional de completions.
 * Conecta con el Cloudflare Worker de AI Assistant.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  loading?: boolean;
}

const QUICK_PROMPTS = [
  '¿Qué falta para liberar el System-042?',
  '¿Cuáles son los 5 sistemas más atrasados?',
  '¿Cuántos Punch Cat A están abiertos hoy?',
  '¿Qué área tiene el peor forecast de MC?',
  '¿Hay ITRs rechazados sin atender esta semana?',
  '¿Qué problemas de calidad de datos son críticos?',
];

export default function AIAssistantChat({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '👋 Hola, soy el Asistente de Completions CommUP.\n\nPuedo responder preguntas sobre el estado de ITRs, punches, forecast de MC/RFSU, cuellos de botella y calidad de datos.\n\n**Prueba preguntarme:**\n- ¿Qué falta para liberar un sistema?\n- ¿Cuáles son los sistemas más críticos?\n- ¿Qué está bloqueando el Certificado MC del V-401?',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    const loadingMsg: Message = {
      id: 'loading',
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // Construir historial (últimos 10 mensajes para contexto)
      const history = messages
        .filter((m) => m.role !== 'system' && !m.loading && m.id !== 'welcome')
        .slice(-9)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      history.push({ role: 'user', content: text.trim() });

      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, user_id: userId }),
      });

      if (!response.ok) {
        const err = await response.json() as { error?: string };
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { answer: string };

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== 'loading'),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      setError(err.message);
      setMessages((prev) => prev.filter((m) => m.id !== 'loading'));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isLoading, userId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="w-9 h-9 rounded-xl bg-sky-600/20 border border-sky-600/40 flex items-center justify-center">
          <span className="text-lg">🤖</span>
        </div>
        <div>
          <h1 className="font-bold text-base">Asistente CommUP</h1>
          <p className="text-xs text-slate-500">Powered by Claude · Solo lectura</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-slate-500">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-sky-900 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                <span className="text-sm">🤖</span>
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-sky-600 text-white rounded-br-sm'
                  : 'bg-slate-800 text-slate-100 rounded-bl-sm'
              }`}
            >
              {msg.loading ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <span className="text-slate-500 text-xs">Consultando datos...</span>
                </div>
              ) : (
                <div
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: markdownToHTML(msg.content),
                  }}
                />
              )}
              {!msg.loading && (
                <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-sky-200' : 'text-slate-600'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString('es', { timeStyle: 'short' })}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-900/50 border border-red-700 rounded-xl text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* Quick prompts (solo si pocos mensajes) */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="text-xs px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-sky-400 border border-slate-700 hover:border-sky-600/50 rounded-lg transition text-left"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl focus-within:border-sky-600 transition">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta sobre sistemas, ITRs, punches, forecast..."
              disabled={isLoading}
              rows={1}
              className="w-full bg-transparent text-white px-4 py-3 resize-none focus:outline-none placeholder-slate-600 text-sm max-h-32"
              style={{ minHeight: '48px' }}
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-11 h-11 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition flex items-center justify-center"
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 10" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-slate-600 text-center mt-2">
          Enter para enviar · Shift+Enter para nueva línea · Solo consultas de lectura
        </p>
      </div>
    </div>
  );
}

// ── Markdown simple → HTML (sin dependencia externa) ─────────────────────
function markdownToHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-700 px-1 rounded text-sky-300 text-xs">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-sky-400 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-sky-300 mt-4 mb-2 text-base">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-slate-300">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-300">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)+/gm, '<ul class="my-2 space-y-1">$&</ul>')
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}

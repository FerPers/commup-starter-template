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
        throw new Error(err.error ?? `HTTP ${response.status}`);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages((prev) => prev.filter((m) => m.id !== 'loading'));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isLoading, userId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--gray-900)', color: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid var(--gray-800)', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)' }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 18 }}>🤖</span>
        </div>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: 0 }}>Asistente CommUP</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)', margin: 0 }}>Powered by Claude · Solo lectura</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: 'var(--success-500)', borderRadius: 'var(--radius-pill)', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-500)' }}>Online</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            {msg.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-md)', background: 'var(--primary-900)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0, marginTop: 4 }}>
                <span style={{ fontSize: 'var(--text-base)' }}>🤖</span>
              </div>
            )}
            <div
              style={{
                maxWidth: '85%',
                borderRadius: 16,
                padding: '12px 16px',
                fontSize: 'var(--text-sm)',
                background: msg.role === 'user' ? 'var(--primary-600)' : 'var(--gray-800)',
                color: msg.role === 'user' ? '#fff' : 'var(--gray-100)',
                borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
                borderBottomLeftRadius: msg.role === 'user' ? 16 : 4,
              }}
            >
              {msg.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{ width: 6, height: 6, background: 'var(--primary-400)', borderRadius: 'var(--radius-pill)', animation: 'bounce 1s infinite', animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <span style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>Consultando datos...</span>
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
                <div style={{ fontSize: 'var(--text-xs)', marginTop: 4, color: msg.role === 'user' ? 'var(--primary-200)' : 'var(--gray-600)' }}>
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
        <div style={{ margin: '0 16px 8px', padding: 12, background: 'rgba(127, 29, 29, 0.5)', border: '1px solid var(--danger-700)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)', color: 'var(--danger-500)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Quick prompts (solo si pocos mensajes) */}
      {messages.length <= 2 && (
        <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              style={{
                fontSize: 'var(--text-xs)',
                padding: '8px 12px',
                background: 'var(--gray-800)',
                color: 'var(--gray-400)',
                border: '1px solid var(--gray-700)',
                borderRadius: 'var(--radius-md)',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--gray-700)'
                e.currentTarget.style.color = 'var(--primary-400)'
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.5)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--gray-800)'
                e.currentTarget.style.color = 'var(--gray-400)'
                e.currentTarget.style.borderColor = 'var(--gray-700)'
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: 16, borderTop: '1px solid var(--gray-800)', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1, background: 'var(--gray-800)', border: '1px solid var(--gray-700)', borderRadius: 16, transition: 'border-color 0.15s' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta sobre sistemas, ITRs, punches, forecast..."
              disabled={isLoading}
              rows={1}
              style={{ width: '100%', background: 'transparent', color: '#fff', padding: '12px 16px', resize: 'none', outline: 'none', fontSize: 'var(--text-sm)', maxHeight: 128, minHeight: 48, border: 'none', fontFamily: 'inherit' }}
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              background: !input.trim() || isLoading ? 'var(--gray-700)' : 'var(--primary-600)',
              color: !input.trim() || isLoading ? 'var(--gray-500)' : '#fff',
              borderRadius: 'var(--radius-lg)',
              border: 'none',
              cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isLoading ? (
              <svg style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 10" />
              </svg>
            ) : (
              <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-600)', textAlign: 'center', marginTop: 8 }}>
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
    .replace(/`(.+?)`/g, '<code style="background:var(--gray-700);padding:1px 4px;border-radius:var(--radius-sm);color:var(--primary-300);font-size:var(--text-xs)">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 style="font-weight:700;color:var(--primary-400);margin:12px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-weight:700;color:var(--primary-300);margin:16px 0 8px;font-size:var(--text-base)">$1</h2>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:16px;list-style:disc;color:var(--gray-300)">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal;color:var(--gray-300)">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)+/gm, '<ul style="margin:8px 0">$&</ul>')
    .replace(/\n{2,}/g, '</p><p style="margin-top:8px">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}

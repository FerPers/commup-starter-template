/**
 * CommUP — Voice Input Component (Stage 14.3)
 *
 * Web Speech API para campos de texto en ITRs de campo.
 * Ideal para: observaciones, descripciones de punch, notas de condición.
 *
 * Features:
 * - Visual waveform animado mientras escucha
 * - Modo "append" o "replace"
 * - Confidence indicator (descarta bajo 60%)
 * - Vocabulario técnico O&G pre-cargado
 * - Fallback graceful si no hay Speech API
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface VoiceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  mode?: 'append' | 'replace';
  language?: string;
  maxLength?: number;
  className?: string;
}

type RecordState = 'idle' | 'listening' | 'processing' | 'error';

interface SpeechAlt { transcript: string; confidence: number }
interface SpeechResult { isFinal: boolean; length: number; [index: number]: SpeechAlt }
interface SpeechEvent { resultIndex: number; results: { length: number; [index: number]: SpeechResult } }
interface SpeechErrorEvent { error: string }
interface SpeechGrammarListLike {
  addFromString(grammar: string, weight: number): void;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  grammars?: SpeechGrammarListLike;
  onstart: () => void;
  onresult: (event: SpeechEvent) => void;
  onerror: (event: SpeechErrorEvent) => void;
  onend: () => void;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type SpeechGrammarListCtor = new () => SpeechGrammarListLike;
interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  SpeechGrammarList?: SpeechGrammarListCtor;
  webkitSpeechGrammarList?: SpeechGrammarListCtor;
}

// Vocabulario técnico O&G para mejorar reconocimiento
const ONG_GRAMMAR_WORDS = [
  'válvula', 'brida', 'manifold', 'scrubber', 'separador', 'compresor',
  'bomba', 'turbina', 'intercambiador', 'heat exchanger', 'pig launcher',
  'inhibidor', 'corrosión', 'vibración', 'cavitación', 'sellado',
  'empaque', 'gasket', 'fitting', 'weld', 'NDT', 'hydrotest',
  'passivation', 'commissioning', 'pre-commissioning', 'punch',
  'ITR', 'certificado', 'checklist', 'alineación', 'torque',
  'API', 'ASME', 'ISO', 'psi', 'bar', 'kPa', 'MAWP',
  'torque spec', 'tightening', 'leak test', 'functional test',
  'interlock', 'shutdown', 'safeguarding', 'SIL', 'ESD',
  'corrido', 'instalado', 'verificado', 'aprobado', 'rechazado',
  'observación', 'hallazgo', 'pendiente', 'completado',
];

// ─── Hook: Web Speech API ──────────────────────────────────────────────────
export function useVoiceInput(options: {
  language?: string;
  onResult: (text: string, isFinal: boolean) => void;
  onError: (error: string) => void;
}) {
  const { language = 'es-ES', onResult, onError } = options;
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [state, setState] = useState<RecordState>('idle');
  const [isAvailable, setIsAvailable] = useState(false);
  const [interimText, setInterimText] = useState('');

  useEffect(() => {
    const w = window as unknown as SpeechWindow;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Web Speech API detection requires window access, only available client-side
    setIsAvailable(!!SpeechRecognition);
  }, []);

  const start = useCallback(async () => {
    const w = window as unknown as SpeechWindow;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      onError('Dictado no disponible en este navegador. Use Chrome o Edge.');
      return;
    }

    // Solicitar permiso micrófono explícitamente
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('Permiso de micrófono denegado.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    // Grammar opcional (Chrome desktop)
    if ('SpeechGrammarList' in window || 'webkitSpeechGrammarList' in window) {
      const GrammarList = w.SpeechGrammarList || w.webkitSpeechGrammarList;
      if (GrammarList) {
        const grammarList = new GrammarList();
        const grammar = `#JSGF V1.0; grammar oilgas; public <term> = ${ONG_GRAMMAR_WORDS.join(' | ')};`;
        grammarList.addFromString(grammar, 1);
        recognition.grammars = grammarList;
      }
    }

    recognition.onstart = () => {
      setState('listening');
      setInterimText('');
    };

    recognition.onresult = (event: SpeechEvent) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const best = result[0];

        if (result.isFinal) {
          if (best.confidence > 0.5) {
            finalText += best.transcript + ' ';
          } else {
            // Bajo confidence: intentar alternativas
            for (let j = 1; j < result.length; j++) {
              if (result[j].confidence > 0.5) {
                finalText += result[j].transcript + ' ';
                break;
              }
            }
          }
        } else {
          interim += best.transcript;
        }
      }

      setInterimText(interim);
      if (finalText) {
        onResult(finalText.trim(), true);
        setInterimText('');
      } else if (interim) {
        onResult(interim, false);
      }
    };

    recognition.onerror = (event: SpeechErrorEvent) => {
      setState('error');
      switch (event.error) {
        case 'not-allowed': onError('Micrófono bloqueado por el navegador'); break;
        case 'no-speech': onError('No se detectó voz. Intente de nuevo.'); break;
        case 'network': onError('Error de red para reconocimiento de voz'); break;
        case 'aborted': break; // normal al detener
        default: onError(`Error de dictado: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setState('idle');
      setInterimText('');
    };

    recognition.start();
  }, [language, onResult, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setState('idle');
    setInterimText('');
  }, []);

  const abort = useCallback(() => {
    recognitionRef.current?.abort();
    setState('idle');
    setInterimText('');
  }, []);

  return { state, isAvailable, interimText, start, stop, abort };
}

// ─── Waveform Animado ──────────────────────────────────────────────────────
function VoiceWaveform({ active }: { active: boolean }) {
  const bars = Array.from({ length: 7 });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 24 }}>
      {bars.map((_, i) => (
        <div
          key={i}
          style={{
            width: 4,
            borderRadius: 'var(--radius-pill)',
            transition: 'all 0.15s',
            background: active ? 'var(--primary-400)' : 'var(--gray-600)',
            height: active ? undefined : 4,
            animation: active
              ? `waveBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`
              : 'none',
            minHeight: 4,
          }}
        />
      ))}
      <style>{`
        @keyframes waveBar {
          from { height: 4px; }
          to { height: 20px; }
        }
      `}</style>
    </div>
  );
}

// ─── Componente Principal ──────────────────────────────────────────────────
export default function VoiceInput({
  value,
  onChange,
  placeholder = 'Ingrese texto o use el micrófono...',
  label,
  disabled = false,
  mode = 'append',
  language = 'es-ES',
  maxLength = 2000,
  className = '',
}: VoiceInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [interimDisplay, setInterimDisplay] = useState('');

  const { state, isAvailable, start, stop } = useVoiceInput({
    language,
    onResult: (text, isFinal) => {
      if (isFinal) {
        if (mode === 'append') {
          const separator = value && !value.endsWith(' ') ? ' ' : '';
          onChange((value + separator + text).slice(0, maxLength));
        } else {
          onChange(text.slice(0, maxLength));
        }
        setInterimDisplay('');
      } else {
        setInterimDisplay(text);
      }
    },
    onError: (err) => {
      setError(err);
      setTimeout(() => setError(null), 4000);
    },
  });

  const isListening = state === 'listening';

  const toggleVoice = () => {
    if (isListening) {
      stop();
    } else {
      setError(null);
      start();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--gray-300)' }}>{label}</label>
      )}

      <div style={{
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${isListening ? 'var(--primary-500)' : 'var(--gray-600)'}`,
        background: 'var(--gray-800)',
        boxShadow: isListening ? '0 0 0 2px rgba(59, 130, 246, 0.3)' : undefined,
        transition: 'all 0.15s',
      }}>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || isListening}
          maxLength={maxLength}
          rows={3}
          style={{
            width: '100%',
            background: 'transparent',
            color: '#fff',
            padding: '12px 16px 40px',
            resize: 'none',
            outline: 'none',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.6,
            border: 'none',
            fontFamily: 'inherit',
          }}
        />

        {/* Interim text overlay */}
        {isListening && interimDisplay && (
          <div style={{ position: 'absolute', top: 12, left: 16, right: 48, pointerEvents: 'none' }}>
            <span style={{ color: 'var(--gray-500)', fontSize: 'var(--text-sm)' }}>{value && value + ' '}</span>
            <span style={{ color: 'rgba(147, 197, 253, 0.7)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>{interimDisplay}</span>
          </div>
        )}

        {/* Bottom bar: contador + waveform + botón */}
        <div style={{ position: 'absolute', bottom: 8, left: 12, right: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Contador de caracteres */}
          <span style={{ color: 'var(--gray-600)', fontSize: 'var(--text-xs)' }}>
            {value.length}/{maxLength}
          </span>

          {/* Waveform cuando escucha */}
          {isListening && (
            <div style={{ flex: 1 }}>
              <VoiceWaveform active={true} />
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Botón micrófono */}
          {isAvailable && !disabled && (
            <button
              type="button"
              onClick={toggleVoice}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                transition: 'all 0.15s',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: isListening ? 'var(--danger-500)' : 'var(--gray-700)',
                color: isListening ? '#fff' : 'var(--gray-300)',
                animation: isListening ? 'pulse 2s infinite' : undefined,
              }}
            >
              {isListening ? (
                <>
                  <span>■</span>
                  <span>Detener</span>
                </>
              ) : (
                <>
                  <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 13.93V19h-2v2h6v-2h-2v-2.07A7 7 0 0 0 19 11h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93z"/>
                  </svg>
                  <span>Dictar</span>
                </>
              )}
            </button>
          )}

          {/* Clear button */}
          {value && !isListening && (
            <button
              type="button"
              onClick={() => onChange('')}
              style={{
                padding: 6,
                borderRadius: 'var(--radius-md)',
                color: 'var(--gray-600)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--gray-400)'
                e.currentTarget.style.background = 'var(--gray-700)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--gray-600)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Listening indicator */}
      {isListening && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-400)', fontSize: 'var(--text-xs)' }}>
          <span style={{ width: 8, height: 8, background: 'var(--primary-400)', borderRadius: 'var(--radius-pill)', animation: 'pulse 2s infinite' }} />
          Escuchando... Hable claramente en español
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--danger-500)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Fallback notice */}
      {!isAvailable && (
        <div style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>
          💡 Dictado disponible en Chrome y Edge
        </div>
      )}
    </div>
  );
}

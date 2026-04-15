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
  const recognitionRef = useRef<any>(null);
  const [state, setState] = useState<RecordState>('idle');
  const [isAvailable, setIsAvailable] = useState(false);
  const [interimText, setInterimText] = useState('');

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setIsAvailable(!!SpeechRecognition);
  }, []);

  const start = useCallback(async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

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
      const GrammarList =
        (window as any).SpeechGrammarList ||
        (window as any).webkitSpeechGrammarList;
      const grammarList = new GrammarList();
      const grammar = `#JSGF V1.0; grammar oilgas; public <term> = ${ONG_GRAMMAR_WORDS.join(' | ')};`;
      grammarList.addFromString(grammar, 1);
      recognition.grammars = grammarList;
    }

    recognition.onstart = () => {
      setState('listening');
      setInterimText('');
    };

    recognition.onresult = (event: any) => {
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

    recognition.onerror = (event: any) => {
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
    <div className="flex items-center justify-center gap-1 h-6">
      {bars.map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all ${
            active ? 'bg-sky-400' : 'bg-slate-600'
          }`}
          style={{
            height: active ? undefined : '4px',
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
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-slate-300">{label}</label>
      )}

      <div className={`relative rounded-xl border transition-all ${
        isListening
          ? 'border-sky-500 ring-2 ring-sky-500/30 bg-slate-800'
          : 'border-slate-600 bg-slate-800 focus-within:border-slate-500'
      }`}>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || isListening}
          maxLength={maxLength}
          rows={3}
          className="w-full bg-transparent text-white px-4 pt-3 pb-10 resize-none focus:outline-none placeholder-slate-600 text-sm leading-relaxed"
        />

        {/* Interim text overlay */}
        {isListening && interimDisplay && (
          <div className="absolute top-3 left-4 right-12 pointer-events-none">
            <span className="text-slate-500 text-sm">{value && value + ' '}</span>
            <span className="text-sky-300/70 text-sm italic">{interimDisplay}</span>
          </div>
        )}

        {/* Bottom bar: contador + waveform + botón */}
        <div className="absolute bottom-2 left-3 right-2 flex items-center gap-2">
          {/* Contador de caracteres */}
          <span className="text-slate-600 text-xs">
            {value.length}/{maxLength}
          </span>

          {/* Waveform cuando escucha */}
          {isListening && (
            <div className="flex-1">
              <VoiceWaveform active={true} />
            </div>
          )}

          <div className="flex-1" />

          {/* Botón micrófono */}
          {isAvailable && !disabled && (
            <button
              type="button"
              onClick={toggleVoice}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isListening
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              {isListening ? (
                <>
                  <span>■</span>
                  <span>Detener</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
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
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-700 transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Listening indicator */}
      {isListening && (
        <div className="flex items-center gap-2 text-sky-400 text-xs">
          <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse" />
          Escuchando... Hable claramente en español
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-red-400 text-xs flex items-center gap-1">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Fallback notice */}
      {!isAvailable && (
        <div className="text-slate-500 text-xs">
          💡 Dictado disponible en Chrome y Edge
        </div>
      )}
    </div>
  );
}

/**
 * CommUP — QR/NFC Scanner Component (Stage 14.2)
 *
 * - QR: html5-qrcode library con viewfinder overlay profesional
 * - NFC: Web NFC API (Android Chrome 89+)
 * - Deep link a /tag_360/:tagId para cualquier equipo
 * - Historial de escaneos recientes
 * - Vibración haptica en scan exitoso
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface ScanResult {
  tag_id: string;
  tag_type: 'QR' | 'NFC' | 'MANUAL';
  raw: string;
  timestamp: string;
}

interface RecentScan {
  tag_id: string;
  tag_type: 'QR' | 'NFC' | 'MANUAL';
  scanned_at: string;
  equipment_name?: string;
}

type ScanMode = 'QR' | 'NFC' | 'MANUAL';

// ─── CommUP Tag URL pattern ────────────────────────────────────────────────
// Formatos aceptados:
//   https://app.commup.io/tag_360/EQ-001-PUMP-001
//   commup://tag/EQ-001-PUMP-001
//   EQ-001-PUMP-001  (tag_id directo)
const COMMUP_TAG_PATTERNS = [
  /\/tag_360\/([A-Z0-9\-_]+)/i,
  /commup:\/\/tag\/([A-Z0-9\-_]+)/i,
  /^([A-Z]{2,4}-\d{3,6}-[A-Z0-9\-]+)$/i,
];

function parseTagId(raw: string): string | null {
  for (const pattern of COMMUP_TAG_PATTERNS) {
    const match = raw.trim().match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

// ─── Hook: NFC Scanner ─────────────────────────────────────────────────────
function useNFCScan(
  onScan: (result: ScanResult) => void,
  onError: (error: string) => void
) {
  const abortRef = useRef<AbortController | null>(null);
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [nfcActive, setNfcActive] = useState(false);

  useEffect(() => {
    setNfcAvailable('NDEFReader' in window);
  }, []);

  const startNFC = useCallback(async () => {
    if (!('NDEFReader' in window)) {
      onError('NFC no disponible en este dispositivo');
      return;
    }
    try {
      abortRef.current = new AbortController();
      const ndef = new (window as any).NDEFReader();
      await ndef.scan({ signal: abortRef.current.signal });
      setNfcActive(true);

      ndef.addEventListener('reading', ({ message, serialNumber }: any) => {
        let raw = serialNumber;
        for (const record of message.records) {
          if (record.recordType === 'url') {
            const decoder = new TextDecoder();
            raw = decoder.decode(record.data);
            break;
          } else if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            raw = decoder.decode(record.data);
            break;
          }
        }

        const tagId = parseTagId(raw);
        if (tagId) {
          navigator.vibrate?.([100, 50, 100]);
          onScan({ tag_id: tagId, tag_type: 'NFC', raw, timestamp: new Date().toISOString() });
        } else {
          onError(`NFC tag no reconocido: ${raw}`);
        }
      });

      ndef.addEventListener('readingerror', () => {
        onError('Error leyendo NFC tag. Acerque más el dispositivo.');
      });
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        onError('Permiso NFC denegado. Habilítelo en configuración.');
      } else {
        onError(`NFC error: ${err.message}`);
      }
      setNfcActive(false);
    }
  }, [onScan, onError]);

  const stopNFC = useCallback(() => {
    abortRef.current?.abort();
    setNfcActive(false);
  }, []);

  return { nfcAvailable, nfcActive, startNFC, stopNFC };
}

// ─── Hook: html5-qrcode QR Scanner ────────────────────────────────────────
function useQRScan(
  containerId: string,
  onScan: (result: ScanResult) => void,
  onError: (error: string) => void
) {
  const scannerRef = useRef<any>(null);
  const [qrActive, setQrActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startQR = useCallback(async () => {
    try {
      // html5-qrcode cargado vía CDN o npm
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(containerId, {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error('No se encontró cámara');
      }

      // Preferir cámara trasera
      const backCamera = cameras.find((c: any) =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment')
      ) || cameras[cameras.length - 1];

      await scanner.start(
        { deviceId: backCamera.id },
        {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
          disableFlip: false,
          formatsToSupport: [
            0,  // QR_CODE
            4,  // CODE_128
            5,  // CODE_39
            11, // DATA_MATRIX
          ],
        },
        (decodedText: string) => {
          const tagId = parseTagId(decodedText);
          if (tagId) {
            navigator.vibrate?.([150]);
            onScan({ tag_id: tagId, tag_type: 'QR', raw: decodedText, timestamp: new Date().toISOString() });
          } else {
            onError(`Código no reconocido: ${decodedText.substring(0, 40)}...`);
          }
        },
        undefined // errores de frame: ignorar (normal)
      );

      setQrActive(true);
      setCameraError(null);
    } catch (err: any) {
      const msg = err.message?.includes('permission')
        ? 'Permiso de cámara denegado. Habilítelo en el navegador.'
        : err.message || 'Error iniciando cámara';
      setCameraError(msg);
      onError(msg);
    }
  }, [containerId, onScan, onError]);

  const stopQR = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch { /* ya detenido */ }
      scannerRef.current = null;
    }
    setQrActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopQR(); };
  }, [stopQR]);

  return { qrActive, cameraError, startQR, stopQR };
}

// ─── Componente Principal ──────────────────────────────────────────────────
export default function QRNFCScanner() {
  const router = useRouter();
  const QR_CONTAINER_ID = 'commup-qr-container';

  const [mode, setMode] = useState<ScanMode>('QR');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Cargar historial desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem('commup-recent-scans');
    if (saved) {
      try { setRecentScans(JSON.parse(saved)); } catch { }
    }
  }, []);

  const handleScan = useCallback((result: ScanResult) => {
    setLastScan(result);
    setError(null);

    // Actualizar historial
    const newScan: RecentScan = {
      tag_id: result.tag_id,
      tag_type: result.tag_type,
      scanned_at: result.timestamp,
    };
    setRecentScans((prev) => {
      const filtered = prev.filter((s) => s.tag_id !== result.tag_id);
      const updated = [newScan, ...filtered].slice(0, 10);
      localStorage.setItem('commup-recent-scans', JSON.stringify(updated));
      return updated;
    });

    // Navegar a tag_360 después de 300ms (feedback visual primero)
    setTimeout(() => router.push(`/tag_360/${result.tag_id}`), 300);
  }, [router]);

  const handleError = useCallback((err: string) => {
    setError(err);
    setTimeout(() => setError(null), 4000);
  }, []);

  const { nfcAvailable, nfcActive, startNFC, stopNFC } = useNFCScan(handleScan, handleError);
  const { qrActive, cameraError, startQR, stopQR } = useQRScan(QR_CONTAINER_ID, handleScan, handleError);

  // Arrancar/detener según modo
  useEffect(() => {
    if (mode === 'QR') {
      stopNFC();
      startQR();
    } else if (mode === 'NFC') {
      stopQR();
      startNFC();
    } else {
      stopQR();
      stopNFC();
    }
    return () => {
      stopQR();
      stopNFC();
    };
  }, [mode]);

  const handleManualSubmit = () => {
    const tagId = parseTagId(manualInput);
    if (tagId) {
      handleScan({ tag_id: tagId, tag_type: 'MANUAL', raw: manualInput, timestamp: new Date().toISOString() });
    } else {
      handleError('ID de tag no válido. Formato: XX-000-NOMBRE-000');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-slate-800 transition"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">Escanear Tag</h1>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="p-2 rounded-lg hover:bg-slate-800 transition relative"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {recentScans.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-sky-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-1 p-3 bg-slate-800">
        {(['QR', 'NFC', 'MANUAL'] as ScanMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={m === 'NFC' && !nfcAvailable}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition ${
              mode === m
                ? 'bg-sky-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            } ${m === 'NFC' && !nfcAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {m === 'QR' && '📷 QR'}
            {m === 'NFC' && `📡 NFC${!nfcAvailable ? ' (N/D)' : ''}`}
            {m === 'MANUAL' && '⌨️ Manual'}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {(error || cameraError) && (
        <div className="mx-4 mt-3 p-3 bg-red-900/50 border border-red-500 rounded-lg text-sm text-red-200">
          ⚠️ {error || cameraError}
        </div>
      )}

      {/* QR Viewfinder */}
      {mode === 'QR' && (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm">
            {/* Container html5-qrcode */}
            <div
              id={QR_CONTAINER_ID}
              className="w-full rounded-2xl overflow-hidden bg-black"
              style={{ minHeight: 320 }}
            />
            {/* Overlay con crosshair */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 relative">
                  {/* Esquinas del viewfinder */}
                  {[
                    'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                    'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                    'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                    'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 border-sky-400 ${cls}`} />
                  ))}
                  {/* Scan line animada */}
                  {qrActive && (
                    <div className="absolute left-2 right-2 h-0.5 bg-sky-400 opacity-80 animate-scan-line" />
                  )}
                </div>
              </div>
            </div>
            {/* Status indicator */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                qrActive ? 'bg-sky-600/80 text-sky-100' : 'bg-slate-700/80 text-slate-400'
              }`}>
                {qrActive ? '● Escaneando...' : '⊘ Cámara inactiva'}
              </span>
            </div>
          </div>
          <p className="text-slate-400 text-sm text-center mt-4">
            Apunte al código QR o código de barras del tag del equipo
          </p>
        </div>
      )}

      {/* NFC Mode */}
      {mode === 'NFC' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className={`w-48 h-48 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${
            nfcActive
              ? 'border-sky-400 bg-sky-900/30 animate-pulse'
              : 'border-slate-600 bg-slate-800'
          }`}>
            <div className="text-center">
              <div className="text-6xl mb-2">📡</div>
              <div className="text-sm font-semibold text-sky-400">
                {nfcActive ? 'Listo' : 'Inactivo'}
              </div>
            </div>
          </div>
          {!nfcActive && (
            <button
              onClick={startNFC}
              className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-8 rounded-xl transition"
            >
              Activar NFC
            </button>
          )}
          {nfcActive && (
            <>
              <p className="text-slate-300 text-center text-lg font-medium">
                Acerque el dispositivo al tag NFC del equipo
              </p>
              <button
                onClick={stopNFC}
                className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-6 rounded-lg text-sm transition"
              >
                Detener
              </button>
            </>
          )}
        </div>
      )}

      {/* Manual Input */}
      {mode === 'MANUAL' && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          <p className="text-slate-400 text-sm">
            Ingrese el ID del tag o escanee/pegue la URL del equipo
          </p>
          <div className="relative">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="EJ: PMP-001-P-001A"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-4 text-white text-lg font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button
            onClick={handleManualSubmit}
            disabled={!manualInput}
            className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl transition text-lg"
          >
            Ir a Tag →
          </button>
          <div className="mt-2 p-3 bg-slate-800 rounded-lg">
            <p className="text-slate-500 text-xs font-mono">Formatos válidos:</p>
            <p className="text-slate-400 text-xs font-mono mt-1">PMP-001-P-001A</p>
            <p className="text-slate-400 text-xs font-mono">https://app.commup.io/tag_360/XXX</p>
            <p className="text-slate-400 text-xs font-mono">commup://tag/XXX</p>
          </div>
        </div>
      )}

      {/* Recent Scans Drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="flex-1 bg-black/50"
            onClick={() => setShowHistory(false)}
          />
          <div className="bg-slate-800 rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto">
            <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-4" />
            <h2 className="font-bold text-lg mb-4">Escaneados Recientes</h2>
            {recentScans.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Sin historial aún</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentScans.map((scan, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setShowHistory(false);
                      router.push(`/tag_360/${scan.tag_id}`);
                    }}
                    className="flex items-center gap-3 p-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition text-left"
                  >
                    <span className="text-xl">{scan.tag_type === 'QR' ? '📷' : scan.tag_type === 'NFC' ? '📡' : '⌨️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono font-semibold text-sky-300 truncate">{scan.tag_id}</div>
                      {scan.equipment_name && (
                        <div className="text-slate-400 text-sm truncate">{scan.equipment_name}</div>
                      )}
                      <div className="text-slate-500 text-xs">
                        {new Date(scan.scanned_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan Success Flash */}
      {lastScan && (
        <div className="fixed bottom-6 left-4 right-4 z-40 bg-green-600 text-white p-4 rounded-2xl shadow-2xl animate-slide-up">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <div>
              <div className="font-bold">{lastScan.tag_id}</div>
              <div className="text-green-200 text-sm">Navegando a Tag 360°...</div>
            </div>
          </div>
        </div>
      )}

      {/* Tailwind animation classes — add to global CSS */}
      <style>{`
        @keyframes scan-line {
          0% { top: 8px; }
          50% { top: calc(100% - 8px); }
          100% { top: 8px; }
        }
        .animate-scan-line { animation: scan-line 2s ease-in-out infinite; }
        @keyframes slide-up {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  );
}

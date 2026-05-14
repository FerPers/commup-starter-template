/**
 * CommUP — Prediction Engine (Stage 15.1)
 *
 * Modelo de predicción de fechas MC/RFSU por sistema.
 * Algoritmo: Regresión lineal ponderada + factores de riesgo.
 *
 * Inputs:
 *   - domain_events históricos (progresión de completions en el tiempo)
 *   - Estado actual de ITRs, Punches, Punch Cat A
 *   - Factores: días laborables restantes, punch cat A pendientes,
 *               velocidad histórica del equipo, ratio de rechazo de ITRs
 *
 * Outputs:
 *   - Fecha predicha de MC / RFSU
 *   - Intervalo de confianza (P10 / P50 / P90)
 *   - Risk score (0–100)
 *   - Top drivers de retraso (explicabilidad)
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface DomainEvent {
  event_id: string;
  system_id: string;
  event_type:
    | 'itr_completed'
    | 'itr_rejected'
    | 'punch_raised'
    | 'punch_cleared'
    | 'certificate_issued'
    | 'mc_achieved'
    | 'rfsu_achieved';
  occurred_at: string;   // ISO
  metadata?: Record<string, unknown>;
}

export interface SystemSnapshot {
  system_id: string;
  system_tag: string;
  discipline: string;
  planned_mc_date: string;     // ISO
  planned_rfsu_date: string;   // ISO
  // ITR progress
  total_itrs: number;
  completed_itrs: number;
  rejected_itrs: number;
  // Punch status
  punch_cat_a: number;
  punch_cat_b: number;
  punch_cat_c: number;
  punch_cleared: number;
  // Subsystem count
  subsystems_total: number;
  subsystems_mc_achieved: number;
  // Team
  team_id?: string;
}

export interface PredictionResult {
  system_id: string;
  system_tag: string;
  // Fechas predichas
  predicted_mc_p10: string;     // Optimista (10% prob de ser antes)
  predicted_mc_p50: string;     // Mediana (Best estimate)
  predicted_mc_p90: string;     // Conservador (90% prob de ser antes)
  predicted_rfsu_p50: string;
  // Schedule vs Forecast
  planned_mc_date: string;
  delay_days_p50: number;       // positivo = retraso, negativo = adelanto
  delay_risk: 'on_track' | 'at_risk' | 'delayed' | 'critical';
  // Scores
  risk_score: number;           // 0-100 (100 = máximo riesgo)
  completion_rate: number;      // 0-1
  velocity_rate: number;        // ITRs/día promedio (últimas 2 semanas)
  rejection_rate: number;       // rechazos / total completions
  // Drivers de retraso (ordenados por impacto)
  delay_drivers: DelayDriver[];
  // Metadata del modelo
  model_confidence: number;     // 0-1 (basado en cantidad de eventos)
  data_points: number;
  last_event_at: string;
  computed_at: string;
}

export interface DelayDriver {
  factor: string;
  impact_days: number;          // días de impacto estimado
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  action?: string;              // acción recomendada
}

export interface TeamVelocity {
  team_id: string;
  avg_itrs_per_day: number;
  avg_rejection_rate: number;
  avg_punch_clearance_days: number;
  sample_days: number;
}

// ─── Regresión Lineal Simple ──────────────────────────────────────────────

interface DataPoint {
  x: number;   // días desde inicio del proyecto
  y: number;   // % completeness (0-100)
  weight?: number;  // eventos más recientes pesan más
}

interface LinearModel {
  slope: number;
  intercept: number;
  r_squared: number;
  residual_std: number;
}

function fitLinearRegression(points: DataPoint[]): LinearModel {
  if (points.length < 2) {
    return { slope: 0, intercept: 0, r_squared: 0, residual_std: Infinity };
  }

  const n = points.length;
  const totalWeight = points.reduce((s, p) => s + (p.weight ?? 1), 0);

  // Weighted means
  const meanX = points.reduce((s, p) => s + p.x * (p.weight ?? 1), 0) / totalWeight;
  const meanY = points.reduce((s, p) => s + p.y * (p.weight ?? 1), 0) / totalWeight;

  // Weighted covariance and variance
  const covXY = points.reduce((s, p) => s + (p.weight ?? 1) * (p.x - meanX) * (p.y - meanY), 0) / totalWeight;
  const varX = points.reduce((s, p) => s + (p.weight ?? 1) * Math.pow(p.x - meanX, 2), 0) / totalWeight;

  if (varX === 0) return { slope: 0, intercept: meanY, r_squared: 0, residual_std: 0 };

  const slope = covXY / varX;
  const intercept = meanY - slope * meanX;

  // R²
  const varY = points.reduce((s, p) => s + (p.weight ?? 1) * Math.pow(p.y - meanY, 2), 0) / totalWeight;
  const r_squared = varX === 0 ? 0 : Math.pow(covXY, 2) / (varX * varY || 1);

  // Residual std dev
  const residuals = points.map((p) => p.y - (slope * p.x + intercept));
  const residual_std = Math.sqrt(
    residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1)
  );

  return { slope, intercept, r_squared, residual_std };
}

/**
 * Proyectar día en que Y alcanza el 100% (MC) según el modelo lineal.
 * Retorna null si slope ≤ 0 (no se puede predecir).
 */
function projectDayToComplete(model: LinearModel): number | null {
  if (model.slope <= 0) return null;
  return (100 - model.intercept) / model.slope;
}

// ─── Factores de Riesgo ───────────────────────────────────────────────────

const RISK_WEIGHTS = {
  punch_cat_a_open:       30,   // Cat A bloquea MC — mayor impacto
  rejection_rate_high:    20,   // >20% rejection rate
  velocity_declining:     15,   // velocidad bajando últimas 2 semanas
  completion_below_50:    15,   // <50% completado con <30 días para MC
  no_recent_activity:     10,   // sin eventos en 7+ días
  subsystems_incomplete:  10,   // subsistemas sin MC que bloquean sistema
} as const;

function calculateRiskScore(
  snapshot: SystemSnapshot,
  events: DomainEvent[],
  currentDay: number,
  plannedMCDay: number
): number {
  let score = 0;
  const daysToMC = plannedMCDay - currentDay;
  const completionRate = snapshot.completed_itrs / Math.max(snapshot.total_itrs, 1);

  // Punch Cat A abiertos
  if (snapshot.punch_cat_a > 0) {
    score += RISK_WEIGHTS.punch_cat_a_open * Math.min(snapshot.punch_cat_a / 5, 1);
  }

  // Rejection rate
  const totalAttempts = snapshot.completed_itrs + snapshot.rejected_itrs;
  const rejectionRate = totalAttempts > 0 ? snapshot.rejected_itrs / totalAttempts : 0;
  if (rejectionRate > 0.20) {
    score += RISK_WEIGHTS.rejection_rate_high * Math.min(rejectionRate / 0.4, 1);
  }

  // Completion < 50% con poco tiempo
  if (completionRate < 0.5 && daysToMC < 30) {
    score += RISK_WEIGHTS.completion_below_50 * (1 - completionRate / 0.5);
  }

  // Sin actividad reciente
  const lastEvent = events
    .filter((e) => e.system_id === snapshot.system_id)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];
  if (lastEvent) {
    const daysSinceActivity = (Date.now() - new Date(lastEvent.occurred_at).getTime()) / 86400000;
    if (daysSinceActivity > 7) {
      score += RISK_WEIGHTS.no_recent_activity * Math.min(daysSinceActivity / 30, 1);
    }
  }

  // Subsistemas incompletos
  const subsystemCompletionRate = snapshot.subsystems_mc_achieved / Math.max(snapshot.subsystems_total, 1);
  if (subsystemCompletionRate < 0.8 && daysToMC < 14) {
    score += RISK_WEIGHTS.subsystems_incomplete * (1 - subsystemCompletionRate);
  }

  return Math.min(Math.round(score), 100);
}

function buildDelayDrivers(
  snapshot: SystemSnapshot,
  events: DomainEvent[],
  model: LinearModel,
  predictedDays: number | null,
  plannedMCDay: number,
  _currentDay: number
): DelayDriver[] {
  const drivers: DelayDriver[] = [];
  const totalAttempts = snapshot.completed_itrs + snapshot.rejected_itrs;
  const rejectionRate = totalAttempts > 0 ? snapshot.rejected_itrs / totalAttempts : 0;
  const remaining = snapshot.total_itrs - snapshot.completed_itrs;
  const velocity = model.slope > 0
    ? (model.slope * snapshot.total_itrs) / 100  // ITRs/día
    : 0;

  // ── Punch Cat A ──────────────────────────────────────────────────────────
  if (snapshot.punch_cat_a > 0) {
    const estimatedClearanceDays = snapshot.punch_cat_a * 3; // heurística: 3 días/punch
    drivers.push({
      factor: 'punch_cat_a_open',
      impact_days: estimatedClearanceDays,
      severity: snapshot.punch_cat_a > 5 ? 'critical' : snapshot.punch_cat_a > 2 ? 'high' : 'medium',
      description: `${snapshot.punch_cat_a} Punch Cat A abiertos bloquean certificación MC`,
      action: `Priorizar cierre de ${snapshot.punch_cat_a} punches Cat A. Estimado: ${estimatedClearanceDays} días hábiles`,
    });
  }

  // ── Rejection Rate ───────────────────────────────────────────────────────
  if (rejectionRate > 0.15 && remaining > 0) {
    const extraIterations = Math.ceil(remaining * rejectionRate * 1.5);
    const impactDays = velocity > 0 ? extraIterations / velocity : 10;
    drivers.push({
      factor: 'high_rejection_rate',
      impact_days: Math.round(impactDays),
      severity: rejectionRate > 0.30 ? 'high' : 'medium',
      description: `Tasa de rechazo del ${(rejectionRate * 100).toFixed(0)}% genera re-trabajo. ${snapshot.rejected_itrs} ITRs rechazados`,
      action: 'Revisar calidad de ejecución antes de submittal. Implementar checklist de QC previo',
    });
  }

  // ── Velocidad baja ────────────────────────────────────────────────────────
  if (predictedDays && predictedDays > plannedMCDay) {
    const gapDays = Math.round(predictedDays - plannedMCDay);
    const requiredVelocity = velocity > 0
      ? velocity * (predictedDays / plannedMCDay)
      : null;
    drivers.push({
      factor: 'velocity_insufficient',
      impact_days: gapDays,
      severity: gapDays > 30 ? 'critical' : gapDays > 14 ? 'high' : 'medium',
      description: `Velocidad actual (${velocity.toFixed(1)} ITRs/día) insuficiente para alcanzar MC en fecha`,
      action: requiredVelocity
        ? `Incrementar a ${requiredVelocity.toFixed(1)} ITRs/día o agregar recursos al equipo`
        : 'Revisar plan de recursos para el sprint final',
    });
  }

  // ── Subsistemas bloqueados ────────────────────────────────────────────────
  const pendingSubsystems = snapshot.subsystems_total - snapshot.subsystems_mc_achieved;
  if (pendingSubsystems > 0) {
    drivers.push({
      factor: 'subsystems_pending',
      impact_days: pendingSubsystems * 2,
      severity: pendingSubsystems > snapshot.subsystems_total * 0.5 ? 'high' : 'low',
      description: `${pendingSubsystems} subsistemas sin MC. Bloquean el MC del sistema padre`,
      action: `Completar subsistemas: verificar ITRs pendientes en cada subsistema`,
    });
  }

  // ── Sin actividad reciente ─────────────────────────────────────────────
  const recentEvents = events.filter((e) => {
    const age = (Date.now() - new Date(e.occurred_at).getTime()) / 86400000;
    return e.system_id === snapshot.system_id && age <= 7;
  });
  if (recentEvents.length === 0 && snapshot.completed_itrs < snapshot.total_itrs) {
    drivers.push({
      factor: 'no_recent_activity',
      impact_days: 7,
      severity: 'medium',
      description: 'Sin actividad de completions en los últimos 7 días calendario',
      action: 'Verificar disponibilidad del equipo. Posible bloqueo de permisos de acceso',
    });
  }

  return drivers.sort((a, b) => b.impact_days - a.impact_days);
}

// ─── Motor Principal ──────────────────────────────────────────────────────

export class PredictionEngine {
  private projectStartDate: Date;
  private workingDaysPerWeek: number;

  constructor(projectStartDate: string | Date, workingDaysPerWeek = 6) {
    this.projectStartDate = new Date(projectStartDate);
    this.workingDaysPerWeek = workingDaysPerWeek;
  }

  private toProjectDay(date: string | Date): number {
    return Math.floor(
      (new Date(date).getTime() - this.projectStartDate.getTime()) / 86400000
    );
  }

  private projectDayToDate(day: number): Date {
    return new Date(this.projectStartDate.getTime() + day * 86400000);
  }

  /**
   * Calcular velocidad actual (últimas N semanas)
   */
  private calculateVelocity(
    events: DomainEvent[],
    systemId: string,
    totalITRs: number,
    windowDays = 14
  ): number {
    const cutoff = Date.now() - windowDays * 86400000;
    const recentCompletions = events.filter(
      (e) =>
        e.system_id === systemId &&
        e.event_type === 'itr_completed' &&
        new Date(e.occurred_at).getTime() > cutoff
    ).length;
    return recentCompletions / windowDays; // ITRs por día
  }

  /**
   * Construir serie temporal de % completion para regresión
   */
  private buildTimeSeries(
    events: DomainEvent[],
    snapshot: SystemSnapshot
  ): DataPoint[] {
    if (events.length === 0) return [];

    const systemEvents = events
      .filter(
        (e) =>
          e.system_id === snapshot.system_id &&
          ['itr_completed', 'itr_rejected'].includes(e.event_type)
      )
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

    if (systemEvents.length === 0) return [];

    const points: DataPoint[] = [];
    let cumCompleted = 0;

    for (const event of systemEvents) {
      if (event.event_type === 'itr_completed') cumCompleted++;
      const day = this.toProjectDay(event.occurred_at);
      const pct = (cumCompleted / Math.max(snapshot.total_itrs, 1)) * 100;

      // Peso exponencial: eventos más recientes pesan el doble
      const ageRatio = (Date.now() - new Date(event.occurred_at).getTime()) / (30 * 86400000);
      const weight = Math.exp(-ageRatio * 0.5) + 0.5;

      points.push({ x: day, y: pct, weight });
    }

    return points;
  }

  /**
   * Predecir fecha de MC para un sistema
   */
  predict(snapshot: SystemSnapshot, events: DomainEvent[]): PredictionResult {
    const now = new Date();
    const currentDay = this.toProjectDay(now);
    const plannedMCDay = this.toProjectDay(snapshot.planned_mc_date);
    const plannedRFSUDay = this.toProjectDay(snapshot.planned_rfsu_date);

    const completionRate = snapshot.completed_itrs / Math.max(snapshot.total_itrs, 1);
    const velocity = this.calculateVelocity(events, snapshot.system_id, snapshot.total_itrs);

    // Construir serie temporal y ajustar regresión
    const timeSeries = this.buildTimeSeries(events, snapshot);
    const model = fitLinearRegression(timeSeries);

    // Predicción central (P50)
    let predictedMCDay = projectDayToComplete(model);

    // Fallback: si no hay suficientes datos, usar velocidad simple
    if (predictedMCDay === null || timeSeries.length < 3) {
      const remaining = snapshot.total_itrs - snapshot.completed_itrs;
      predictedMCDay = velocity > 0
        ? currentDay + remaining / velocity
        : plannedMCDay + 30; // sin datos → asumir 30 días de retraso
    }

    // Incertidumbre basada en residual std y confianza del modelo
    const uncertaintyDays = model.residual_std > 0
      ? (model.residual_std / Math.max(model.slope, 0.001)) * 1.5
      : 15;

    // Intervalo P10 / P50 / P90
    const p10Day = Math.round(predictedMCDay - uncertaintyDays);
    const p50Day = Math.round(predictedMCDay);
    const p90Day = Math.round(predictedMCDay + uncertaintyDays * 2);

    // RFSU = MC + delta histórico (estimado como 10% del schedule restante)
    const mcToRFSUScheduled = plannedRFSUDay - plannedMCDay;
    const predictedRFSUDay = p50Day + (mcToRFSUScheduled > 0 ? mcToRFSUScheduled : 14);

    // Delay
    const delayDaysP50 = p50Day - plannedMCDay;

    // Risk score
    const riskScore = calculateRiskScore(snapshot, events, currentDay, plannedMCDay);

    // Clasificación de riesgo
    let delayRisk: PredictionResult['delay_risk'];
    if (delayDaysP50 <= 0 && riskScore < 30) delayRisk = 'on_track';
    else if (delayDaysP50 <= 7 || riskScore < 50) delayRisk = 'at_risk';
    else if (delayDaysP50 <= 30 || riskScore < 75) delayRisk = 'delayed';
    else delayRisk = 'critical';

    // Drivers de retraso
    const delayDrivers = buildDelayDrivers(snapshot, events, model, predictedMCDay, plannedMCDay, currentDay);

    // Confianza del modelo
    const modelConfidence = Math.min(
      model.r_squared * (Math.min(timeSeries.length, 30) / 30),
      1
    );

    const lastEvent = events
      .filter((e) => e.system_id === snapshot.system_id)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];

    return {
      system_id: snapshot.system_id,
      system_tag: snapshot.system_tag,
      predicted_mc_p10: this.projectDayToDate(p10Day).toISOString(),
      predicted_mc_p50: this.projectDayToDate(p50Day).toISOString(),
      predicted_mc_p90: this.projectDayToDate(p90Day).toISOString(),
      predicted_rfsu_p50: this.projectDayToDate(predictedRFSUDay).toISOString(),
      planned_mc_date: snapshot.planned_mc_date,
      delay_days_p50: delayDaysP50,
      delay_risk: delayRisk,
      risk_score: riskScore,
      completion_rate: completionRate,
      velocity_rate: velocity,
      rejection_rate: snapshot.rejected_itrs / Math.max(snapshot.completed_itrs + snapshot.rejected_itrs, 1),
      delay_drivers: delayDrivers,
      model_confidence: modelConfidence,
      data_points: timeSeries.length,
      last_event_at: lastEvent?.occurred_at || snapshot.planned_mc_date,
      computed_at: now.toISOString(),
    };
  }

  /**
   * Predecir para múltiples sistemas (batch)
   */
  predictBatch(
    snapshots: SystemSnapshot[],
    events: DomainEvent[]
  ): PredictionResult[] {
    return snapshots.map((s) => this.predict(s, events));
  }

  /**
   * Calcular curva S: progreso acumulado real vs planificado
   */
  buildSCurve(
    events: DomainEvent[],
    systemId: string,
    totalITRs: number,
    plannedStartDate: string,
    plannedEndDate: string
  ): { date: string; actual_pct: number; planned_pct: number }[] {
    const systemEvents = events
      .filter((e) => e.system_id === systemId && e.event_type === 'itr_completed')
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

    const startMs = new Date(plannedStartDate).getTime();
    const endMs = new Date(plannedEndDate).getTime();
    const totalMs = endMs - startMs;

    // Generar puntos semanales
    const points: { date: string; actual_pct: number; planned_pct: number }[] = [];
    const step = 7 * 86400000; // semanal

    let completed = 0;
    let eventIdx = 0;

    for (let ms = startMs; ms <= Math.max(endMs, Date.now()); ms += step) {
      // Acumular eventos hasta este punto
      while (
        eventIdx < systemEvents.length &&
        new Date(systemEvents[eventIdx].occurred_at).getTime() <= ms
      ) {
        completed++;
        eventIdx++;
      }

      // Curva S planificada: distribución en S (logística simplificada)
      const t = Math.max(0, Math.min((ms - startMs) / totalMs, 1));
      // S-curve: aceleración media, lenta al inicio y al final
      const plannedPct = t <= 0 ? 0 : t >= 1 ? 100 : 100 / (1 + Math.exp(-10 * (t - 0.5)));

      points.push({
        date: new Date(ms).toISOString().substring(0, 10),
        actual_pct: Math.min((completed / totalITRs) * 100, 100),
        planned_pct: plannedPct,
      });

      if (ms > Date.now() && completed >= totalITRs) break;
    }

    return points;
  }
}

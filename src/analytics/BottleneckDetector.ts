/**
 * CommUP — Bottleneck Detector (Stage 15.2)
 *
 * Detecta cuellos de botella en la red de dependencias
 * system → subsystem → loops → tags → ITRs → certificates
 *
 * Algoritmo:
 * 1. Construir grafo de dependencias desde Supabase
 * 2. Calcular "blocking score" por nodo (cuántos downstream quedan bloqueados)
 * 3. Identificar el "blocker raíz" (primer nodo que desbloquea la cadena)
 * 4. Generar Top-10 con explicación accionable
 */

// ─── Tipos del grafo ──────────────────────────────────────────────────────

export type NodeType =
  | 'system'
  | 'subsystem'
  | 'loop'
  | 'tag'
  | 'itr'
  | 'punch'
  | 'certificate';

export type BlockerReason =
  | 'punch_cat_a_open'
  | 'itr_rejected'
  | 'itr_pending'
  | 'certificate_missing'
  | 'prerequisite_incomplete'
  | 'no_assigned_executor'
  | 'overdue'
  | 'dependency_blocked';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  tag?: string;
  discipline?: string;
  // Estado
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'rejected';
  completion_pct: number;       // 0-100
  planned_date?: string;
  actual_date?: string;
  assigned_to?: string;
  // Blocking info
  is_blocker: boolean;
  blocker_reasons: BlockerReason[];
  // Métricas de grafo
  downstream_count: number;     // cuántos nodos downstream existen
  blocked_downstream: number;   // cuántos están bloqueados por este nodo
  blocking_score: number;       // impacto ponderado
}

export interface GraphEdge {
  from_id: string;
  to_id: string;
  relation: 'contains' | 'depends_on' | 'prerequisite_of' | 'blocks';
  weight: number;               // criticality weight
}

export interface BottleneckResult {
  rank: number;
  node: GraphNode;
  root_blocker: GraphNode | null;   // el nodo raíz que resuelve todo
  chain: string[];                   // cadena de bloqueo
  total_blocked: number;             // sistemas/ITRs bloqueados downstream
  estimated_unblock_days: number;    // días para desbloquear (si se actúa hoy)
  priority_actions: PriorityAction[];
  impact_description: string;
}

export interface PriorityAction {
  action_type: 'clear_punch' | 'reassign_executor' | 'resubmit_itr' | 'escalate' | 'schedule_inspection';
  entity_id: string;
  entity_type: NodeType;
  label: string;
  url: string;
  urgency: 'immediate' | 'today' | 'this_week';
}

export interface BlockerSummary {
  top_bottlenecks: BottleneckResult[];
  total_systems_at_risk: number;
  total_punch_cat_a: number;
  total_pending_certificates: number;
  most_common_blocker: BlockerReason;
  network_health_score: number;   // 0-100 (100 = sin bloqueos)
  computed_at: string;
}

// ─── Raw DB types (lo que viene de Supabase) ─────────────────────────────

export interface RawSystemData {
  id: string;
  system_tag: string;
  description: string;
  discipline: string;
  mc_status: string;
  mc_completion_pct: number;
  punch_cat_a_open: number;
  punch_cat_b_open: number;
  itrs_pending: number;
  itrs_rejected: number;
  itrs_completed: number;
  certificates_pending: number;
  planned_mc_date: string;
  parent_system_id?: string;
  dependencies?: string[];    // IDs de sistemas que deben completarse antes
}

export interface RawPunchData {
  id: string;
  system_id: string;
  subsystem_id?: string;
  category: 'A' | 'B' | 'C';
  status: 'open' | 'in_progress' | 'cleared';
  description: string;
  raised_at: string;
  cleared_at?: string;
  assigned_to?: string;
  estimated_clear_days?: number;
}

export interface RawITRData {
  id: string;
  itr_number: string;
  system_id: string;
  subsystem_id?: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
  discipline: string;
  assigned_to?: string;
  submitted_at?: string;
  rejection_count: number;
  planned_date: string;
}

// ─── Motor del Grafo ──────────────────────────────────────────────────────

export class BottleneckDetector {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private adjacency: Map<string, Set<string>> = new Map(); // outgoing edges

  constructor(
    systems: RawSystemData[],
    punches: RawPunchData[],
    itrs: RawITRData[]
  ) {
    this.buildGraph(systems, punches, itrs);
    this.computeBlockingScores();
  }

  private buildGraph(
    systems: RawSystemData[],
    punches: RawPunchData[],
    itrs: RawITRData[]
  ): void {
    // ── Agregar nodos de sistemas ─────────────────────────────────────────
    for (const sys of systems) {
      const blockerReasons: BlockerReason[] = [];

      if (sys.punch_cat_a_open > 0) blockerReasons.push('punch_cat_a_open');
      if (sys.itrs_rejected > 0) blockerReasons.push('itr_rejected');
      if (sys.itrs_pending > 0) blockerReasons.push('itr_pending');
      if (sys.certificates_pending > 0) blockerReasons.push('certificate_missing');
      if (sys.planned_mc_date && new Date(sys.planned_mc_date) < new Date() && sys.mc_status !== 'achieved') {
        blockerReasons.push('overdue');
      }

      const node: GraphNode = {
        id: sys.id,
        type: sys.parent_system_id ? 'subsystem' : 'system',
        label: sys.description || sys.system_tag,
        tag: sys.system_tag,
        discipline: sys.discipline,
        status: sys.mc_status === 'achieved'
          ? 'completed'
          : sys.punch_cat_a_open > 0 || blockerReasons.length > 0
          ? 'blocked'
          : sys.mc_completion_pct > 0
          ? 'in_progress'
          : 'pending',
        completion_pct: sys.mc_completion_pct,
        planned_date: sys.planned_mc_date,
        is_blocker: blockerReasons.length > 0,
        blocker_reasons: blockerReasons,
        downstream_count: 0,
        blocked_downstream: 0,
        blocking_score: 0,
      };

      this.nodes.set(sys.id, node);
      this.adjacency.set(sys.id, new Set());

      // Edges de jerarquía
      if (sys.parent_system_id && this.nodes.has(sys.parent_system_id)) {
        this.addEdge(sys.id, sys.parent_system_id, 'prerequisite_of', 1.0);
      }

      // Edges de dependencias entre sistemas
      for (const depId of sys.dependencies ?? []) {
        this.addEdge(sys.id, depId, 'depends_on', 0.8);
      }
    }

    // ── Nodos de punches ──────────────────────────────────────────────────
    for (const punch of punches.filter((p) => p.status !== 'cleared')) {
      const punchNode: GraphNode = {
        id: punch.id,
        type: 'punch',
        label: `Punch Cat ${punch.category}: ${punch.description.substring(0, 60)}`,
        status: punch.status === 'in_progress' ? 'in_progress' : 'blocked',
        completion_pct: 0,
        assigned_to: punch.assigned_to,
        is_blocker: punch.category === 'A',
        blocker_reasons: punch.category === 'A' ? ['punch_cat_a_open'] : [],
        downstream_count: 0,
        blocked_downstream: 0,
        blocking_score: punch.category === 'A' ? 100 : punch.category === 'B' ? 50 : 10,
      };
      this.nodes.set(punch.id, punchNode);
      this.adjacency.set(punch.id, new Set());

      // Punch bloquea a su sistema
      if (punch.category === 'A') {
        this.addEdge(punch.id, punch.system_id, 'blocks', 1.0);
      }
    }

    // ── Nodos de ITRs rechazados/pendientes críticos ──────────────────────
    const criticalITRs = itrs.filter(
      (i) => i.status === 'rejected' || (i.status === 'pending' && !i.assigned_to)
    );
    for (const itr of criticalITRs) {
      const itrNode: GraphNode = {
        id: itr.id,
        type: 'itr',
        label: itr.itr_number,
        discipline: itr.discipline,
        status: itr.status === 'rejected' ? 'rejected' : 'pending',
        completion_pct: 0,
        assigned_to: itr.assigned_to,
        planned_date: itr.planned_date,
        is_blocker: true,
        blocker_reasons: [
          itr.status === 'rejected' ? 'itr_rejected' : 'no_assigned_executor',
        ],
        downstream_count: 0,
        blocked_downstream: 0,
        blocking_score: itr.rejection_count > 2 ? 70 : 40,
      };
      this.nodes.set(itr.id, itrNode);
      this.adjacency.set(itr.id, new Set());
      this.addEdge(itr.id, itr.system_id, 'blocks', 0.7);
    }
  }

  private addEdge(from: string, to: string, relation: GraphEdge['relation'], weight: number): void {
    if (!this.nodes.has(to)) return;
    this.edges.push({ from_id: from, to_id: to, relation, weight });
    this.adjacency.get(from)?.add(to);
  }

  /**
   * DFS para encontrar todos los nodos downstream
   */
  private getDownstream(nodeId: string, visited = new Set<string>()): Set<string> {
    if (visited.has(nodeId)) return visited;
    visited.add(nodeId);
    const neighbors = this.adjacency.get(nodeId) ?? new Set();
    for (const neighbor of neighbors) {
      this.getDownstream(neighbor, visited);
    }
    return visited;
  }

  /**
   * Calcular blocking scores para todos los nodos
   */
  private computeBlockingScores(): void {
    for (const [nodeId, node] of this.nodes) {
      if (!node.is_blocker) continue;

      const downstream = this.getDownstream(nodeId);
      downstream.delete(nodeId);

      let blockedCount = 0;
      let weightedScore = 0;

      for (const downId of downstream) {
        const downNode = this.nodes.get(downId);
        if (downNode && downNode.status !== 'completed') {
          blockedCount++;
          // Peso por tipo: sistema > subsistema > ITR
          const typeWeight = downNode.type === 'system' ? 3
            : downNode.type === 'subsystem' ? 2
            : 1;
          // Peso por proximidad a fecha planificada
          const daysOverdue = downNode.planned_date
            ? Math.max(0, (Date.now() - new Date(downNode.planned_date).getTime()) / 86400000)
            : 0;
          const urgencyWeight = 1 + Math.min(daysOverdue / 30, 2);

          weightedScore += typeWeight * urgencyWeight;
        }
      }

      node.downstream_count = downstream.size;
      node.blocked_downstream = blockedCount;
      node.blocking_score = Math.min(Math.round(node.blocking_score * 0.3 + weightedScore * 10), 100);
    }
  }

  /**
   * Encontrar el blocker raíz en la cadena
   */
  private findRootBlocker(nodeId: string): GraphNode | null {
    // BFS inverso: encontrar el blocker "más aguas arriba"
    const incomingBlockers: string[] = [];

    for (const edge of this.edges) {
      if (edge.to_id === nodeId && edge.relation === 'blocks') {
        const fromNode = this.nodes.get(edge.from_id);
        if (fromNode?.is_blocker) incomingBlockers.push(edge.from_id);
      }
    }

    if (incomingBlockers.length === 0) return null;

    // Retornar el de mayor blocking score
    return incomingBlockers
      .map((id) => this.nodes.get(id)!)
      .sort((a, b) => b.blocking_score - a.blocking_score)[0] || null;
  }

  /**
   * Generar acciones prioritarias para un bloqueador
   */
  private buildPriorityActions(node: GraphNode): PriorityAction[] {
    const actions: PriorityAction[] = [];

    for (const reason of node.blocker_reasons) {
      switch (reason) {
        case 'punch_cat_a_open':
          actions.push({
            action_type: 'clear_punch',
            entity_id: node.id,
            entity_type: node.type,
            label: `Cerrar Punch Cat A en ${node.tag ?? node.label}`,
            url: `/punches?system=${node.id}&category=A`,
            urgency: 'immediate',
          });
          break;
        case 'itr_rejected':
          actions.push({
            action_type: 'resubmit_itr',
            entity_id: node.id,
            entity_type: node.type,
            label: `Re-submitir ITR rechazado: ${node.label}`,
            url: `/itrs/${node.id}`,
            urgency: 'today',
          });
          break;
        case 'no_assigned_executor':
          actions.push({
            action_type: 'reassign_executor',
            entity_id: node.id,
            entity_type: node.type,
            label: `Asignar ejecutor a: ${node.label}`,
            url: `/itrs/${node.id}/assign`,
            urgency: 'today',
          });
          break;
        case 'certificate_missing':
          actions.push({
            action_type: 'schedule_inspection',
            entity_id: node.id,
            entity_type: node.type,
            label: `Iniciar proceso de certificación para ${node.tag}`,
            url: `/certificates/new?system=${node.id}`,
            urgency: 'this_week',
          });
          break;
        case 'overdue':
          actions.push({
            action_type: 'escalate',
            entity_id: node.id,
            entity_type: node.type,
            label: `Escalar ${node.tag}: fecha MC vencida`,
            url: `/systems/${node.id}/escalate`,
            urgency: 'immediate',
          });
          break;
      }
    }

    return actions;
  }

  private buildImpactDescription(result: Omit<BottleneckResult, 'impact_description'>): string {
    const node = result.node;
    const blocked = result.total_blocked;
    const reasons = node.blocker_reasons;

    const parts: string[] = [];

    if (reasons.includes('punch_cat_a_open')) {
      parts.push(`Punch Cat A abierto en ${node.tag}`);
    }
    if (reasons.includes('itr_rejected')) {
      parts.push('ITRs rechazados pendientes de corrección');
    }
    if (reasons.includes('overdue')) {
      const days = node.planned_date
        ? Math.round((Date.now() - new Date(node.planned_date).getTime()) / 86400000)
        : 0;
      parts.push(`MC retrasado ${days} días calendario`);
    }

    return `${parts.join(', ')} — bloquea ${blocked} ${blocked === 1 ? 'elemento' : 'elementos'} downstream`;
  }

  /**
   * Obtener Top-N cuellos de botella
   */
  getTopBottlenecks(topN = 10): BlockerSummary {
    const blockers = Array.from(this.nodes.values())
      .filter((n) => n.is_blocker && n.status !== 'completed')
      .sort((a, b) => b.blocking_score - a.blocking_score)
      .slice(0, topN);

    const topBottlenecks: BottleneckResult[] = blockers.map((node, i) => {
      const downstream = this.getDownstream(node.id);
      downstream.delete(node.id);

      const chain = [node.id, ...Array.from(downstream)].slice(0, 5);
      const rootBlocker = this.findRootBlocker(node.id);
      const estimatedDays = node.blocker_reasons.includes('punch_cat_a_open') ? 3
        : node.blocker_reasons.includes('itr_rejected') ? 2
        : node.blocker_reasons.includes('certificate_missing') ? 7
        : 5;

      const partial: Omit<BottleneckResult, 'impact_description'> = {
        rank: i + 1,
        node,
        root_blocker: rootBlocker,
        chain,
        total_blocked: downstream.size,
        estimated_unblock_days: estimatedDays,
        priority_actions: this.buildPriorityActions(node),
      };

      return {
        ...partial,
        impact_description: this.buildImpactDescription(partial),
      };
    });

    // Estadísticas globales
    const allNodes = Array.from(this.nodes.values());
    const systemNodes = allNodes.filter((n) => n.type === 'system');

    const reasonCounts: Record<string, number> = {};
    for (const node of allNodes.filter((n) => n.is_blocker)) {
      for (const reason of node.blocker_reasons) {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      }
    }
    const mostCommonBlocker = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] as BlockerReason || 'itr_pending';

    const completedSystems = systemNodes.filter((n) => n.status === 'completed').length;
    const networkHealthScore = systemNodes.length > 0
      ? Math.round(
          (completedSystems / systemNodes.length) * 50 +
          (1 - Math.min(topBottlenecks.length / 20, 1)) * 50
        )
      : 100;

    return {
      top_bottlenecks: topBottlenecks,
      total_systems_at_risk: systemNodes.filter((n) => n.status === 'blocked' || n.status === 'in_progress').length,
      total_punch_cat_a: allNodes.filter((n) => n.type === 'punch' && n.blocker_reasons.includes('punch_cat_a_open')).length,
      total_pending_certificates: allNodes.filter((n) => n.blocker_reasons.includes('certificate_missing')).length,
      most_common_blocker: mostCommonBlocker,
      network_health_score: networkHealthScore,
      computed_at: new Date().toISOString(),
    };
  }
}

/**
 * Agentic Ops: the rules `placeMachine` has to enforce.
 *
 * Split out from `agents.ts` for one reason: the behaviour in that file places
 * and wires nodes, so it imports `factory.ts` — and `factory.ts` needs these
 * predicates to gate a placement. Keeping them here means neither file has to
 * import the other in a circle.
 */
import { BALANCE, BUILDING_BY_ID, type AgentRole } from '../data';
import type { GameState, Machine } from './types';

export const agentRoleOf = (m: Machine): AgentRole | undefined =>
  BUILDING_BY_ID[m.buildingId]?.agentRole;

export const isAgent = (m: Machine): boolean =>
  BUILDING_BY_ID[m.buildingId]?.kind === 'agent';

/** Is there a Console on the canvas for the agents to report to? */
export function hasConsole(state: GameState): boolean {
  return Object.values(state.machines).some(
    (m) => agentRoleOf(m) === 'console' && m.enabled && !m.broken,
  );
}

/**
 * How many agents may run at once.
 *
 * Agents compound — marketing feeds sales feeds coding — so this is the addon's
 * main brake on "place twenty and alt-tab". It grows with progress, the same
 * shape as the bank's draw cap in the Venture Capital addon.
 */
export function agentHeadcount(state: GameState): number {
  return (
    BALANCE.agentHeadcountBase +
    Math.floor(state.completedMilestones.length / BALANCE.agentHeadcountPerMilestones)
  );
}

/** Agents placed. The Console is excluded: it is the manager, not the headcount. */
export function agentsPlaced(state: GameState): number {
  let n = 0;
  for (const m of Object.values(state.machines)) {
    if (isAgent(m) && agentRoleOf(m) !== 'console') n += 1;
  }
  return n;
}

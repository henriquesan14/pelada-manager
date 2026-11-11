import { saoPauloToday } from './dates';
export interface User { id: string; name: string; nick: string; role: 'owner' | 'organizer'; }
export interface PlayerSuspension {startedAt:string;until?:string|null;rentalCount?:number|null;}
export interface Player { isInactive?: boolean; rentalsResetAt?: string | null; suspension?:PlayerSuspension|null; id: string; name: string; level: number; position?: string | null; initialRentals?: number; }
export const PLAYER_POSITIONS = ['Goleiro','Zagueiro','Lateral','Volante','Meia','Ponta','Atacante','Fixo','Ala','Pivô'] as const;
export function isGoalkeeper(player: Player): boolean { return /\(GL\)$/i.test(player.name.trim()) || player.position === 'Goleiro'; }
export interface Team { id: string; name: string; players: string[]; strength: number; }
export interface DrawOption { id: string; number: number; teams: Team[]; }
export interface Match { id: string; date: string; a: string[]; b: string[]; nameA: string; nameB: string; scoreA: number; scoreB: number; createdBy?: string; createdByName?: string; rentalId?: string | null; teamAId?: string | null; teamBId?: string | null; }
export interface Rental { isManual?: boolean; isHistorical?: boolean; participantsText?: string | null; sourcePhotoUrl?: string | null; importSourceId?: string | null; id: string; name: string; createdAt: string; playedOn?: string | null; location?: string | null; teams: Team[]; finishedAt?: string | null; cancelledAt?: string | null; winnerTeamId?: string | null; winningGoalkeeperId?: string | null; photoId?: string | null; }
export interface MonthlyFeeCharge { isExempt?: boolean; importedPaid?: boolean; importSourceCell?: string | null; importedAt?: string | null; playerId: string; playerName: string; paidAt?: string | null; recordedBy?: string | null; recordedByName?: string | null; }
export function isMonthlyFeePaid(charge: MonthlyFeeCharge): boolean { return !!charge.paidAt || !!charge.importedPaid; }
export interface MonthlyFeeMonth { month: string; amount: number; charges: MonthlyFeeCharge[]; }
export interface CashIncome {id:string;date:string;amount:number;description:string;}
export interface CashExpense { id:string; date:string; amount:number; description:string; importSourceCell?:string|null; }
export interface PeladaState { incomes?:CashIncome[]; expenses?:CashExpense[]; monthlyFees?: MonthlyFeeMonth[]; drawOptions?: DrawOption[]; selectedDrawOptionId?: string | null; players: Player[]; teams: Team[]; matches: Match[]; rentals: Rental[]; }
export interface Snapshot { revision: number; state: PeladaState; }
export interface Session { user: User | null; needsSetup: boolean; setupEnabled: boolean; }
export interface Organizer extends User { active: boolean; }
export interface Activity { id: number; action: string; date: string; name: string; }
export interface Invitation { invite: string; expires: string; maxUses?: number; }
export interface RankingRow extends Player { rentals: number; titles: number; points: number; }

export type Page = 'inicio' | 'jogadores' | 'sorteio' | 'partidas' | 'ranking' | 'organizadores' | 'regras' | 'mensalidades' | 'financeiro';
export const emptyState = (): PeladaState => ({ players: [], teams: [], matches: [], rentals: [] });

export function ranking(players: Player[], rentals: Rental[]): RankingRow[] {
  return players.map(player => {
    const resetAt = player.rentalsResetAt ? Date.parse(player.rentalsResetAt) : null;
    const initialRentals = resetAt === null ? (player.initialRentals ?? 0) : 0;
    const row: RankingRow = { ...player, rentals: 0, titles: initialRentals, points: initialRentals };
    for (const rental of rentals) {
      if (rental.isHistorical || rental.cancelledAt || !rental.finishedAt || !(rental.teams.some(team => team.players.includes(player.id)) || (rental.winnerTeamId && rental.winningGoalkeeperId === player.id))) continue;
      row.rentals++;
      if ((resetAt === null || Date.parse(rental.createdAt) >= resetAt) && rental.winnerTeamId && (rental.winningGoalkeeperId === player.id || rental.teams.some(team => team.id === rental.winnerTeamId && team.players.includes(player.id)))) {
        row.titles++; row.points += 1;
      }
    }
    return row;
  }).sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name, 'pt-BR'));
}


export function remainingSuspensionRentals(player:Player,rentals:Rental[]):number {
  const suspension=player.suspension;
  return suspension?.rentalCount ? Math.max(0,suspension.rentalCount-rentals.filter(r=>!r.isHistorical&&!r.isManual&&!r.cancelledAt&&Date.parse(r.createdAt)>=Date.parse(suspension.startedAt)).length):0;
}
export function isPlayerSuspended(player:Player,rentals:Rental[],today=saoPauloToday()):boolean {
  return player.suspension?.until ? today<=player.suspension.until : remainingSuspensionRentals(player,rentals)>0;
}

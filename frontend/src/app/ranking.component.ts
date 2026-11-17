import { Component, computed, input, signal } from '@angular/core';
import { RankingRow, Rental } from './models';

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}|\p{Cf}/gu, '').trim().toLocaleLowerCase('pt-BR')
    .replace(/\s*\(gl\)$/i, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
}

const historicalAliases: Record<string, string[]> = {
  'cesar': ['cesar chapa', 'cesar maconha'],
  'cesar honda': ['cesarhonda'],
  'henrique san': ['san'],
  'junior': ['jr']
};

@Component({
  selector: 'app-ranking',
  styles: ['.ranking-rating { display: inline-block; margin-inline-start: .5rem; color: #805800; font-size: .85em; white-space: nowrap; }'],
  template: `
  @if(rows().length) { <div class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th>ALUGUÉIS CONQUISTADOS</th>@if (rentals()) {<th>AÇÃO</th>}</tr></thead><tbody>@for(row of rows(); track row.id; let i = $index) {<tr><td><span class="position" [attr.aria-label]="i < 3 ? (i + 1) + 'º lugar' : null">{{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}}</span></td><td><span class="player-avatar">{{row.name.slice(0, 1)}}</span><strong>{{row.name}}</strong>@if(row.level > 0) {<span class="ranking-rating" role="img" [attr.aria-label]="formatLevel(row.level) + ' de 5 estrelas'">{{formatLevel(row.level)}} ★</span>}</td><td><b class="points">{{row.titles}}</b></td>
    @if (rentals()) {
      <td><button type="button" class="text-button" [attr.aria-expanded]="selectedPlayerId() === row.id"
        [attr.aria-label]="'Estatísticas de ' + row.name" (click)="toggleStats(row.id)">Estatísticas</button></td>
    }
    </tr>
    @if (selectedPlayerId() === row.id && stats(); as details) {
      <tr><td class="ranking-stat-details" colspan="4">
        <dl>
          <dt>Presenças</dt><dd>{{details.presences}}</dd>
          <dt>Vitórias</dt><dd>{{details.wins}}</dd>
          <dt>Aproveitamento</dt><dd>{{details.presences ? percent.format(details.wins / details.presences) + ' (' + details.wins + '/' + details.presences + ')' : '—'}}</dd>
        </dl>
        <p>Presenças incluem as listas antigas. O aproveitamento divide o total de aluguéis conquistados pelas presenças encontradas.</p>
        @if (details.wins > details.presences) {
          <p>O ranking tem mais vitórias do que presenças nas listas disponíveis.</p>
        }
      </td></tr>
    }}</tbody></table></div> } @else {<div class="empty"><div>⚽</div><h3>O topo está esperando por você</h3><p>Cada jogador do time vencedor conquista 1 aluguel. Sem vencedor, ninguém conquista aluguel.</p></div>}`
})
export class RankingComponent {
  readonly rows = input.required<RankingRow[]>();
  readonly rentals = input<Rental[]>();
  readonly selectedPlayerId = signal<string | null>(null);

  toggleStats(id: string): void {
    this.selectedPlayerId.update(selected => selected === id ? null : id);
  }
  readonly percent = new Intl.NumberFormat('pt-BR', {style: 'percent', maximumFractionDigits: 1});
  readonly stats = computed(() => {
    const player = this.rows().find(row => row.id === this.selectedPlayerId());
    if (!player) return null;
    const finished = (this.rentals() ?? []).filter(rental => rental.finishedAt && !rental.cancelledAt);
    const historical = finished.filter(rental => rental.isHistorical).map(rental =>
      new Set((rental.participantsText ?? '').split(/\r?\n/).map(line =>
        normalizeName(line.replace(/^(?:[\s\u2060]*\d+[.\-º):]?\s*)+/, '')))));
    const recorded = finished.filter(rental => !rental.isHistorical && !rental.isManual && rental.teams.length);
    const name = normalizeName(player.name);
    const aliases = [name, ...(historicalAliases[name] ?? [])];
    const oldPresences = historical.filter(names => aliases.some(alias => names.has(alias))).length;
    const appearances = recorded.filter(rental => rental.winningGoalkeeperId === player.id ||
      rental.teams.some(team => team.players.includes(player.id)));
    return {presences: oldPresences + appearances.length, wins: player.titles};
  });
  private readonly stars = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  formatLevel(level: number): string {
    return this.stars.format(level);
  }
}

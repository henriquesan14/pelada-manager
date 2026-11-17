import { Component, computed, input } from '@angular/core';
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
  @if (showStats()) {
    <p>Presenças incluem as listas antigas. Vitórias e aproveitamento consideram peladas encerradas com times registrados. O aproveitamento divide essas vitórias pelas presenças nessas peladas.</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Jogador</th><th>Presenças</th><th>Vitórias</th><th>Aproveitamento</th></tr></thead>
        <tbody>
          @for (row of stats(); track row.id) {
            <tr><td>{{row.name}}</td><td>{{row.presences}}</td><td>{{row.wins}}</td>
              <td>{{row.played ? percent.format(row.wins / row.played) + ' (' + row.wins + '/' + row.played + ')' : '—'}}</td></tr>
          }
        </tbody>
      </table>
    </div>
  } @else if(rows().length) { <div class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th>ALUGUÉIS CONQUISTADOS</th></tr></thead><tbody>@for(row of rows(); track row.id; let i = $index) {<tr><td><span class="position" [attr.aria-label]="i < 3 ? (i + 1) + 'º lugar' : null">{{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}}</span></td><td><span class="player-avatar">{{row.name.slice(0, 1)}}</span><strong>{{row.name}}</strong>@if(row.level > 0) {<span class="ranking-rating" role="img" [attr.aria-label]="formatLevel(row.level) + ' de 5 estrelas'">{{formatLevel(row.level)}} ★</span>}</td><td><b class="points">{{row.titles}}</b></td></tr>}</tbody></table></div> } @else {<div class="empty"><div>⚽</div><h3>O topo está esperando por você</h3><p>Cada jogador do time vencedor conquista 1 aluguel. Sem vencedor, ninguém conquista aluguel.</p></div>}`
})
export class RankingComponent {
  readonly rows = input.required<RankingRow[]>();
  readonly rentals = input<Rental[]>();
  readonly showStats = input(false);
  readonly percent = new Intl.NumberFormat('pt-BR', {style: 'percent', maximumFractionDigits: 1});
  readonly stats = computed(() => {
    const finished = (this.rentals() ?? []).filter(rental => rental.finishedAt && !rental.cancelledAt);
    const historical = finished.filter(rental => rental.isHistorical).map(rental =>
      new Set((rental.participantsText ?? '').split(/\r?\n/).map(line =>
        normalizeName(line.replace(/^(?:[\s\u2060]*\d+[.\-º):]?\s*)+/, '')))));
    const recorded = finished.filter(rental => !rental.isHistorical && !rental.isManual && rental.teams.length);
    return this.rows().map(player => {
      const name = normalizeName(player.name);
      const aliases = [name, ...(historicalAliases[name] ?? [])];
      const oldPresences = historical.filter(names => aliases.some(alias => names.has(alias))).length;
      const appearances = recorded.filter(rental => rental.winningGoalkeeperId === player.id ||
        rental.teams.some(team => team.players.includes(player.id)));
      const wins = appearances.filter(rental => rental.winnerTeamId &&
        (rental.winningGoalkeeperId === player.id ||
          rental.teams.some(team => team.id === rental.winnerTeamId && team.players.includes(player.id)))).length;
      return {id: player.id, name: player.name, presences: oldPresences + appearances.length, played: appearances.length, wins};
    });
  });
  private readonly stars = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  formatLevel(level: number): string {
    return this.stars.format(level);
  }
}

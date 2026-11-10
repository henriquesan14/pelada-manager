import { Component, input } from '@angular/core';
import { RankingRow } from './models';

@Component({
  selector: 'app-ranking',
  styles: ['.ranking-rating { display: inline-block; margin-inline-start: .5rem; color: #805800; font-size: .85em; white-space: nowrap; }'],
  template: `@if(rows().length) { <div class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th>ALUGUÉIS CONQUISTADOS</th></tr></thead><tbody>@for(row of rows(); track row.id; let i = $index) {<tr><td><span class="position" [attr.aria-label]="i < 3 ? (i + 1) + 'º lugar' : null">{{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}}</span></td><td><span class="player-avatar">{{row.name.slice(0, 1)}}</span><strong>{{row.name}}</strong>@if(row.level > 0) {<span class="ranking-rating" role="img" [attr.aria-label]="formatLevel(row.level) + ' de 5 estrelas'">{{formatLevel(row.level)}} ★</span>}</td><td><b class="points">{{row.titles}}</b></td></tr>}</tbody></table></div> } @else {<div class="empty"><div>⚽</div><h3>O topo está esperando por você</h3><p>Cada jogador do time vencedor conquista 1 aluguel. Sem vencedor, ninguém conquista aluguel.</p></div>}`
})
export class RankingComponent {
  readonly rows = input.required<RankingRow[]>();
  private readonly stars = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  formatLevel(level: number): string {
    return this.stars.format(level);
  }
}

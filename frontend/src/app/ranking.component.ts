import { Component, input } from '@angular/core';
import { RankingRow } from './models';

@Component({
  selector: 'app-ranking',
  template: `@if(rows().length) { <div class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th>ALUGUÉIS CONQUISTADOS</th></tr></thead><tbody>@for(row of rows(); track row.id; let i = $index) {<tr><td><span class="position" [attr.aria-label]="i < 3 ? (i + 1) + 'º lugar' : null">{{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}}</span></td><td><span class="player-avatar">{{row.name.slice(0, 1)}}</span><strong>{{row.name}}</strong></td><td><b class="points">{{row.titles}}</b></td></tr>}</tbody></table></div> } @else {<div class="empty"><div>⚽</div><h3>O topo está esperando por você</h3><p>Cada jogador do time vencedor conquista 1 aluguel. Sem vencedor, ninguém conquista aluguel.</p></div>}`
})
export class RankingComponent { readonly rows = input.required<RankingRow[]>(); }

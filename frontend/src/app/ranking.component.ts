import { Component, computed, effect, ElementRef, input, signal, viewChild } from '@angular/core';
import { RankingRow, Rental } from './models';

import { playerStatistics } from './player-statistics';

@Component({
  selector: 'app-ranking',
  styles: ['.ranking-rating { display: inline-block; margin-inline-start: .5rem; color: #805800; font-size: .85em; white-space: nowrap; }'],
  template: `
  @if(rows().length) { <div class="table-scroll"><table class="ranking-table"><thead><tr><th>POS.</th><th>JOGADOR</th><th class="ranking-rentals" aria-label="Aluguéis conquistados">ALUGUÉIS</th>@if (rentals()) {<th>AÇÃO</th>}</tr></thead><tbody>@for(row of rows(); track row.id; let i = $index) {<tr><td><span class="position" [attr.aria-label]="i < 3 ? (i + 1) + 'º lugar' : null">{{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}}</span></td><td><div class="ranking-player"><span class="player-avatar">{{row.name.slice(0, 1)}}</span><strong>{{row.name}}</strong>@if(row.level > 0) {<span class="ranking-rating" role="img" [attr.aria-label]="formatLevel(row.level) + ' de 5 estrelas'">{{formatLevel(row.level)}} ★</span>}</div></td><td class="ranking-rentals"><b class="points">{{row.titles}}</b></td>
    @if (rentals()) {
      <td><button type="button" class="text-button" aria-haspopup="dialog"
        [attr.aria-label]="'Estatísticas de ' + row.name" (click)="selectedPlayerId.set(row.id)">Estatísticas</button></td>
    }
    </tr>
}</tbody></table></div> } @else {<div class="empty"><div>⚽</div><h3>O topo está esperando por você</h3><p>Cada jogador do time vencedor conquista 1 aluguel. Sem vencedor, ninguém conquista aluguel.</p></div>}
    @if (stats(); as details) {
      <dialog #statsDialog class="registration-dialog" aria-labelledby="ranking-stats-title"
        (close)="selectedPlayerId.set(null)">
        <div class="section-heading">
          <h2 id="ranking-stats-title">Estatísticas de {{details.name}}</h2>
          <button type="button" class="text-button" (click)="statsDialog.close()" autofocus>Fechar</button>
        </div>
        <dl>
          <dt>Presenças</dt><dd>{{details.presences}}</dd>
          <dt>Vitórias</dt><dd>{{details.wins}}</dd>
          <dt>Aproveitamento</dt><dd>{{details.presences ? percent.format(details.wins / details.presences) + ' (' + details.wins + '/' + details.presences + ')' : '—'}}</dd>
        </dl>
        <p>Presenças incluem as listas antigas. O aproveitamento divide o total de aluguéis conquistados pelas presenças encontradas.</p>
        @if (details.wins > details.presences) {
          <p>O ranking tem mais vitórias do que presenças nas listas disponíveis.</p>
        }
      </dialog>
    }`
})
export class RankingComponent {
  readonly rows = input.required<RankingRow[]>();
  readonly rentals = input<Rental[]>();
  readonly selectedPlayerId = signal<string | null>(null);

  private readonly statsDialog = viewChild<ElementRef<HTMLDialogElement>>('statsDialog');

  constructor() {
    effect(onCleanup => {
      const dialog = this.statsDialog()?.nativeElement;
      if (!dialog) return;
      const previousOverflow = document.body.style.overflow;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        if (dialog.open) dialog.close();
        document.body.style.overflow = previousOverflow;
      });
    });
  }

  readonly percent = new Intl.NumberFormat('pt-BR', {style: 'percent', maximumFractionDigits: 1});
  readonly stats = computed(() => {
    const player = this.rows().find(row => row.id === this.selectedPlayerId());
    if (!player) return null;
    return playerStatistics([player], this.rentals() ?? [])[0];
  });
  private readonly stars = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  formatLevel(level: number): string {
    return this.stars.format(level);
  }
}

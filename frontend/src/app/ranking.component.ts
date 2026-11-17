import { Component, computed, effect, ElementRef, input, signal, viewChild } from '@angular/core';
import { RankingRow, Rental } from './models';

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}|\p{Cf}/gu, '').trim().toLocaleLowerCase('pt-BR')
    .replace(/\s*\(gl\)$/i, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
}

const historicalNames: Readonly<Record<string, string>> = {
  aldanemia: 'aldemir',
  artur: 'arthur',
  cabeca: 'italo',
  cesar: 'cesar chapa',
  'cesar maconha': 'cesar chapa',
  cesarhonda: 'cesar honda',
  'dan psicopata': 'dan',
  'diogo a volta da lenda': 'diogo',
  edson: 'negao',
  'eduardo dias': 'eduardo',
  everton: 'everton kaio',
  ganso: 'junior',
  jr: 'junior',
  henrique: 'henrique san',
  san: 'henrique san',
  rico: 'henrique san',
  'lucas 9d': 'lucas',
  'lucas nine': 'lucas',
  mateu: 'mateus pereira',
  mateus: 'mateus pereira',
  'mateus p': 'mateus pereira',
  'dinizismo voltou': 'mateus neneca',
  neneca: 'mateus neneca',
  'matheus rei delas': 'mateus neneca',
  'matheus r': 'matheus romao',
  'meteus vet': 'matheus vet',
  matheus: 'matheus vet',
  nadinho: 'ednaldo',
  net: 'neto',
  tarcinho: 'tarcio',
  tarcin: 'tarcio',
  'tarcio gl': 'tarcio',
  vetto: 'veto',
  viga: 'everton viga',
  wm: 'waguinho'
};

function historicalName(value: string): string {
  const name = normalizeName(value);
  return Object.hasOwn(historicalNames, name) ? historicalNames[name] : name;
}

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
    const finished = (this.rentals() ?? []).filter(rental => rental.finishedAt && !rental.cancelledAt);
    const historical = finished.filter(rental => rental.isHistorical).map(rental =>
      new Set((rental.participantsText ?? '').split(/\r?\n/).map(line =>
        historicalName(line.replace(/^(?:[\s\u2060]*\d+[.\-º):]?\s*)+/, '')))));
    const recorded = finished.filter(rental => !rental.isHistorical && !rental.isManual && rental.teams.length);
    const name = historicalName(player.name);
    const oldPresences = historical.filter(names => names.has(name)).length;
    const appearances = recorded.filter(rental => rental.winningGoalkeeperId === player.id ||
      rental.teams.some(team => team.players.includes(player.id)));
    return {name: player.name, presences: oldPresences + appearances.length, wins: player.titles};
  });
  private readonly stars = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  formatLevel(level: number): string {
    return this.stars.format(level);
  }
}

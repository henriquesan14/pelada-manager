import { saoPauloToday } from './dates';
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isMonthlyFeePaid, MonthlyFeeMonth, Player } from './models';

export interface FeeExemptionChange {month:string;playerId:string;exempt:boolean;}
export interface FeePaymentChange {month:string;playerId:string;playerName:string;paid:boolean;}
@Component({
  selector:'app-monthly-fees',imports:[FormsModule],
  template:`<div class="page-heading"><div><div class="eyebrow">PAGAMENTOS DOS JOGADORES</div><h1>Mensalidades</h1><p>R$ 10,00 por mês para cada jogador cadastrado. Acompanhe os pagamentos recebidos.</p></div></div>
    <section class="card monthly-selector"><label>Mês de referência<input type="month" [ngModel]="month()" (ngModelChange)="month.set($event)" [disabled]="busy()"></label>
      @if(!readOnly() && !current()) {<button class="primary" [disabled]="busy() || !month()" (click)="openMonth.emit(month())">Abrir mensalidades do mês</button>}
    </section>
    @if(current(); as fees) {
      <div class="stats monthly-stats"><article><small>Recebido · {{paidCount()}} pagamentos</small><strong>{{money(received())}}</strong></article></div>
      <section class="card"><div class="monthly-filters"><label>Pesquisar jogador<input type="search" placeholder="Digite o nome" [ngModel]="search()" (ngModelChange)="search.set($event)"></label><label>Status<select [ngModel]="status()" (ngModelChange)="status.set($event)"><option value="all">Todos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option><option value="exempt">Isentos</option></select></label></div>
      <div class="table-scroll"><table class="monthly-table"><thead><tr><th>JOGADOR</th><th>STATUS</th>@if(!readOnly()) {<th>AÇÃO</th>}</tr></thead><tbody>@for(charge of visibleCharges(); track charge.playerId) {<tr><td><strong>{{charge.playerName.toLocaleUpperCase('pt-BR')}}</strong></td><td><span class="badge" [class.fee-paid]="isPaid(charge)">{{charge.isExempt ? 'Isento' : isPaid(charge) ? 'Pago' : 'Pendente'}}</span></td>@if(!readOnly()) {<td><div class="fee-actions">@if(!charge.isExempt) {<button type="button" [class.fee-pay-check]="!isPaid(charge)" [attr.aria-label]="(isPaid(charge) ? 'Desfazer pagamento de ' : 'Marcar como pago: ') + charge.playerName" [title]="isPaid(charge) ? 'Desfazer pagamento' : 'Marcar como pago'" [class.fee-undo-cross]="isPaid(charge)" [disabled]="busy()" (click)="payment.emit({month:fees.month,playerId:charge.playerId,playerName:charge.playerName,paid:!isPaid(charge)})">@if(isPaid(charge)) {<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>} @else {<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>}</button>}
        @if(!isPaid(charge)) {
          <button type="button" class="text-button fee-exemption" [disabled]="busy()"
            (click)="exemption.emit({month:fees.month,playerId:charge.playerId,exempt:!charge.isExempt})">
            {{charge.isExempt ? 'Retirar isenção' : 'Isentar'}}
          </button>
        }</div></td>}</tr>} @empty {<tr><td [attr.colspan]="readOnly() ? 2 : 3">Nenhum jogador encontrado para este filtro.</td></tr>}</tbody></table></div></section>
    } @else {<section class="card history-card empty"><h2>Mensalidades ainda não abertas</h2><p>{{readOnly() ? 'Não há mensalidades registradas para o mês selecionado.' : 'Ao abrir o mês, será criada uma cobrança de R$ 10,00 para cada jogador cadastrado. Nenhum pagamento será marcado automaticamente.'}}</p></section>}
    @if(months().length) {<section class="card history-card"><h2>Meses registrados</h2><div class="monthly-history">@for(item of sortedMonths(); track item.month) {<button class="text-button" (click)="month.set(item.month)">{{item.month.slice(5)}}/{{item.month.slice(0,4)}}</button>}</div></section>}`
})
export class MonthlyFeesComponent {
  readonly isPaid=isMonthlyFeePaid;
  money(value:number):string {return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  readonly months=input<MonthlyFeeMonth[]>([]);
  readonly players=input<Player[]>([]);
  readonly readOnly=input(false);
  readonly busy=input(false);
  readonly openMonth=output<string>();
  readonly payment=output<FeePaymentChange>();
  readonly exemption=output<FeeExemptionChange>();
  readonly month=signal(saoPauloToday().slice(0,7));
  readonly search=signal('');readonly status=signal<'all'|'paid'|'pending'|'exempt'>('all');
  readonly current=computed(()=>this.months().find(m=>m.month===this.month()));
  readonly expected=computed(()=>(this.current()?.charges.filter(charge => !charge.isExempt).length||0)*(this.current()?.amount||10));
  readonly paidCount=computed(()=>this.current()?.charges.filter(isMonthlyFeePaid).length||0);
  readonly received=computed(()=>this.paidCount()*(this.current()?.amount||10));
  readonly sortedMonths=computed(()=>[...this.months()].sort((a,b)=>b.month.localeCompare(a.month)));
  readonly visibleCharges=computed(()=>{
    const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const term=normalize(this.search().trim());
    const isPastMonth = this.month() < saoPauloToday().slice(0, 7);
    const registeredIds = new Set(this.players().map(player => player.id));
    return [...this.current()?.charges||[]].filter(c=>(isPastMonth || registeredIds.has(c.playerId)) &&
      normalize(c.playerName).includes(term)&&
      (this.status() === 'all' || this.status() === (c.isExempt ? 'exempt' : isMonthlyFeePaid(c) ? 'paid' : 'pending'))).sort((a,b)=>a.playerName.localeCompare(b.playerName,'pt-BR'));
  });
}

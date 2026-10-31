import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isMonthlyFeePaid, MonthlyFeeMonth } from './models';

export interface FeePaymentChange {month:string;playerId:string;playerName:string;paid:boolean;}
@Component({
  selector:'app-monthly-fees',imports:[FormsModule],
  template:`<div class="page-heading"><div><div class="eyebrow">PAGAMENTOS DOS JOGADORES</div><h1>Mensalidades</h1><p>R$ 10,00 por mês para cada jogador cadastrado. Acompanhe os pagamentos recebidos.</p></div></div>
    <section class="card monthly-selector"><label>Mês de referência<input type="month" [ngModel]="month()" (ngModelChange)="month.set($event)" [disabled]="busy()"></label>
      @if(!readOnly() && !current()) {<button class="primary" [disabled]="busy() || !month()" (click)="openMonth.emit(month())">Abrir mensalidades do mês</button>}
    </section>
    @if(current(); as fees) {
      <div class="stats monthly-stats"><article><small>Recebido · {{paidCount()}} pagamentos</small><strong>{{money(received())}}</strong></article></div>
      <section class="card"><div class="monthly-filters"><label>Pesquisar jogador<input type="search" placeholder="Digite o nome" [ngModel]="search()" (ngModelChange)="search.set($event)"></label><label>Status<select [ngModel]="status()" (ngModelChange)="status.set($event)"><option value="all">Todos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option></select></label></div>
      <div class="table-scroll"><table class="monthly-table"><thead><tr><th>JOGADOR</th><th>VALOR</th><th>STATUS</th>@if(!readOnly()) {<th>AÇÃO</th>}</tr></thead><tbody>@for(charge of visibleCharges(); track charge.playerId) {<tr><td><strong>{{charge.playerName}}</strong></td><td>{{money(fees.amount)}}</td><td><span class="badge" [class.fee-paid]="isPaid(charge)">{{isPaid(charge) ? 'Pago' : 'Pendente'}}</span></td>@if(!readOnly()) {<td><button [class.primary]="!isPaid(charge)" [class.text-button]="isPaid(charge)" [class.danger]="isPaid(charge)" [disabled]="busy()" (click)="payment.emit({month:fees.month,playerId:charge.playerId,playerName:charge.playerName,paid:!isPaid(charge)})">{{isPaid(charge) ? 'Desfazer pagamento' : 'Marcar como pago'}}</button></td>}</tr>} @empty {<tr><td [attr.colspan]="readOnly() ? 3 : 4">Nenhum jogador encontrado para este filtro.</td></tr>}</tbody></table></div></section>
    } @else {<section class="card history-card empty"><h2>Mensalidades ainda não abertas</h2><p>{{readOnly() ? 'Não há mensalidades registradas para o mês selecionado.' : 'Ao abrir o mês, será criada uma cobrança de R$ 10,00 para cada jogador cadastrado. Nenhum pagamento será marcado automaticamente.'}}</p></section>}
    @if(months().length) {<section class="card history-card"><h2>Meses registrados</h2><div class="monthly-history">@for(item of sortedMonths(); track item.month) {<button class="text-button" (click)="month.set(item.month)">{{item.month.slice(5)}}/{{item.month.slice(0,4)}}</button>}</div></section>}`
})
export class MonthlyFeesComponent {
  readonly isPaid=isMonthlyFeePaid;
  money(value:number):string {return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  readonly months=input<MonthlyFeeMonth[]>([]);
  readonly readOnly=input(false);
  readonly busy=input(false);
  readonly openMonth=output<string>();
  readonly payment=output<FeePaymentChange>();
  readonly month=signal(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`);
  readonly search=signal('');readonly status=signal<'all'|'paid'|'pending'>('all');
  readonly current=computed(()=>this.months().find(m=>m.month===this.month()));
  readonly expected=computed(()=>(this.current()?.charges.length||0)*(this.current()?.amount||10));
  readonly paidCount=computed(()=>this.current()?.charges.filter(isMonthlyFeePaid).length||0);
  readonly received=computed(()=>this.paidCount()*(this.current()?.amount||10));
  readonly sortedMonths=computed(()=>[...this.months()].sort((a,b)=>b.month.localeCompare(a.month)));
  readonly visibleCharges=computed(()=>{
    const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const term=normalize(this.search().trim());
    return [...this.current()?.charges||[]].filter(c=>normalize(c.playerName).includes(term)&&
      (this.status()==='all'||(this.status()==='paid')===isMonthlyFeePaid(c))).sort((a,b)=>a.playerName.localeCompare(b.playerName,'pt-BR'));
  });
}

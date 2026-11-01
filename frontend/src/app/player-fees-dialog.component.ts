import { saoPauloToday } from './dates';
import { Component, computed, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isMonthlyFeePaid, MonthlyFeeMonth, Player } from './models';

@Component({selector:'app-player-fees-dialog',imports:[FormsModule],template:`
  <dialog #dialog class="rental-dialog player-fees-dialog" aria-labelledby="player-fees-title" (cancel)="close.emit()" (close)="close.emit()">
    <div class="rental-dialog-toolbar"><h2 id="player-fees-title">Mensalidades · {{player().name}}</h2><button type="button" class="text-button" (click)="close.emit()" autofocus>Fechar ✕</button></div>
    <div class="card rental-detail-content"><label>Ano<select [ngModel]="year()" (ngModelChange)="year.set($event)">@for(item of years(); track item) {<option [value]="item">{{item}}</option>}</select></label>
      <p>{{paidCount()}} mensalidades pagas · Total pago: <strong>{{money(received())}}</strong></p>
      <div class="table-scroll"><table class="monthly-table"><thead><tr><th>MÊS</th><th>VALOR</th><th>STATUS</th></tr></thead><tbody>@for(row of rows(); track row.month) {<tr><td>{{row.name}}</td><td>{{row.charge ? money(row.amount) : '—'}}</td><td><span class="badge" [class.fee-paid]="row.paid">{{row.charge ? (row.paid ? 'Pago' : 'Pendente') : (row.opened ? 'Sem cobrança' : 'Não aberta')}}</span></td></tr>}</tbody></table></div>
    </div>
  </dialog>`})
export class PlayerFeesDialogComponent {
  readonly player=input.required<Player>();
  readonly months=input<MonthlyFeeMonth[]>([]);
  readonly close=output<void>();
  readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly year=signal(saoPauloToday().slice(0,4));
  readonly years=computed(()=>[...new Set([saoPauloToday().slice(0,4),...this.months().filter(m=>m.charges.some(c=>c.playerId===this.player().id)).map(m=>m.month.slice(0,4))])].sort().reverse());
  readonly rows=computed(()=>['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((name,index)=>{
    const month=`${this.year()}-${String(index+1).padStart(2,'0')}`;
    const ledger=this.months().find(m=>m.month===month);const charge=ledger?.charges.find(c=>c.playerId===this.player().id);
    return {month,name,charge,opened:!!ledger,amount:ledger?.amount||10,paid:!!charge&&isMonthlyFeePaid(charge)};
  }));
  readonly paidCount=computed(()=>this.rows().filter(r=>r.paid).length);
  readonly received=computed(()=>this.rows().reduce((sum,row)=>sum+(row.paid?row.amount:0),0));
  money(value:number):string {return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  constructor(){effect(onCleanup=>{
    const dialog=this.dialog()?.nativeElement;if(!dialog)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
    onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;});
  });}
}

import { Component, computed, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashIncome, CashExpense, isMonthlyFeePaid, MonthlyFeeMonth } from './models';

export interface NewIncome {incomeDate:string;amount:number;description:string;}
export interface NewExpense {expenseDate:string;amount:number;description:string;}

@Component({selector:'app-cash-flow',imports:[FormsModule],template:`
  <div class="page-heading"><div><div class="eyebrow">CAIXA DA PELADA</div><h1>Entradas e saídas</h1><p>Acompanhe os recebimentos das mensalidades e os gastos da pelada.</p></div>@if(!readOnly()) {<div class="rental-actions"><button class="primary" [disabled]="busy()" (click)="showIncomeForm.set(true); showExpenseForm.set(false)">＋ Adicionar entrada</button><button class="primary" [disabled]="busy()" (click)="showExpenseForm.set(true); showIncomeForm.set(false)">＋ Adicionar gasto</button></div>}</div>
  @if(!readOnly() && showIncomeForm()) {<dialog #incomeDialog aria-labelledby="income-dialog-title" (cancel)="busy() ? $event.preventDefault() : showIncomeForm.set(false)" (close)="showIncomeForm.set(false)"><div class="section-heading"><h2 id="income-dialog-title">Adicionar entrada</h2><button type="button" class="icon-button" aria-label="Fechar" [disabled]="busy()" (click)="showIncomeForm.set(false)">×</button></div><form #incomeForm="ngForm" (ngSubmit)="incomeForm.valid && submitIncome()"><fieldset [disabled]="busy()"><div class="monthly-filters"><label>Data<input type="date" name="incomeDate" [(ngModel)]="incomeDate" required></label><label>Valor (R$)<input type="number" name="incomeAmount" [(ngModel)]="incomeAmount" required min="0.01" max="1000000" step="0.01" placeholder="0,00"></label></div><label>Descrição<input name="incomeDescription" [(ngModel)]="incomeDescription" required maxlength="500" placeholder="Ex.: Doação ou patrocínio"></label><div class="rental-actions"><button class="primary" type="submit" [disabled]="!incomeForm.valid || !incomeDescription.trim()">{{busy() ? 'Salvando…' : 'Salvar entrada'}}</button><button class="text-button" type="button" (click)="showIncomeForm.set(false)">Cancelar</button></div></fieldset></form></dialog>}
  @if(!readOnly() && showExpenseForm()) {<dialog #expenseDialog aria-labelledby="expense-dialog-title" (cancel)="busy() ? $event.preventDefault() : showExpenseForm.set(false)" (close)="showExpenseForm.set(false)"><div class="section-heading"><h2 id="expense-dialog-title">Adicionar gasto</h2><button type="button" class="icon-button" aria-label="Fechar" [disabled]="busy()" (click)="showExpenseForm.set(false)">×</button></div><form #expenseForm="ngForm" (ngSubmit)="expenseForm.valid && submitExpense()"><fieldset [disabled]="busy()"><div class="monthly-filters"><label>Data<input type="date" name="expenseDate" [(ngModel)]="expenseDate" required></label><label>Valor (R$)<input type="number" name="expenseAmount" [(ngModel)]="expenseAmount" required min="0.01" max="1000000" step="0.01" placeholder="0,00"></label></div><label>Descrição<input name="expenseDescription" [(ngModel)]="expenseDescription" required maxlength="500" placeholder="Ex.: Compra de bola"></label><div class="rental-actions"><button class="primary" type="submit" [disabled]="!expenseForm.valid || !expenseDescription.trim()">{{busy() ? 'Salvando…' : 'Salvar gasto'}}</button><button class="text-button" type="button" (click)="showExpenseForm.set(false)">Cancelar</button></div></fieldset></form></dialog>}
  <div class="stats monthly-stats"><article><small>Saldo atual · Todos os anos</small><strong>{{money(currentBalance())}}</strong></article></div>
  <section class="card monthly-selector"><label>Ano<select [ngModel]="year()" (ngModelChange)="year.set($event)">@for(item of years(); track item) {<option [value]="item">{{item}}</option>}</select></label></section>
  <div class="stats annual-stats"><article><small>Entradas no ano</small><strong>{{money(annualReceived())}}</strong></article><article><small>Saídas no ano</small><strong>{{money(annualExpenses())}}</strong></article><article><small>Saldo do ano</small><strong>{{money(annualReceived()-annualExpenses())}}</strong></article></div>
  <section class="card history-card"><h2>Entradas · Mensalidades recebidas</h2><p>Atualizado automaticamente pelos pagamentos dos jogadores, por mês de referência.</p><div class="table-scroll"><table><thead><tr><th>REFERÊNCIA</th><th>PAGAMENTOS</th><th>VALOR</th></tr></thead><tbody>@for(item of yearMonths(); track item.month) {<tr><td>{{item.month.slice(5)}}/{{year()}}</td><td>{{paidCount(item)}}</td><td>{{money(paidCount(item)*item.amount)}}</td></tr>} @empty {<tr><td colspan="3">Nenhuma mensalidade registrada neste ano.</td></tr>}</tbody></table></div></section>
  <section class="card history-card"><h2>Entradas · Outros recebimentos</h2><div class="table-scroll"><table><thead><tr><th>DATA</th><th>VALOR</th><th>DESCRIÇÃO</th></tr></thead><tbody>@for(income of yearIncomes(); track income.id) {<tr><td>{{formatDate(income.date)}}</td><td>{{money(income.amount)}}</td><td>{{income.description}}</td></tr>} @empty {<tr><td colspan="3">Nenhuma outra entrada registrada neste ano.</td></tr>}</tbody></table></div></section>
  <section class="card history-card"><h2>Saídas · Gastos realizados</h2><div class="table-scroll"><table><thead><tr><th>DATA</th><th>VALOR</th><th>DESCRIÇÃO</th></tr></thead><tbody>@for(expense of yearExpenses(); track expense.id) {<tr><td>{{formatDate(expense.date)}}</td><td>{{money(expense.amount)}}</td><td>{{expense.description}}</td></tr>} @empty {<tr><td colspan="3">Nenhum gasto registrado neste ano.</td></tr>}</tbody></table></div></section>`})
export class CashFlowComponent {
  readonly expenseDialog=viewChild<ElementRef<HTMLDialogElement>>('expenseDialog');
  readonly incomeDialog=viewChild<ElementRef<HTMLDialogElement>>('incomeDialog');
  constructor(){effect(onCleanup=>{
    const dialog=this.incomeDialog()?.nativeElement || this.expenseDialog()?.nativeElement;if(!dialog)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
    onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;});
  });}
  readonly readOnly=input(false);
  readonly busy=input(false);
  readonly addIncome=output<NewIncome>();
  readonly showIncomeForm=signal(false);
  incomeDate=this.today();
  incomeAmount:number|null=null;
  incomeDescription='';
  readonly addExpense=output<NewExpense>();
  readonly showExpenseForm=signal(false);
  expenseDate=this.today();
  expenseAmount:number|null=null;
  expenseDescription='';
  private today():string {const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
  submitIncome():void {if(this.readOnly()||this.busy()||!this.incomeDate||!this.incomeAmount||!this.incomeDescription.trim())return;this.addIncome.emit({incomeDate:this.incomeDate,amount:this.incomeAmount,description:this.incomeDescription.trim()});}
  incomeSaved():void {this.year.set(this.incomeDate.slice(0,4));this.showIncomeForm.set(false);this.incomeDate=this.today();this.incomeAmount=null;this.incomeDescription='';}
  submitExpense():void {if(this.readOnly()||this.busy()||!this.expenseDate||!this.expenseAmount||!this.expenseDescription.trim())return;this.addExpense.emit({expenseDate:this.expenseDate,amount:this.expenseAmount,description:this.expenseDescription.trim()});}
  expenseSaved():void {this.year.set(this.expenseDate.slice(0,4));this.showExpenseForm.set(false);this.expenseDate=this.today();this.expenseAmount=null;this.expenseDescription='';}
  readonly months=input<MonthlyFeeMonth[]>([]);
  readonly incomes=input<CashIncome[]>([]);
  readonly expenses=input<CashExpense[]>([]);
  readonly currentBalance=computed(()=>
    (this.months().reduce((sum,month)=>sum+this.paidCount(month)*Math.round(month.amount*100),0)+
      this.incomes().reduce((sum,income)=>sum+Math.round(income.amount*100),0)-
      this.expenses().reduce((sum,expense)=>sum+Math.round(expense.amount*100),0))/100);
  readonly year=signal(String(new Date().getFullYear()));
  readonly years=computed(()=>[...new Set([this.year(),...this.months().map(m=>m.month.slice(0,4)),...this.expenses().map(e=>e.date.slice(0,4)),...this.incomes().map(e=>e.date.slice(0,4))])].sort().reverse());
  readonly yearMonths=computed(()=>this.months().filter(m=>m.month.startsWith(this.year()+'-')).sort((a,b)=>a.month.localeCompare(b.month)));
  readonly annualReceived=computed(()=>this.yearMonths().reduce((sum,m)=>sum+this.paidCount(m)*m.amount,0)+this.yearIncomes().reduce((sum,income)=>sum+income.amount,0));
  readonly yearIncomes=computed(()=>this.incomes().filter(e=>e.date.startsWith(this.year()+'-')).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)));
  readonly yearExpenses=computed(()=>this.expenses().filter(e=>e.date.startsWith(this.year()+'-')).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)));
  readonly annualExpenses=computed(()=>this.yearExpenses().reduce((sum,e)=>sum+e.amount,0));
  paidCount(month:MonthlyFeeMonth):number {return month.charges.filter(isMonthlyFeePaid).length;}
  money(value:number):string {return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  formatDate(value:string):string {return value.split('-').reverse().join('/');}
}

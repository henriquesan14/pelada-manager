import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CashFlowComponent } from './cash-flow.component';
import { MonthlyFeeMonth } from './models';
const ledger:MonthlyFeeMonth={month:'2026-10',amount:10,charges:[{playerId:'a',playerName:'Ana',importedPaid:true},{playerId:'b',playerName:'Beto'}]};
describe('fluxo de caixa',()=>{
  it('mantém o formulário até confirmar o salvamento e bloqueia envio público',()=>{
    const fixture=TestBed.createComponent(CashFlowComponent);const app=fixture.componentInstance;const save=vi.fn();app.addIncome.subscribe(save);
    app.showIncomeForm.set(true);app.incomeDate='2026-10-31';app.incomeAmount=25;app.incomeDescription=' Doação ';app.submitIncome();
    expect(save).toHaveBeenCalledWith({incomeDate:'2026-10-31',amount:25,description:'Doação'});expect(app.showIncomeForm()).toBe(true);
    app.incomeSaved();expect(app.showIncomeForm()).toBe(false);expect(app.incomeAmount).toBeNull();
    fixture.componentRef.setInput('readOnly',true);save.mockClear();app.incomeAmount=25;app.incomeDescription='Doação';app.submitIncome();expect(save).not.toHaveBeenCalled();
    fixture.detectChanges();expect(fixture.nativeElement.textContent).not.toContain('Adicionar entrada');fixture.destroy();
  });
  it('separa anos e calcula caixa sem depender dos filtros ou do mês exibido',()=>{
    const fixture=TestBed.createComponent(CashFlowComponent);const app=fixture.componentInstance;
    fixture.componentRef.setInput('months',[ledger,{...ledger,month:'2026-09'},{...ledger,month:'2025-10'}]);
    fixture.componentRef.setInput('expenses',[{id:'a',date:'2026-02-10',amount:7.5,description:'Material'},{id:'b',date:'2025-12-10',amount:100,description:'Outro ano'}]);
    fixture.componentRef.setInput('incomes',[{id:'i',date:'2026-10-31',amount:25.5,description:'Doação'},{id:'j',date:'2025-10-31',amount:2,description:'Outro ano'}]);
    app.year.set('2026');fixture.detectChanges();
    expect(app.annualReceived()).toBe(45.5);expect(app.annualExpenses()).toBe(7.5);expect(app.currentBalance()).toBe(-50);
    expect(app.yearExpenses().length).toBe(1);expect(fixture.nativeElement.textContent).toContain('10/02/2026');
    app.year.set('2025');expect(app.annualReceived()).toBe(12);expect(app.annualExpenses()).toBe(100);expect(app.currentBalance()).toBe(-50);
    fixture.destroy();
  });
});

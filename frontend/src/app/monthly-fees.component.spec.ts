import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MonthlyFeesComponent } from './monthly-fees.component';
import { MonthlyFeeMonth } from './models';

const ledger:MonthlyFeeMonth={month:'2026-10',amount:10,charges:[
  {playerId:'a',playerName:'Ana',paidAt:'2026-10-10T12:00:00Z',recordedBy:'u',recordedByName:'Organizador'},
  {playerId:'b',playerName:'João (GL)'}
]};
describe('mensalidades de dez reais',()=>{
  it('abre o mês apenas após a ação do organizador',async()=>{
    const fixture=TestBed.createComponent(MonthlyFeesComponent);const app=fixture.componentInstance;
    app.month.set('2026-10');const open=vi.fn();app.openMonth.subscribe(open);fixture.detectChanges();
    expect(open).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('.monthly-selector button') as HTMLButtonElement).click();
    expect(open).toHaveBeenCalledWith('2026-10');fixture.destroy();
  });
  it('calcula recebido e pendente e emite o pagamento de quem foi escolhido',async()=>{
    const fixture=TestBed.createComponent(MonthlyFeesComponent);const app=fixture.componentInstance;
    fixture.componentRef.setInput('months',[ledger]);app.month.set('2026-10');fixture.detectChanges();
    expect(app.expected()).toBe(20);expect(app.received()).toBe(10);expect(app.paidCount()).toBe(1);
    const payment=vi.fn();app.payment.subscribe(payment);
    const button=Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b=>b.textContent==='Marcar como pago')!;
    button.click();expect(payment).toHaveBeenCalledWith({month:'2026-10',playerId:'b',playerName:'João (GL)',paid:true});
    const updated={...ledger,charges:ledger.charges.map(c=>({...c,paidAt:'2026-10-10T12:00:00Z'}))};
    fixture.componentRef.setInput('months',[updated]);fixture.detectChanges();expect(app.received()).toBe(20);
    fixture.destroy();
  });
  it('pesquisa sem acentos e filtra pagamentos sem alterar os totais do mês',()=>{
    const fixture=TestBed.createComponent(MonthlyFeesComponent);const app=fixture.componentInstance;
    fixture.componentRef.setInput('months',[ledger]);app.month.set('2026-10');app.search.set('joao');app.status.set('pending');fixture.detectChanges();
    expect(app.visibleCharges().map(c=>c.playerId)).toEqual(['b']);expect(app.expected()).toBe(20);
    app.status.set('paid');expect(app.visibleCharges()).toEqual([]);fixture.destroy();
  });
  it('conta pagamento importado sem mostrar uma coluna de data',()=>{
    const fixture=TestBed.createComponent(MonthlyFeesComponent);const app=fixture.componentInstance;
    fixture.componentRef.setInput('months',[{month:'2026-10',amount:10,charges:[{playerId:'a',playerName:'Ana',importedPaid:true,importSourceCell:'MENSALIDADES!K5'}]}]);
    app.month.set('2026-10');fixture.detectChanges();
    expect(app.received()).toBe(10);expect(app.paidCount()).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.monthly-table th').length).toBe(4);
    expect(fixture.nativeElement.textContent).not.toContain('Data não informada');
    app.status.set('paid');expect(app.visibleCharges().length).toBe(1);fixture.destroy();
  });
});

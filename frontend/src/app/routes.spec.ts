import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SwUpdate } from '@angular/service-worker';
import { NEVER } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { ApiService } from './api.service';
import { routes, PeladaRouteReuseStrategy } from './app.routes';
import { emptyState } from './models';

describe('rotas da pelada',()=>{
  async function setup(){
    const api={session:vi.fn().mockResolvedValue({user:{id:'u',name:'Rico',nick:'rico',role:'owner'}}),state:vi.fn().mockResolvedValue({revision:1,state:emptyState()})};
    TestBed.configureTestingModule({providers:[provideRouter(routes),{provide:RouteReuseStrategy,useClass:PeladaRouteReuseStrategy},{provide:ApiService,useValue:api},{provide:SwUpdate,useValue:{versionUpdates:NEVER}}]});
    return api;
  }
  it('abre diretamente a página da URL e preserva a sessão e a seleção entre rotas',async()=>{
    const api=await setup();const harness=await RouterTestingHarness.create();
    const app=await harness.navigateByUrl('/sorteio',AppComponent);
    await harness.fixture.whenStable();
    expect(app.page()).toBe('sorteio');expect(harness.routeNativeElement?.textContent).toContain('Deixa que a gente sorteia');
    app.selected.set(['p1']);
    const ranking=await harness.navigateByUrl('/ranking',AppComponent);
    expect(ranking).toBe(app);expect(ranking.selected()).toEqual(['p1']);expect(ranking.page()).toBe('ranking');
    expect(api.session).toHaveBeenCalledTimes(1);
    await harness.navigateByUrl('/sorteio',AppComponent);expect(app.page()).toBe('sorteio');
  });
  it('mostra goleiros na seleção e envia apenas os jogadores marcados ao sorteio',async()=>{
    const api=await setup();Object.assign(api,{action:vi.fn().mockResolvedValue({revision:2,state:emptyState()})});
    const harness=await RouterTestingHarness.create('/sorteio');await harness.fixture.whenStable();
    const app=harness.routeDebugElement!.componentInstance as AppComponent;
    app.snapshot.set({revision:1,state:{...emptyState(),players:[{id:'g',name:'Ana (GL)',level:4},{id:'p',name:'Beto',level:3},{id:'g2',name:'Caio',position:'Goleiro',level:2,suspension:{startedAt:'2026-01-01T00:00:00Z',until:'2999-12-31'}}]}});
    harness.detectChanges();expect(harness.routeNativeElement?.querySelectorAll('.select-player').length).toBe(3);
    expect(harness.routeNativeElement?.querySelectorAll('.select-player input:disabled').length).toBe(1);
    expect(harness.routeNativeElement?.textContent).toContain('Suspenso até');
    app.selected.set(['g','p']);await app.draw();
    expect((api as any).action).toHaveBeenCalledWith({type:'generateDrawOptions',players:['g','p'],count:3,revision:1});
  });
  it('carrega o histórico em um acesso direto equivalente a atualizar a página',async()=>{
    await setup();const harness=await RouterTestingHarness.create('/alugueis');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/alugueis');
    expect(harness.routeNativeElement?.textContent).toContain('Histórico de aluguéis');
  });
  it('abre o financeiro em rota própria e liga o jogador às suas mensalidades',async()=>{
    await setup();const harness=await RouterTestingHarness.create('/financeiro');await harness.fixture.whenStable();harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-cash-flow')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-monthly-fees')).toBeNull();
    const app=await harness.navigateByUrl('/jogadores',AppComponent);
    HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    HTMLDialogElement.prototype.close=function(){this.open=false;};
    app.snapshot.set({revision:1,state:{...emptyState(),players:[{id:'p1',name:'Ana',level:3}],monthlyFees:[{month:`${new Date().getFullYear()}-01`,amount:10,charges:[{playerId:'p1',playerName:'Ana',importedPaid:true}]}]}});
    app.viewPlayerFees('p1');await harness.fixture.whenStable();harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/jogadores');expect(app.feeDialogPlayerId()).toBe('p1');
    const dialog=harness.routeNativeElement?.querySelector('app-player-fees-dialog dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);expect(dialog.querySelectorAll('tbody tr').length).toBe(12);
    expect(dialog.textContent).toContain('1 mensalidades pagas');expect(dialog.textContent).toContain('Não aberta');
    (dialog.querySelector('button') as HTMLButtonElement).click();harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-player-fees-dialog')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-monthly-fees')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-cash-flow')).toBeNull();
  });
  it('redireciona URLs desconhecidas para início',async()=>{
    await setup();await RouterTestingHarness.create('/inexistente');
    expect(TestBed.inject(Router).url).toBe('/inicio');
  });
  it('abre histórico e ranking sem login usando somente a API pública',async()=>{
    const api={session:vi.fn().mockResolvedValue({user:null,needsSetup:false,setupEnabled:true}),
      publicState:vi.fn().mockResolvedValue({revision:1,state:{...emptyState(),monthlyFees:[{month:`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`,amount:10,charges:[{playerId:'p',playerName:'Ana',importedPaid:true}]}],expenses:[{id:'e',date:'2026-10-31',amount:5,description:'Bola'}],players:[{id:'p',name:'Ana',level:0,initialRentals:20}],
        rentals:[{id:'r',name:'Pelada pública',createdAt:'2026-10-30T12:00:00Z',finishedAt:'2026-10-30T14:00:00Z',teams:[],isHistorical:true,participantsText:'Ana e convidados'}]}}),
      state:vi.fn(),action:vi.fn()};
    TestBed.configureTestingModule({providers:[provideRouter(routes),{provide:RouteReuseStrategy,useClass:PeladaRouteReuseStrategy},{provide:ApiService,useValue:api},{provide:SwUpdate,useValue:{versionUpdates:NEVER}}]});
    const harness=await RouterTestingHarness.create('/alugueis');await harness.fixture.whenStable();harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Pelada pública');
    expect(harness.routeNativeElement?.textContent).toContain('somente leitura');
    expect(harness.routeNativeElement?.textContent).not.toContain('Sortear e cadastrar pelada');
    expect(harness.routeNativeElement?.querySelector('nav')?.textContent).not.toContain('Jogadores');
    expect(harness.routeNativeElement?.querySelector('input[type="password"]')).toBeNull();
    await harness.navigateByUrl('/ranking',AppComponent);await harness.fixture.whenStable();harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Ana');
    expect(harness.routeNativeElement?.textContent).toContain('20');
    expect(api.state).not.toHaveBeenCalled();expect(api.action).not.toHaveBeenCalled();
    await harness.navigateByUrl('/regras',AppComponent);await harness.fixture.whenStable();harness.detectChanges();
    expect(harness.routeNativeElement?.querySelectorAll('.group-rule').length).toBe(7);
    expect(harness.routeNativeElement?.textContent).toContain('Confirmação obrigatória do pagamento');
    expect(harness.routeNativeElement?.textContent).not.toContain('JOGADORES PENDURADOS');
    expect(harness.routeNativeElement?.textContent).not.toContain('JOGADORES BANIDOS');
    expect(harness.routeNativeElement?.querySelector('nav')?.textContent).toContain('Mensalidades');
    await harness.navigateByUrl('/mensalidades',AppComponent);await harness.fixture.whenStable();harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('input[type="password"]')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-monthly-fees')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('.monthly-table')?.textContent).toContain('ANA');
    expect(harness.routeNativeElement?.querySelector('.monthly-table button')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Abrir mensalidades do mês');
    await harness.navigateByUrl('/financeiro',AppComponent);await harness.fixture.whenStable();harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-cash-flow')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('input[type="password"]')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Adicionar gasto');
    expect(harness.routeNativeElement?.textContent).not.toContain('Adicionar entrada');
    expect(harness.routeNativeElement?.textContent).toContain('Saldo atual');
    expect(api.state).not.toHaveBeenCalled();expect(api.action).not.toHaveBeenCalled();
  });
});

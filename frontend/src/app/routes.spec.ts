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
  it('carrega o histórico em um acesso direto equivalente a atualizar a página',async()=>{
    await setup();const harness=await RouterTestingHarness.create('/alugueis');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/alugueis');
    expect(harness.routeNativeElement?.textContent).toContain('Histórico de aluguéis');
  });
  it('redireciona URLs desconhecidas para início',async()=>{
    await setup();await RouterTestingHarness.create('/inexistente');
    expect(TestBed.inject(Router).url).toBe('/inicio');
  });
  it('abre histórico e ranking sem login usando somente a API pública',async()=>{
    const api={session:vi.fn().mockResolvedValue({user:null,needsSetup:false,setupEnabled:true}),
      publicState:vi.fn().mockResolvedValue({revision:1,state:{...emptyState(),players:[{id:'p',name:'Ana',level:0,initialRentals:20}],
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
  });
});

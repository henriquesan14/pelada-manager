import { DRAW_IMAGE_GENERATOR } from './draw-share-dialog.component';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { NEVER } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { ApiService } from './api.service';
import { emptyState, Rental, Snapshot } from './models';

describe('resultado da pelada sem partidas',()=>{
  it('apaga o aluguel somente após confirmar e fecha sua visualização',async()=>{
    const{fixture,api}=await setup(true);const app=fixture.componentInstance;
    app.page.set('partidas');app.selectRental('r1');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rental-dialog').textContent).toContain('Apagar aluguel');
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    try{
      await app.deleteRental();expect(api.action).not.toHaveBeenCalled();
      api.action.mockResolvedValue({revision:2,state:{...app.state(),rentals:[]}});
      confirm.mockReturnValue(true);await app.deleteRental();fixture.detectChanges();
      expect(api.action).toHaveBeenCalledWith({type:'deleteRental',rentalId:'r1',revision:1});
      expect(app.state().rentals).toEqual([]);expect(app.selectedRentalId()).toBe('');
      expect(fixture.nativeElement.querySelector('.rental-dialog')).toBeNull();
    }finally{confirm.mockRestore();fixture.destroy();}
  });
  beforeAll(()=>{
    // jsdom does not implement the native dialog methods.
    HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    HTMLDialogElement.prototype.close=function(){this.open=false;};
  });
  it('pesquisa e seleciona um jogador de linha que foi para o gol',async()=>{
    const{fixture,api}=await setup(true);const app=fixture.componentInstance;
    app.page.set('partidas');app.winnerSelection='a';fixture.detectChanges();await fixture.whenStable();
    const root=fixture.nativeElement as HTMLElement;
    const search=root.querySelector('app-player-autocomplete input') as HTMLInputElement;
    search.value='ana';search.dispatchEvent(new Event('input'));await fixture.whenStable();fixture.detectChanges();
    const list=root.querySelector('[role="listbox"]') as HTMLElement;
    expect(list.textContent).toContain('Ana');expect(list.textContent).not.toContain('Beto');
    expect(root.querySelector('select[name="winningGoalkeeper"]')).toBeNull();
    (list.querySelector('[role="option"]') as HTMLElement).click();await fixture.whenStable();fixture.detectChanges();
    await app.finishRental();
    expect(api.action).toHaveBeenCalledWith({type:'finishRental',rentalId:'r1',winnerTeamId:'a',noWinner:false,winningGoalkeeperId:'p1',revision:1});
    fixture.destroy();
  });
  it('oferece goleiro no sorteio e exige selecionar o goleiro do aluguel',async()=>{
    const{fixture,api}=await setup(true);const app=fixture.componentInstance;
    const keeper={id:'g1',name:'TARCIO (GL)',level:5};
    app.snapshot.set({revision:1,state:{...app.state(),players:[...app.state().players,keeper]}});
    app.page.set('sorteio');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.selection').textContent).toContain('TARCIO');
    app.page.set('partidas');app.winnerSelection='a';fixture.detectChanges();
    const input=fixture.nativeElement.querySelector('app-player-autocomplete input') as HTMLInputElement;input.dispatchEvent(new Event('focus'));fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="listbox"]').textContent).toContain('TARCIO');
    await app.finishRental();expect(api.action).not.toHaveBeenCalled();
    app.goalkeeperSelection='g1';await app.finishRental();
    expect(api.action).toHaveBeenCalledWith({type:'finishRental',rentalId:'r1',winnerTeamId:'a',noWinner:false,winningGoalkeeperId:'g1',revision:1});
    fixture.destroy();
  });
  it('mostra imagens para compartilhar e salva a escolha manual',async()=>{
    const render=vi.fn();TestBed.overrideProvider(DRAW_IMAGE_GENERATOR,{useValue:render});
    const{fixture,api}=await setup();const app=fixture.componentInstance;
    const teams=app.currentRental()!.teams;
    const options=[1,2,3].map(number=>({id:`option-${number}`,number,teams}));
    app.snapshot.set({revision:5,state:{...app.state(),rentals:[],teams:[],drawOptions:options}});
    app.page.set('sorteio');fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.draw-option').length).toBe(3);
    expect(root.querySelector('input[name="rentalDate"]')).toBeNull();
    render.mockResolvedValue(options.map(option=>({number:option.number,file:new File(['png'],`sorteio-${option.number}.png`,{type:'image/png'}),url:'data:image/png;base64,iVBORw0KGgo='})));
    const revoke=vi.fn();Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
    const share=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,'share',{configurable:true,value:share});Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    (root.querySelector('.draw-poll button.primary') as HTMLButtonElement).click();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(render).toHaveBeenCalledWith(options,app.state().players);
    expect(root.querySelectorAll('app-draw-share-dialog img').length).toBe(3);
    expect(root.querySelectorAll('app-draw-share-dialog a[download]').length).toBe(3);
    (root.querySelector('app-draw-share-dialog button.primary') as HTMLButtonElement).click();await fixture.whenStable();
    expect(share.mock.calls[0][0].files.length).toBe(3);expect(share.mock.calls[0][0].files[0].type).toBe('image/png');
    app.showDrawShare.set(false);fixture.detectChanges();expect(revoke).toHaveBeenCalledTimes(3);render.mockReset();
    api.action.mockResolvedValue({revision:6,state:{...app.state(),selectedDrawOptionId:'option-2',teams}});
    await app.chooseDrawOption('option-2');fixture.detectChanges();
    expect(api.action).toHaveBeenCalledWith({type:'selectDrawOption',id:'option-2',revision:5});
    expect(root.querySelector('.draw-option.chosen')?.textContent).toContain('Sorteio 2');
    expect(root.querySelector('input[name="rentalDate"]')).not.toBeNull();fixture.destroy();
  });
  it('fixa o último aluguel com foto e só revela os jogadores do histórico ao visualizar',async()=>{
    const{fixture}=await setup();const app=fixture.componentInstance;
    const rental=app.state().rentals[0];
    const old={...rental,id:'old',name:'Pelada antiga',finishedAt:'2026-10-29T14:00:00Z',photoId:'old-photo'};
    const latest={...rental,id:'latest',name:'Pelada recente',finishedAt:'2026-10-30T14:00:00Z',photoId:'new-photo'};
    app.snapshot.set({revision:5,state:{...app.state(),rentals:[old,latest]}});
    app.page.set('partidas');fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.pinned-rental')?.textContent).toContain('Pelada recente');
    expect(root.querySelector('.pinned-rental img')?.getAttribute('src')).toContain('/latest/photo');
    expect(root.querySelectorAll('.rental-history-row').length).toBe(2);
    expect(root.querySelector('.rental-history')?.querySelector('img')).toBeNull();
    expect(root.querySelector('.rental-teams')).toBeNull();
    (root.querySelector('[aria-label="Visualizar Pelada antiga"]') as HTMLButtonElement).click();fixture.detectChanges();
    expect((root.querySelector('.rental-dialog') as HTMLDialogElement).open).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.querySelector('.rental-dialog .rental-photo')?.getAttribute('src')).toContain('/old/photo');
    expect(root.querySelector('.rental-teams')?.textContent).toContain('Ana');
    expect(root.querySelector('.pinned-rental')?.textContent).toContain('Pelada recente');
    app.closeRental();fixture.detectChanges();expect(root.querySelector('.rental-teams')).toBeNull();
    expect(root.querySelector('.rental-dialog')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden');
    fixture.destroy();
  });
  async function setup(withPhoto=false){
    const rental:Rental={id:'r1',name:'Sexta',createdAt:'2026-10-30T12:00:00Z',teams:[{id:'a',name:'A',players:['p1'],strength:3},{id:'b',name:'B',players:['p2'],strength:3}],photoId:withPhoto?'photo1':null};
    const snapshot:Snapshot={revision:1,state:{...emptyState(),players:[{id:'p1',name:'Ana',level:3},{id:'p2',name:'Beto',level:3}],rentals:[rental]}};
    const api={session:vi.fn().mockResolvedValue({user:{id:'u',name:'Organizador',nick:'teste',role:'owner'},needsSetup:false,setupEnabled:true}),state:vi.fn().mockResolvedValue(snapshot),uploadPhoto:vi.fn().mockResolvedValue({revision:2,state:{...snapshot.state,rentals:[{...rental,photoId:'photo1'}]}}),action:vi.fn().mockImplementation((input:{noWinner:boolean;winnerTeamId:string|null})=>Promise.resolve({revision:3,state:{...snapshot.state,rentals:[{...rental,photoId:'photo1',finishedAt:'2026-10-30T14:00:00Z',winnerTeamId:input.winnerTeamId}]}}))};
    await TestBed.configureTestingModule({imports:[AppComponent],providers:[provideRouter([{path:"**",children:[]}]),{provide:ApiService,useValue:api},{provide:SwUpdate,useValue:{versionUpdates:NEVER}}]}).compileComponents();
    const fixture=TestBed.createComponent(AppComponent);await fixture.whenStable();fixture.detectChanges();
    return{fixture,api};
  }
  it('seleciona o vencedor diretamente no cartão e só grava ao salvar',async()=>{
    const{fixture,api}=await setup(true);const app=fixture.componentInstance;app.page.set('partidas');fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('select[name="winner"]')).toBeNull();
    const cards=root.querySelectorAll<HTMLButtonElement>('.winner-choice');
    expect(cards.length).toBe(3);
    const submit=root.querySelector<HTMLButtonElement>('.rental-result-form button[type="submit"]')!;expect(submit.disabled).toBe(true);
    cards[1].click();fixture.detectChanges();expect(app.winnerSelection).toBe('b');expect(cards[1].getAttribute('aria-pressed')).toBe('true');expect(api.action).not.toHaveBeenCalled();
    app.goalkeeperSelection='p1';await app.finishRental();
    expect(api.action).toHaveBeenCalledWith({type:'finishRental',rentalId:'r1',winnerTeamId:'b',noWinner:false,winningGoalkeeperId:'p1',revision:1});fixture.destroy();
  });
  it('ignora o marcador de goleiro ao gerar as iniciais do avatar',async()=>{
    const{fixture}=await setup();const app=fixture.componentInstance;
    expect(app.initials('Guga (GL)')).toBe('G');expect(app.initials('João Silva (gl) ')).toBe('JS');expect(app.initials('Ana')).toBe('A');fixture.destroy();
  });
  it('envia a foto antes de salvar o vencedor sem cadastrar jogos',async()=>{
    const{fixture,api}=await setup();const app=fixture.componentInstance;
    app.winnerSelection='b';app.goalkeeperSelection='p1';const photo=new File(['test-image'],'aluguel.png',{type:'image/png'});app.selectedPhoto.set(photo);
    await app.finishRental();
    expect(api.uploadPhoto).toHaveBeenCalledWith('r1',photo,1);
    expect(api.action).toHaveBeenCalledWith({type:'finishRental',rentalId:'r1',winnerTeamId:'b',noWinner:false,winningGoalkeeperId:'p1',revision:2});
    expect(app.state().matches).toEqual([]);expect(app.standings().find(p=>p.id==='p2')?.titles).toBe(1);
    expect(app.standings().find(p=>p.id==='p1')?.points).toBe(0);fixture.destroy();
  });
  it('cancela somente após confirmação e libera uma nova pelada sem pontos',async()=>{
    const{fixture,api}=await setup();const app=fixture.componentInstance;
    app.page.set('partidas');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cancelar pelada');
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    try{
      await app.cancelRental();expect(api.action).not.toHaveBeenCalled();
      const cancelled={...app.currentRental()!,finishedAt:'2026-10-30T14:00:00Z',cancelledAt:'2026-10-30T14:00:00Z'};
      api.action.mockResolvedValue({revision:2,state:{...app.state(),rentals:[cancelled]}});
      confirm.mockReturnValue(true);await app.cancelRental();fixture.detectChanges();
      expect(api.action).toHaveBeenCalledWith({type:'cancelRental',rentalId:'r1',revision:1});
      expect(app.activeRental()).toBeNull();expect(app.finalizedRentals()).toEqual([]);
      expect(app.standings().every(p=>p.points===0&&p.rentals===0)).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Pelada cancelada');
      expect(fixture.nativeElement.textContent).not.toContain('Corrigir o time vencedor');
    }finally{confirm.mockRestore();fixture.destroy();}
  });
  it('exige foto antes de salvar e não envia um resultado incompleto',async()=>{
    const{fixture,api}=await setup();fixture.componentInstance.winnerSelection='a';fixture.componentInstance.goalkeeperSelection='p1';await fixture.componentInstance.finishRental();
    expect(api.action).not.toHaveBeenCalled();expect(fixture.componentInstance.toastMessage()).toContain('foto');fixture.destroy();
  });
  it('permite sem vencedor, sem dar pontos a ninguém',async()=>{
    const{fixture,api}=await setup(true);fixture.componentInstance.winnerSelection='none';await fixture.componentInstance.finishRental();
    expect(api.action).toHaveBeenCalledWith({type:'finishRental',rentalId:'r1',winnerTeamId:null,noWinner:true,winningGoalkeeperId:null,revision:1});
    expect(fixture.componentInstance.standings().every(p=>p.points===0)).toBe(true);fixture.destroy();
  });
  it('sorteia um rascunho sem alterar a pelada cadastrada',async()=>{
    const{fixture,api}=await setup();const app=fixture.componentInstance;
    expect(app.selected()).toEqual([]);
    app.select('p1',true);app.select('p2',true);
    const snapshot:Snapshot={revision:2,state:app.state()};
    api.action.mockResolvedValue(snapshot);
    await app.draw();
    expect(api.action).toHaveBeenCalledWith({type:'generateDrawOptions',players:['p1','p2'],count:3,revision:1});
    fixture.destroy();
  });
  it('cadastra os times aprovados com o dia escolhido',async()=>{
    const{fixture,api}=await setup();const app=fixture.componentInstance;
    const teams=app.state().rentals[0].teams;
    app.snapshot.set({revision:5,state:{...emptyState(),teams}});
    app.page.set('sorteio');app.rentalName='Sábado';app.rentalDate='2026-11-07';app.rentalLocation=' Arena Central ';
    api.action.mockResolvedValue({revision:6,state:{...emptyState(),rentals:[{id:'r2',name:'Sábado',createdAt:'2026-10-30T12:00:00Z',playedOn:'2026-11-07',teams}]}});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cadastrar pelada');
    expect(fixture.nativeElement.querySelector('input[type="date"]')).not.toBeNull();
    await app.startRental();
    expect(api.action).toHaveBeenCalledWith({type:'startRental',name:'Sábado',playedOn:'2026-11-07',location:'Arena Central',revision:5});
    expect(app.page()).toBe('partidas');fixture.destroy();
  });
});

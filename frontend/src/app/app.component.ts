import { ManualRentalDialogComponent, ManualRentalInput } from './manual-rental-dialog.component';
import { ResetPasswordDialogComponent } from './reset-password-dialog.component';
import { MobileInfiniteScrollDirective } from './mobile-infinite-scroll.directive';
import { preparePhoto } from './photo';
import { saoPauloToday, formatCalendarDate, formatRentalDate, formatSaoPauloDateTime } from './dates';
import { DrawShareDialogComponent } from './draw-share-dialog.component';
import { PlayerSuspensionDialogComponent, SuspensionChange } from './player-suspension-dialog.component';
import { PlayerFeesDialogComponent } from './player-fees-dialog.component';
import { CashFlowComponent, NewExpense, NewIncome } from './cash-flow.component';
import { FeePaymentChange, MonthlyFeesComponent } from './monthly-fees.component';
import { GroupRulesComponent } from './group-rules.component';
import { PlayerAutocompleteComponent } from './player-autocomplete.component';
import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { SwUpdate } from '@angular/service-worker';
import { firstValueFrom, from, timeout } from 'rxjs';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { PAGE_PATHS, pageFromUrl } from './navigation';
import { ApiService } from './api.service';
import { Activity, emptyState, Invitation, isGoalkeeper, isPlayerSuspended, remainingSuspensionRentals, Player, Organizer, Page, PeladaState, PLAYER_POSITIONS, ranking, Rental, Session, Snapshot, User } from './models';
import { RankingComponent } from './ranking.component';
import { StarRatingComponent } from './star-rating.component';

@Component({ selector: 'app-pelada', imports: [ManualRentalDialogComponent, ResetPasswordDialogComponent, MobileInfiniteScrollDirective, FormsModule, NgTemplateOutlet, RankingComponent, StarRatingComponent, RouterLink, PlayerAutocompleteComponent, GroupRulesComponent, MonthlyFeesComponent, CashFlowComponent, PlayerFeesDialogComponent, PlayerSuspensionDialogComponent, DrawShareDialogComponent], templateUrl: './app.component.html' })
export class AppComponent {
  private readonly api = inject(ApiService);
  readonly registrationDialog=viewChild<ElementRef<HTMLDialogElement>>('registrationDialog');
  readonly showRegistration=signal(false);
  readonly showManualRental = signal(false);
  readonly manualRentalError = signal('');
  private readonly destroy = inject(DestroyRef);
  private readonly updates = inject(SwUpdate);
  readonly reloading = signal(false);
  private readonly router = inject(Router);
  readonly paths = PAGE_PATHS;
  readonly playerDialog = viewChild<ElementRef<HTMLDialogElement>>('playerDialog');
  readonly mobileMenuDialog=viewChild<ElementRef<HTMLDialogElement>>('mobileMenuDialog');
  readonly showMobileMenu=signal(false);
  readonly mobilePrimaryPages=computed<Page[]>(()=>this.user()?['inicio','sorteio','partidas','ranking']:['ranking','partidas','mensalidades','financeiro']);
  readonly mobileExtraLinks=computed(()=>this.visibleLinks().filter(link=>!this.mobilePrimaryPages().includes(link.page)));
  readonly rentalDialog = viewChild<ElementRef<HTMLDialogElement>>('rentalDialog');
  readonly user = signal<User | null>(null);
  readonly session = signal<Session | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly connected = signal(false);
  readonly page = signal<Page>(pageFromUrl(this.router.url));
  readonly isPublicPage = computed(()=>this.page()==='ranking'||this.page()==='partidas'||this.page()==='regras'||this.page()==='mensalidades'||this.page()==='financeiro');
  readonly visibleLinks = computed(()=>this.user()?this.links:this.links.filter(link=>link.page==='ranking'||link.page==='partidas'||link.page==='regras'||link.page==='mensalidades'||link.page==='financeiro'));
  readonly snapshot = signal<Snapshot>({ revision: -1, state: emptyState() });
  readonly state = computed(() => this.snapshot().state);
  readonly sortedPlayers = computed(() => [...this.state().players].sort((a, b) => Number(/\(GL\)$/i.test(a.name.trim())) - Number(/\(GL\)$/i.test(b.name.trim())) || b.level - a.level || a.name.localeCompare(b.name, 'pt-BR')));
  readonly playerSearch=signal('');
  readonly filteredPlayers=computed(()=>{
    const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const term=normalize(this.playerSearch().trim());
    return this.sortedPlayers().filter(player=>normalize(player.name).includes(term));
  });
  readonly goalkeepers = computed(() => this.sortedPlayers().filter(isGoalkeeper));
  readonly standings = computed(() => ranking(this.state().players, this.state().rentals));
  readonly activeRental = computed(() => this.state().rentals.find(r => !r.finishedAt) || null);
  readonly selectedRentalId = signal('');
  readonly currentRental = computed(() => this.state().rentals.find(r => r.id === this.selectedRentalId()) || this.activeRental() || this.state().rentals.at(-1) || null);
  readonly currentTeams = computed(() => this.currentRental()?.teams || []);
  readonly finalizedRentals = computed(() => this.state().rentals.filter(r => !!r.finishedAt && !r.cancelledAt));
  readonly recentRentals = computed(() => [...this.state().rentals].sort((a,b)=>(b.playedOn || b.finishedAt || b.createdAt).localeCompare(a.playedOn || a.finishedAt || a.createdAt)));
  readonly latestRental = computed(() => this.recentRentals().find(r => !!r.finishedAt && !r.cancelledAt) || null);
  readonly preparingPhoto = signal(false);
  readonly photoError = signal('');
  private photoSelection = 0;
  readonly selectedPhoto = signal<File|null>(null);
  readonly photoPreview = signal<string|null>(null);
  readonly currentPhotoUrl = computed(() => this.photoPreview() || (this.currentRental()?.photoId ? `/api/rentals/${this.currentRental()!.id}/photo?v=${this.snapshot().revision}` : null));
  readonly showDrawShare=signal(false);
  readonly suspensionPlayerId=signal('');
  readonly suspensionPlayer=computed(()=>this.state().players.find(p=>p.id===this.suspensionPlayerId()));
  suspended(player:Player):boolean {return isPlayerSuspended(player,this.state().rentals);}
  suspensionLabel(player:Player):string {
    if(!this.suspended(player))return '';
    return player.suspension?.until ? `Suspenso até ${player.suspension.until.split('-').reverse().join('/')}` : `Suspenso: ${remainingSuspensionRentals(player,this.state().rentals)} pelada(s) restante(s)`;
  }
  async suspendPlayer(change:SuspensionChange):Promise<void> {if(await this.perform({type:'suspendPlayer',...change},'Suspensão registrada.'))this.suspensionPlayerId.set('');}
  async clearPlayerSuspension(id:string):Promise<void> {await this.perform({type:'clearPlayerSuspension',id},'Suspensão retirada.');}
  readonly feeDialogPlayerId=signal('');
  readonly feeDialogPlayer=computed(()=>this.state().players.find(p=>p.id===this.feeDialogPlayerId()));
  viewPlayerFees(id:string):void {this.feeDialogPlayerId.set(id);}
  readonly selected = signal<string[]>([]);
  readonly organizers = signal<Organizer[]>([]);
  readonly passwordOrganizer = signal<Organizer|null>(null);
  readonly passwordResetError = signal('');
  readonly activity = signal<Activity[]>([]);
  readonly activityLoading = signal(false);
  readonly activityError = signal(false);
  readonly hasMoreActivity = signal(false);
  readonly invitation = signal<Invitation | null>(null);
  readonly toastMessage = signal('');
  readonly authError = signal('');
  readonly authMode = signal<'login' | 'register' | 'setup'>('login');
  readonly legacy = signal<PeladaState | null>(null);
  readonly canImport = computed(() => this.user()?.role === 'owner' && !this.state().players.length && !this.state().matches.length && !this.state().teams.length && !this.state().rentals.length && !this.state().monthlyFees?.length && !this.state().expenses?.length && !this.state().incomes?.length);
  readonly links: {page: Page; icon: string; label: string}[] = [
    {page:'inicio',icon:'◫',label:'Visão geral'}, {page:'jogadores',icon:'♙',label:'Jogadores'},
    {page:'sorteio',icon:'⇄',label:'Sortear times'}, {page:'partidas',icon:'⚑',label:'Aluguéis'},
    {page:'ranking',icon:'♜',label:'Ranking'}, {page:'regras',icon:'☷',label:'Regras'}, {page:'mensalidades',icon:'＄',label:'Mensalidades'}, {page:'financeiro',icon:'⇅',label:'Entradas e saídas'}, {page:'organizadores',icon:'♧',label:'Organizadores'}
  ];
  auth = { name: '', nick: '', password: '', setupToken: '', invite: '' };
  playerName = '';
  playerLevel = 3;
  playerPosition = '';
  readonly positions = PLAYER_POSITIONS;
  teamCount = 3;
  winnerSelection = '';
  goalkeeperSelection = '';
  readonly formatRentalDate=formatRentalDate;
  readonly formatDateTime=formatSaoPauloDateTime;
  rentalName = `Pelada de ${formatCalendarDate(saoPauloToday())}`;
  rentalLocation = '';
  rentalDate = saoPauloToday();
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(onCleanup=>{
      const dialog=this.registrationDialog()?.nativeElement;if(!dialog)return;
      const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
      onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;});
    });
    effect(onCleanup=>{
      const dialog=this.mobileMenuDialog()?.nativeElement;if(!dialog||!this.showMobileMenu())return;
      const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
      onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;});
    });
    effect(onCleanup=>{
      const dialog=this.rentalDialog()?.nativeElement;
      if(!dialog||!this.selectedRentalId()||this.page()!=='partidas')return;
      const overflow=document.body.style.overflow;
      document.body.style.overflow='hidden';
      dialog.showModal();
      dialog.scrollTop=0;
      onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;});
    });
    const navigation = this.router.events.subscribe(event => {
      if(event instanceof NavigationEnd){this.showMobileMenu.set(false);this.showRegistration.set(false);this.showManualRental.set(false);this.page.set(pageFromUrl(event.urlAfterRedirects));this.passwordOrganizer.set(null);if(this.page()==='organizadores'&&this.user())void this.loadOrganizers();if(!this.user()&&this.isPublicPage()&&!this.loading())void this.refresh(true);}
    });
    this.destroy.onDestroy(()=>navigation.unsubscribe());
    this.auth.invite = new URLSearchParams(location.hash.slice(1)).get('convite') || '';
    if (this.auth.invite) history.replaceState(null, '', location.pathname);
    try { const old = JSON.parse(localStorage.getItem('resenha-v1') || 'null') as PeladaState | null;
      if (old && Array.isArray(old.players) && Array.isArray(old.matches) && (old.players.length || old.matches.length)) this.legacy.set(old);
    } catch { /* Old local data is optional. */ }
    const poll = setInterval(() => { if (!document.hidden) void this.refresh(); }, 5000);
    const online = () => { void this.refresh(true); };
    const offline = () => this.connected.set(false);
    const visibility = () => { if (!document.hidden) void this.refresh(); };
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visibility);
    const subscription = this.updates.versionUpdates.subscribe(event => { if (event.type === 'VERSION_READY') this.toast('Nova versão disponível. Toque em Atualizar.'); });
    this.destroy.onDestroy(() => {
      clearInterval(poll); clearTimeout(this.toastTimer); subscription.unsubscribe();
      this.clearPhoto();
      window.removeEventListener('online', online); window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visibility);
    });
    void this.bootstrap();
  }
  initials(name: string): string { return name.replace(/\s*\(GL\)\s*$/i,'').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }
  playerLabel(id: string): string { return this.state().players.find(p => p.id === id)?.name || 'Jogador removido'; }
  invitationUrl(): string { return `${location.origin}/#convite=${this.invitation()?.invite || ''}`; }
  toast(message: string): void { clearTimeout(this.toastTimer); this.toastMessage.set(message); this.toastTimer = setTimeout(() => this.toastMessage.set(''), 5000); }
  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status > 0) return (error.error as {error?: string})?.error || 'Não foi possível concluir a operação.';
    return 'Conexão interrompida. Confira os dados ao reconectar antes de tentar novamente.';
  }
  private clearSession(): void {
    this.showManualRental.set(false);
    this.user.set(null); this.snapshot.set({ revision: -1, state: emptyState() }); this.selected.set([]);
    this.passwordOrganizer.set(null);this.passwordResetError.set('');this.organizers.set([]); this.activity.set([]); this.invitation.set(null); this.connected.set(false);
    this.playerDialog()?.nativeElement.close(); this.authMode.set('login'); this.auth.password = ''; this.auth.setupToken = '';
    this.clearPhoto();this.winnerSelection='';this.goalkeeperSelection='';
  }
  private apply(next: Snapshot): void {
    const previousRentalId=this.currentRental()?.id;
    next.state.rentals ??= [];
    const current = this.selected().filter(id => next.state.players.some(p => p.id === id));
    this.snapshot.set(next); this.selected.set(current.filter(id=>!this.suspended(next.state.players.find(p=>p.id===id)!))); this.connected.set(true);
    if(previousRentalId!==this.currentRental()?.id){this.clearPhoto();this.winnerSelection='';this.goalkeeperSelection='';}
  }
  async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const info = await this.api.session(); this.session.set(info); this.user.set(info.user);
      this.authMode.set(info.needsSetup ? 'setup' : this.auth.invite ? 'register' : 'login');
      if (info.user) {this.apply(await this.api.state());if(this.page()==='organizadores')void this.loadOrganizers();}
      else if(this.isPublicPage())this.apply(await this.api.publicState());
    } catch (error) {
      this.connected.set(false);
      if(error instanceof HttpErrorResponse && error.status===401){this.session.set({user:null,needsSetup:false,setupEnabled:false});this.clearSession();}
      else this.toast('Servidor temporariamente indisponível. Tentando reconectar…');
    }
    finally { this.loading.set(false); }
  }
  async authenticate(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.authError.set('');
    try {
      const result = this.authMode() === 'login' ? await this.api.login(this.auth) : await this.api.register(this.auth);
      this.user.set(result.user); this.auth.password = ''; this.auth.setupToken = ''; this.auth.invite = '';
      this.apply(await this.api.state());
    } catch (error) { this.authError.set(this.errorMessage(error)); if (this.user() && error instanceof HttpErrorResponse && error.status===401) this.clearSession(); }
    finally { this.busy.set(false); }
  }
  async logout(): Promise<void> {
    if (this.busy()) return;
    try { await this.api.logout(); this.clearSession(); this.go('inicio'); }
    catch (error) { this.toast(this.errorMessage(error)); }
  }
  async reloadApp(): Promise<void> {
    if (this.busy() || this.reloading()) return;
    this.reloading.set(true);
    this.busy.set(true);
    try {
      if (this.updates.isEnabled && navigator.serviceWorker.controller) {
        await firstValueFrom(from(this.updates.checkForUpdate()).pipe(timeout(8000)));
      }
    } catch {
      // Reload even if the update check fails or times out.
    } finally {
      window.location.reload();
    }
  }

  async refresh(force = false): Promise<void> {
    if(!this.session()&&!this.loading()&&!this.busy()){await this.bootstrap();return;}
    if ((!this.user()&&!this.isPublicPage()) || this.busy()) return;
    try {
      const next = await (this.user()?this.api.state():this.api.publicState()); this.connected.set(true);
      const editing = document.activeElement?.matches('input,select,textarea') || this.playerDialog()?.nativeElement.open;
      if (next.revision !== this.snapshot().revision && (force || !editing)) this.apply(next);
    } catch (error) { this.connected.set(false); if (error instanceof HttpErrorResponse && error.status === 401) { this.clearSession(); this.toast('Sua sessão terminou. Entre novamente.'); } }
  }
  async perform(input: Record<string, unknown>, message: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try { this.apply(await this.api.action({ ...input, revision: this.snapshot().revision })); this.toast(message); return true; }
    catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) this.clearSession();
      else if (error instanceof HttpErrorResponse && error.status === 409) { try { this.apply(await this.api.state()); } catch { this.connected.set(false); } }
      else if (!(error instanceof HttpErrorResponse) || error.status === 0) this.connected.set(false);
      this.toast(this.errorMessage(error)); return false;
    } finally { this.busy.set(false); }
  }
  go(page: Page): void { if (this.busy()) return; void this.router.navigateByUrl(PAGE_PATHS[page]); this.page.set(page); if (page === 'organizadores') void this.loadOrganizers(); }
  openPlayer(): void { this.playerDialog()?.nativeElement.showModal(); }
  async addPlayer(): Promise<void> {
    if (await this.perform({type:'addPlayer',name:this.playerName.trim(),level:Number(this.playerLevel),position:this.playerPosition}, 'Jogador convocado!')) {
      this.playerName = ''; this.playerLevel = 3; this.playerPosition = ''; this.playerDialog()?.nativeElement.close();
    }
  }
  async updateLevel(id: string, value: number): Promise<void> { await this.perform({type:'updateLevel',id,level:Number(value)}, 'Nível atualizado.'); }
  async updatePosition(id: string, position: string): Promise<void> { await this.perform({type:'updatePosition',id,position}, 'Posição atualizada.'); }
  async removePlayer(id: string): Promise<void> { if (confirm('Excluir este jogador? O histórico dos outros jogadores será mantido.')) await this.perform({type:'removePlayer',id}, 'Jogador excluído.'); }
  select(id: string, checked: boolean): void { this.selected.update(ids => checked && !this.sortedPlayers().some(p=>p.id===id&&this.suspended(p)) ? [...ids, id] : ids.filter(p => p !== id)); }
  async draw(): Promise<void> {
    if(this.busy())return;
    if(![3,4].includes(Number(this.teamCount))){this.toast('Escolha 3 ou 4 times.');return;}
    if(this.state().drawOptions?.length&&!confirm('Gerar três novas opções? As opções atuais e a escolha da enquete serão substituídas.'))return;
    if(await this.perform({type:'generateDrawOptions',players:this.selected().filter(id=>this.sortedPlayers().some(p=>p.id===id&&!this.suspended(p))),count:Number(this.teamCount)}, 'Três opções salvas. Compartilhe no WhatsApp e escolha a vencedora após a votação.'))
      window.scrollTo({top:0,left:0,behavior:'smooth'});
  }
  async cancelDrawOptions(): Promise<void> {
    if (this.busy() || !confirm('Cancelar os sorteios gerados e a escolha da enquete?')) return;
    if (await this.perform({type: 'cancelDrawOptions'}, 'Sorteios cancelados.')) {
      this.showRegistration.set(false);
      this.showDrawShare.set(false);
    }
  }
  async chooseDrawOption(id: string): Promise<void> {
    if(await this.perform({type:'selectDrawOption',id}, 'Sorteio vencedor escolhido. Agora cadastre a pelada.'))
      this.showRegistration.set(!this.activeRental());
  }
  selectRental(id: string): void {
    this.selectedRentalId.set(id);this.clearPhoto();this.winnerSelection='';this.goalkeeperSelection='';
  }
  closeRental(): void {this.selectedRentalId.set('');this.clearPhoto();this.winnerSelection='';this.goalkeeperSelection='';}
  rentalResult(rental: Rental): string {
    if(rental.isHistorical)return 'Histórico importado · vencedor não identificado';
    if(rental.cancelledAt)return 'Pelada cancelada · ninguém conquista aluguel';
    if(!rental.finishedAt)return 'Em andamento';
    return rental.winnerTeamId?`${rental.teams.find(t=>t.id===rental.winnerTeamId)?.name} vencedor · 1 aluguel por jogador`:'Sem vencedor · ninguém conquista aluguel';
  }
  openManualRental(): void {
    this.manualRentalError.set('');
    this.showManualRental.set(true);
  }
  async addManualRental(input: ManualRentalInput): Promise<void> {
    if (!this.user() || this.busy()) return;
    this.manualRentalError.set('');
    if (await this.perform({type: 'addManualRental', ...input}, 'Aluguel salvo.')) {
      this.showManualRental.set(false);
      const rental = this.state().rentals.at(-1);
      if (rental) this.selectRental(rental.id);
    } else {
      this.manualRentalError.set(this.toastMessage());
    }
  }
  async startRental(): Promise<void> {
    if(await this.perform({type:'startRental',name:this.rentalName.trim(),playedOn:this.rentalDate,location:this.rentalLocation.trim() || null},'Pelada cadastrada com os times e o dia escolhido.')){
      this.showRegistration.set(false);this.selectRental(this.activeRental()!.id);this.go('partidas');
    }
  }
  async finishRental(): Promise<void> {
    const rental=this.currentRental();if(!rental||this.busy())return;
    if(!this.winnerSelection){this.toast('Escolha o time vencedor ou a opção sem vencedor.');return;}
    if(this.winnerSelection!=='none'&&!this.goalkeeperSelection){this.toast('Selecione quem jogou no gol e conquistou o aluguel.');return;}
    if(!this.selectedPhoto()&&!rental.photoId){this.toast('Adicione a foto do aluguel.');return;}
    if(this.selectedPhoto()&&!await this.savePhoto())return;
    await this.perform({type:'finishRental',rentalId:rental.id,winnerTeamId:this.winnerSelection==='none'?null:this.winnerSelection,noWinner:this.winnerSelection==='none',winningGoalkeeperId:this.winnerSelection==='none'?null:this.goalkeeperSelection||null},this.winnerSelection==='none'?'Resultado salvo sem vencedor. Ninguém conquista aluguel.':'Resultado salvo. Jogadores do time vencedor conquistam 1 aluguel.');
  }
  async addIncome(income:NewIncome,component:CashFlowComponent):Promise<void> {
    if(await this.perform({type:'addIncome',...income},'Entrada registrada.'))component.incomeSaved();
  }
  async addExpense(expense:NewExpense,component:CashFlowComponent):Promise<void> {
    if(await this.perform({type:'addExpense',...expense},'Gasto registrado.'))component.expenseSaved();
  }
  async openMonthlyFees(month:string): Promise<void> {
    await this.perform({type:'openMonthlyFees',month},'Mensalidades abertas: R$ 10,00 por jogador.');
  }
  async setMonthlyFeePayment(change:FeePaymentChange): Promise<void> {
    if(!change.paid&&!confirm(`Desfazer o pagamento de ${change.playerName} em ${change.month}? A mensalidade voltará a ficar pendente.`))return;
    await this.perform({type:'setMonthlyFeePayment',month:change.month,id:change.playerId,paid:change.paid},change.paid?'Pagamento registrado.':'Pagamento desfeito.');
  }
  async deleteRental(): Promise<void> {
    const rental=this.currentRental();if(!rental||this.busy())return;
    const message=rental.isHistorical?'O saldo inicial do Excel não será alterado.':'As conquistas deste aluguel serão retiradas do ranking.';
    if(confirm(`Apagar o aluguel "${rental.name}" e sua foto? ${message} Esta ação não pode ser desfeita.`))
      if(await this.perform({type:'deleteRental',rentalId:rental.id},'Aluguel apagado.'))this.closeRental();
  }
  async cancelRental(id?: string): Promise<void> {
    const rental=id?this.state().rentals.find(r=>r.id===id):this.currentRental();if(!rental||rental.finishedAt||this.busy())return;
    if(confirm(`Cancelar a pelada "${rental.name}"? Ninguém conquistará aluguel e você poderá cadastrar outra pelada.`))
      if(await this.perform({type:'cancelRental',rentalId:rental.id},'Pelada cancelada. Ninguém conquista aluguel.')){this.selectRental(rental.id);}
  }
  async reopenRental(): Promise<void> {
    const rental=this.currentRental();if(!rental)return;
    if(confirm('Corrigir o vencedor? A conquista deste aluguel será retirada do ranking até você salvar novamente.'))
      if(await this.perform({type:'reopenRental',rentalId:rental.id},'Escolha o vencedor correto e salve o resultado.'))this.winnerSelection='';this.goalkeeperSelection='';
  }
  private clearPhoto(): void {this.photoSelection++;this.preparingPhoto.set(false);this.photoError.set('');const url=this.photoPreview();if(url)URL.revokeObjectURL(url);this.photoPreview.set(null);this.selectedPhoto.set(null);}
  async choosePhoto(file: File|undefined): Promise<void> {
    if(!file)return;
    const rentalId=this.currentRental()?.id;
    const selection=++this.photoSelection;
    this.preparingPhoto.set(true);this.photoError.set('');
    try {
      const photo=await preparePhoto(file);
      if(selection!==this.photoSelection||rentalId!==this.currentRental()?.id)return;
      this.clearPhoto();this.selectedPhoto.set(photo);this.photoPreview.set(URL.createObjectURL(photo));
    } catch(error) {
      if(selection===this.photoSelection)this.photoError.set(error instanceof Error?error.message:'Não foi possível preparar a foto.');
    } finally {if(selection===this.photoSelection)this.preparingPhoto.set(false);}
  }

  async savePhoto(): Promise<boolean> {
    const file=this.selectedPhoto(),rental=this.currentRental();if(!file||!rental||this.busy()||this.preparingPhoto())return false;
    this.busy.set(true);this.photoError.set('');
    try{this.apply(await this.api.uploadPhoto(rental.id,file,this.snapshot().revision));this.clearPhoto();return true;}
    catch(error){if(error instanceof HttpErrorResponse&&error.status===409){try{this.apply(await this.api.state());}catch{this.connected.set(false);}}if(error instanceof HttpErrorResponse&&error.status===401)this.clearSession();this.photoError.set(this.errorMessage(error));return false;}
    finally{this.busy.set(false);}
  }
  export(data = this.state()): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'resenha-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async importBackup(file: File | undefined): Promise<void> {
    if (!file || !this.canImport()) return;
    if (file.size > 2 * 1024 * 1024) { this.toast('O arquivo deve ter até 2 MB.'); return; }
    try { const data: unknown = JSON.parse(await file.text()); await this.importData(data); }
    catch { this.toast('O arquivo não é um JSON válido.'); }
  }
  async importData(data: unknown): Promise<void> {
    if (confirm('Compartilhar os jogadores e resultados deste backup com todos os organizadores? O sorteio precisará ser refeito.'))
      await this.perform({type:'importLegacy',data}, 'Backup importado para a pelada compartilhada.');
  }
  async loadOrganizers(more = false): Promise<void> {
    if(this.activityLoading())return;
    const before=more?this.activity().at(-1)?.id:undefined;
    this.activityLoading.set(true);this.activityError.set(false);
    try {
      const result=await this.api.organizers(before);
      if(this.user()) {
        this.organizers.set(result.organizers);
        this.activity.update(items=>more?[...items,...result.activity]:result.activity);
        this.hasMoreActivity.set(result.hasMoreActivity);
      }
    } catch(error) {this.activityError.set(true);this.toast(this.errorMessage(error));}
    finally {this.activityLoading.set(false);}
  }
  async createInvite(): Promise<void> {
    if (this.busy()) return; this.busy.set(true);
    try { this.invitation.set(await this.api.invite()); await this.loadOrganizers(); }
    catch (error) { this.toast(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async copyInvite(): Promise<void> {
    try { await navigator.clipboard.writeText(this.invitationUrl()); this.toast('Link copiado!'); }
    catch { this.toast('Selecione o campo e copie o link do convite.'); }
  }
  openPasswordReset(organizer: Organizer): void {
    if(this.user()?.role!=='owner'||organizer.role==='owner'||!organizer.active||this.busy())return;
    this.passwordResetError.set('');this.passwordOrganizer.set(organizer);
  }
  async resetOrganizerPassword(password: string): Promise<void> {
    const organizer=this.passwordOrganizer();
    if(!organizer||this.user()?.role!=='owner'||this.busy())return;
    this.busy.set(true);this.passwordResetError.set('');
    try {
      await this.api.resetOrganizerPassword(organizer.id,password);
      this.passwordOrganizer.set(null);this.toast('Senha redefinida. O organizador deve entrar com a nova senha.');
      await this.loadOrganizers();
    } catch(error) {this.passwordResetError.set(this.errorMessage(error));}
    finally {this.busy.set(false);}
  }
  async removeOrganizer(id: string): Promise<void> {
    if (this.busy() || !confirm('Excluir a conta deste organizador? O histórico de ações será preservado.')) return;
    this.busy.set(true);
    try { await this.api.removeOrganizer(id); this.organizers.update(items => items.filter(item => item.id !== id)); await this.loadOrganizers(); this.toast('Organizador removido.'); }
    catch (error) { this.toast(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
}

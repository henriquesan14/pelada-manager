import { PlayerSuspensionDialogComponent, SuspensionChange } from './player-suspension-dialog.component';
import { PlayerFeesDialogComponent } from './player-fees-dialog.component';
import { CashFlowComponent, NewExpense, NewIncome } from './cash-flow.component';
import { FeePaymentChange, MonthlyFeesComponent } from './monthly-fees.component';
import { GroupRulesComponent } from './group-rules.component';
import { PlayerAutocompleteComponent } from './player-autocomplete.component';
import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { SwUpdate } from '@angular/service-worker';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { PAGE_PATHS, pageFromUrl } from './navigation';
import { ApiService } from './api.service';
import { Activity, emptyState, Invitation, isGoalkeeper, isPlayerSuspended, remainingSuspensionRentals, Player, Organizer, Page, PeladaState, PLAYER_POSITIONS, ranking, Rental, Session, Snapshot, User } from './models';
import { RankingComponent } from './ranking.component';
import { StarRatingComponent } from './star-rating.component';

@Component({ selector: 'app-pelada', imports: [FormsModule, DatePipe, NgTemplateOutlet, RankingComponent, StarRatingComponent, RouterLink, PlayerAutocompleteComponent, GroupRulesComponent, MonthlyFeesComponent, CashFlowComponent, PlayerFeesDialogComponent, PlayerSuspensionDialogComponent], templateUrl: './app.component.html' })
export class AppComponent {
  private readonly api = inject(ApiService);
  private readonly destroy = inject(DestroyRef);
  private readonly updates = inject(SwUpdate);
  private readonly router = inject(Router);
  readonly paths = PAGE_PATHS;
  readonly playerDialog = viewChild<ElementRef<HTMLDialogElement>>('playerDialog');
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
  readonly sortedPlayers = computed(() => [...this.state().players].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'pt-BR')));
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
  readonly selectedPhoto = signal<File|null>(null);
  readonly photoPreview = signal<string|null>(null);
  readonly currentPhotoUrl = computed(() => this.photoPreview() || (this.currentRental()?.photoId ? `/api/rentals/${this.currentRental()!.id}/photo?v=${this.snapshot().revision}` : null));
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
  readonly activity = signal<Activity[]>([]);
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
  rentalName = `Pelada de ${new Date().toLocaleDateString('pt-BR')}`;
  rentalLocation = '';
  rentalDate = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
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
      if(event instanceof NavigationEnd){this.page.set(pageFromUrl(event.urlAfterRedirects));if(this.page()==='organizadores'&&this.user())void this.loadOrganizers();if(!this.user()&&this.isPublicPage()&&!this.loading())void this.refresh(true);}
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
    const subscription = this.updates.versionUpdates.subscribe(event => { if (event.type === 'VERSION_READY') this.toast('Nova versão disponível. Reabra o app para atualizar.'); });
    this.destroy.onDestroy(() => {
      clearInterval(poll); clearTimeout(this.toastTimer); subscription.unsubscribe();
      this.clearPhoto();
      window.removeEventListener('online', online); window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visibility);
    });
    void this.bootstrap();
  }
  initials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }
  playerLabel(id: string): string { return this.state().players.find(p => p.id === id)?.name || 'Jogador removido'; }
  invitationUrl(): string { return `${location.origin}/#convite=${this.invitation()?.invite || ''}`; }
  toast(message: string): void { clearTimeout(this.toastTimer); this.toastMessage.set(message); this.toastTimer = setTimeout(() => this.toastMessage.set(''), 5000); }
  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status > 0) return (error.error as {error?: string})?.error || 'Não foi possível concluir a operação.';
    return 'Conexão interrompida. Confira os dados ao reconectar antes de tentar novamente.';
  }
  private clearSession(): void {
    this.user.set(null); this.snapshot.set({ revision: -1, state: emptyState() }); this.selected.set([]);
    this.organizers.set([]); this.activity.set([]); this.invitation.set(null); this.connected.set(false);
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
    } catch { this.session.set(null); this.clearSession(); }
    finally { this.loading.set(false); }
  }
  async authenticate(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.authError.set('');
    try {
      const result = this.authMode() === 'login' ? await this.api.login(this.auth) : await this.api.register(this.auth);
      this.user.set(result.user); this.auth.password = ''; this.auth.setupToken = ''; this.auth.invite = '';
      this.apply(await this.api.state());
    } catch (error) { this.authError.set(this.errorMessage(error)); if (this.user()) this.clearSession(); }
    finally { this.busy.set(false); }
  }
  async logout(): Promise<void> {
    if (this.busy()) return;
    try { await this.api.logout(); this.clearSession(); this.go('inicio'); }
    catch (error) { this.toast(this.errorMessage(error)); }
  }
  async refresh(force = false): Promise<void> {
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
  go(page: Page): void { if (this.busy()) return; void this.router.navigateByUrl(PAGE_PATHS[page]); this.page.set(page); window.scrollTo(0, 0); if (page === 'organizadores') void this.loadOrganizers(); }
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
    await this.perform({type:'generateDrawOptions',players:this.selected().filter(id=>this.sortedPlayers().some(p=>p.id===id&&!this.suspended(p))),count:Number(this.teamCount)}, 'Três opções salvas. Compartilhe no WhatsApp e escolha a vencedora após a votação.');
  }
  async chooseDrawOption(id: string): Promise<void> {
    await this.perform({type:'selectDrawOption',id}, 'Sorteio vencedor escolhido. Agora cadastre a pelada.');
  }
  whatsappDrawText(): string {
    const lines=['⚽ Enquete dos sorteios da pelada','Vote no grupo: Sorteio 1, Sorteio 2 ou Sorteio 3.',''];
    for(const option of this.state().drawOptions || []){
      lines.push(`*Sorteio ${option.number}*`);
      for(const team of option.teams)lines.push(`${team.name}: ${team.players.map(id=>this.playerLabel(id)).join(', ')}`);
      lines.push('');
    }
    lines.push('Crie a enquete no WhatsApp com as três opções.');return lines.join('\n');
  }
  whatsappDrawUrl(): string {return `https://wa.me/?text=${encodeURIComponent(this.whatsappDrawText())}`;}
  async copyDrawOptions(): Promise<void> {
    try{await navigator.clipboard.writeText(this.whatsappDrawText());this.toast('As três opções foram copiadas. Cole no grupo e crie a enquete.');}
    catch{this.toast('Não foi possível copiar. Use Compartilhar no WhatsApp.');}
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
  async startRental(): Promise<void> {
    if(await this.perform({type:'startRental',name:this.rentalName.trim(),playedOn:this.rentalDate,location:this.rentalLocation.trim() || null},'Pelada cadastrada com os times e o dia escolhido.')){
      this.selectRental(this.activeRental()!.id);this.go('partidas');
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
  private clearPhoto(): void {const url=this.photoPreview();if(url)URL.revokeObjectURL(url);this.photoPreview.set(null);this.selectedPhoto.set(null);}
  async choosePhoto(file: File|undefined): Promise<void> {
    if(!file)return;
    const rentalId=this.currentRental()?.id;
    if(file.size>8*1024*1024){this.toast('Escolha uma foto de até 8 MB.');return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){this.toast('Escolha uma foto JPEG, PNG ou WebP.');return;}
    try {const image=await createImageBitmap(file);image.close();}catch{this.toast('Não foi possível abrir esta foto. Escolha outra imagem.');return;}
    if(rentalId!==this.currentRental()?.id)return;
    this.clearPhoto();this.selectedPhoto.set(file);this.photoPreview.set(URL.createObjectURL(file));
  }
  async savePhoto(): Promise<boolean> {
    const file=this.selectedPhoto(),rental=this.currentRental();if(!file||!rental||this.busy())return false;
    this.busy.set(true);
    try{this.apply(await this.api.uploadPhoto(rental.id,file,this.snapshot().revision));this.clearPhoto();return true;}
    catch(error){if(error instanceof HttpErrorResponse&&error.status===409){try{this.apply(await this.api.state());}catch{this.connected.set(false);}}if(error instanceof HttpErrorResponse&&error.status===401)this.clearSession();this.toast(this.errorMessage(error));return false;}
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
  async loadOrganizers(): Promise<void> {
    try { const result = await this.api.organizers(); if (this.user()) { this.organizers.set(result.organizers); this.activity.set(result.activity); } }
    catch (error) { this.toast(this.errorMessage(error)); }
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
  async revoke(id: string): Promise<void> {
    if (this.busy() || !confirm('Remover o acesso deste organizador e encerrar suas sessões?')) return;
    this.busy.set(true);
    try { await this.api.revoke(id); await this.loadOrganizers(); this.toast('Acesso removido.'); }
    catch (error) { this.toast(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
}

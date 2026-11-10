import { Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatCalendarDate, saoPauloToday } from './dates';
import { Player } from './models';
import { PlayerAutocompleteComponent } from './player-autocomplete.component';

export interface ManualRentalInput {
  name: string;
  playedOn: string;
  location: string;
  players: string[];
  winningGoalkeeperId: string | null;
}

@Component({
  selector: 'app-manual-rental-dialog',
  imports: [FormsModule, PlayerAutocompleteComponent],
  styles: ['.selection { max-height: 13rem; overflow-y: auto; }'],
  template: `
    <dialog #dialog class="registration-dialog" aria-labelledby="manual-rental-title"
      (cancel)="busy() ? $event.preventDefault() : close.emit()" (close)="close.emit()">
      <div class="section-heading">
        <h2 id="manual-rental-title">Incluir aluguel manualmente</h2>
        <button type="button" class="icon-button" aria-label="Fechar" [disabled]="busy()" (click)="close.emit()">×</button>
      </div>
      <form #form="ngForm" (ngSubmit)="form.valid && selected.size && submit()">
        <fieldset [disabled]="busy()">
          <label>Nome da pelada<input name="name" [(ngModel)]="name" required maxlength="50"></label>
          <label>Dia da pelada<input name="playedOn" type="date" [(ngModel)]="playedOn" required></label>
          <label>Local<input name="location" [(ngModel)]="location" maxlength="120"></label>
          <h3>Jogadores vencedores ({{selected.size}})</h3>
          <label>Filtrar por nome<input name="search" type="search" [(ngModel)]="search"></label>
          <div class="selection">
            @for (player of filteredPlayers; track player.id) {
              <label class="select-player"><input type="checkbox" [checked]="selected.has(player.id)"
                (change)="toggle(player.id, $any($event.target).checked)"><strong>{{player.name}}</strong></label>
            } @empty {<p>Nenhum jogador encontrado.</p>}
          </div>
          <app-player-autocomplete [players]="players()" [(value)]="goalkeeperId" [disabled]="busy()" />
          <p>O goleiro é opcional. Cada vencedor ganha 1 aluguel. Você pode adicionar a foto após salvar.</p>
          @if (error()) {<p role="alert">{{error()}}</p>}
          <button class="primary" type="submit" [disabled]="!form.valid || !selected.size">{{busy() ? 'Salvando…' : 'Salvar aluguel'}}</button>
        </fieldset>
      </form>
    </dialog>
  `
})
export class ManualRentalDialogComponent {
  readonly players = input.required<Player[]>();
  readonly busy = input(false);
  readonly error = input('');
  readonly save = output<ManualRentalInput>();
  readonly close = output<void>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly selected = new Set<string>();
  playedOn = saoPauloToday();
  name = `Pelada de ${formatCalendarDate(this.playedOn)}`;
  location = '';
  search = '';
  goalkeeperId = '';

  constructor() {
    effect(onCleanup => {
      const dialog = this.dialog().nativeElement;
      const overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      onCleanup(() => {
        if (dialog.open) dialog.close();
        document.body.style.overflow = overflow;
      });
    });
  }

  get filteredPlayers(): Player[] {
    const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
    const term = normalize(this.search.trim());
    return this.players().filter(player => normalize(player.name).includes(term));
  }

  toggle(id: string, checked: boolean): void {
    if (checked) this.selected.add(id);
    else this.selected.delete(id);
  }

  submit(): void {
    this.save.emit({name: this.name.trim(), playedOn: this.playedOn, location: this.location.trim(),
      players: [...this.selected], winningGoalkeeperId: this.goalkeeperId || null});
  }
}

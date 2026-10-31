import { Component, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Player } from './models';
export interface SuspensionChange {id:string;suspensionUntil?:string;suspensionRentals?:number;}
@Component({selector:'app-player-suspension-dialog',imports:[FormsModule],template:`
<dialog #dialog aria-labelledby="suspension-title" (cancel)="busy() ? $event.preventDefault() : close.emit()" (close)="close.emit()">
  <div class="section-heading"><h2 id="suspension-title">Suspender {{player().name}}</h2><button type="button" class="icon-button" [disabled]="busy()" aria-label="Fechar" (click)="close.emit()">×</button></div>
  <form #form="ngForm" (ngSubmit)="form.valid && submit()"><fieldset [disabled]="busy()">
    <label>Tipo de suspensão<select name="type" [ngModel]="type()" (ngModelChange)="type.set($event)"><option value="date">Até uma data</option><option value="rentals">Quantidade de peladas</option></select></label>
    @if(type()==='date') {<label>Suspenso até (inclusive)<input name="until" type="date" [(ngModel)]="until" [min]="today" required></label>}
    @else {<p>Cada nova pelada cadastrada desconta 1. Cancelar ou apagar a pelada devolve a quantidade.</p><label>Quantidade de peladas<input name="count" type="number" [(ngModel)]="count" min="1" max="1000" step="1" required></label>}
    <p>O jogador fica impedido de participar dos sorteios enquanto estiver suspenso. Salvar uma suspensão substitui a anterior e limpa o sorteio em preparação.</p>
    <button type="submit" class="primary" [disabled]="!form.valid">{{busy() ? 'Salvando…' : 'Salvar suspensão'}}</button>
  </fieldset></form>
</dialog>`})
export class PlayerSuspensionDialogComponent {
  readonly player=input.required<Player>();readonly busy=input(false);readonly save=output<SuspensionChange>();readonly close=output<void>();
  readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('dialog');readonly type=signal<'date'|'rentals'>('date');
  readonly today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});until=this.today;count=1;
  submit():void {if(this.busy())return;this.save.emit(this.type()==='date'?{id:this.player().id,suspensionUntil:this.until}:{id:this.player().id,suspensionRentals:this.count});}
  constructor(){effect(onCleanup=>{const dialog=this.dialog()?.nativeElement;if(!dialog)return;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;});});}
}

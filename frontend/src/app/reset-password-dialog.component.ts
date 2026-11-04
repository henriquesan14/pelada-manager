import { Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Organizer } from './models';

@Component({selector:'app-reset-password-dialog',imports:[FormsModule],template:`
<dialog #dialog aria-labelledby="reset-password-title" (cancel)="busy() ? $event.preventDefault() : close.emit()" (close)="close.emit()">
  <div class="section-heading"><h2 id="reset-password-title">Redefinir senha de {{organizer().name}}</h2><button type="button" class="icon-button" aria-label="Fechar" [disabled]="busy()" (click)="close.emit()">×</button></div>
  <p>As sessões deste organizador serão encerradas. Informe a nova senha a ele após salvar.</p>
  <form #form="ngForm" (ngSubmit)="form.valid && password===confirmation && save.emit(password)"><fieldset [disabled]="busy()">
    <label>Nova senha (mínimo de 6 caracteres)<input name="newPassword" type="password" [(ngModel)]="password" required minlength="6" maxlength="128" autocomplete="new-password"></label>
    <label>Confirmar nova senha<input name="confirmPassword" type="password" [(ngModel)]="confirmation" required maxlength="128" autocomplete="new-password"></label>
    @if(confirmation && password!==confirmation) {<p role="alert">As senhas não coincidem.</p>}
    @if(error()) {<p role="alert">{{error()}}</p>}
    <button class="primary" type="submit" [disabled]="!form.valid || password!==confirmation">{{busy() ? 'Salvando…' : 'Redefinir senha'}}</button>
  </fieldset></form>
</dialog>`})
export class ResetPasswordDialogComponent {
  readonly organizer=input.required<Organizer>();
  readonly busy=input(false);
  readonly error=input('');
  readonly save=output<string>();
  readonly close=output<void>();
  readonly dialog=viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  password='';confirmation='';
  constructor(){effect(onCleanup=>{
    const dialog=this.dialog().nativeElement;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
    onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;this.password='';this.confirmation='';});
  });}
}

import { Component, computed, effect, input, output, signal } from '@angular/core';
import { Player } from './models';

let nextId = 0;
@Component({
  selector: 'app-player-autocomplete',
  template: `<div class="player-autocomplete"><label [for]="id">Goleiro que conquistou o aluguel</label>
    <input [id]="id" role="combobox" aria-autocomplete="list" [attr.aria-expanded]="opened()"
      [attr.aria-controls]="id + '-list'" [attr.aria-activedescendant]="opened() && matches().length ? id + '-option-' + active() : null"
      [value]="query()" [disabled]="disabled()" placeholder="Digite e selecione o nome do jogador" autocomplete="off"
      (input)="search($any($event.target).value)" (focus)="opened.set(true)" (blur)="opened.set(false)" (keydown)="key($event)">
    @if(opened()) {<ul [id]="id + '-list'" role="listbox" aria-label="Jogadores">
      @for(player of matches(); track player.id; let i=$index) {<li role="option" [id]="id + '-option-' + i" [attr.aria-selected]="value() === player.id" [class.highlighted]="i === active()" (mousedown)="$event.preventDefault()" (click)="choose(player)">{{player.name}}</li>}
      @empty {<li role="presentation">Nenhum jogador encontrado</li>}
    </ul>}
  </div>`
})
export class PlayerAutocompleteComponent {
  readonly players = input.required<Player[]>();
  readonly value = input('');
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  readonly id = `goalkeeper-${++nextId}`;
  readonly query = signal('');
  readonly opened = signal(false);
  readonly active = signal(0);
  readonly matches = computed(()=>{
    const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const term=this.value() ? '' : normalize(this.query().trim());
    return this.players().filter(p=>normalize(p.name).includes(term));
  });
  constructor(){effect(()=>{const player=this.players().find(p=>p.id===this.value());if(player)this.query.set(player.name);});}
  search(text:string):void {this.query.set(text);this.valueChange.emit('');this.opened.set(true);this.active.set(0);}
  choose(player:Player):void {this.query.set(player.name);this.valueChange.emit(player.id);this.opened.set(false);}
  key(event:KeyboardEvent):void {
    if(event.key==='Escape'){this.opened.set(false);event.preventDefault();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();this.opened.set(true);
      this.active.update(i=>Math.max(0,Math.min(this.matches().length-1,i+(event.key==='ArrowDown'?1:-1))));
    }
    if(event.key==='Enter'&&this.opened()){
      event.preventDefault();const player=this.matches()[this.active()];if(player)this.choose(player);
    }
  }
}

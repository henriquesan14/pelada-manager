import { Component, effect, ElementRef, inject, InjectionToken, input, output, signal, viewChild } from '@angular/core';
import { DrawOption, Player } from './models';
import { createDrawImages, DrawImage } from './draw-images';

export const DRAW_IMAGE_GENERATOR=new InjectionToken<typeof createDrawImages>('DRAW_IMAGE_GENERATOR',{providedIn:'root',factory:()=>createDrawImages});

@Component({selector:'app-draw-share-dialog',template:`
<dialog #dialog class="rental-dialog" aria-labelledby="draw-share-title" (cancel)="sharing() ? $event.preventDefault() : close.emit()" (close)="close.emit()">
  <div class="rental-dialog-toolbar"><h2 id="draw-share-title">Imagens dos sorteios</h2><button type="button" class="text-button" [disabled]="sharing()" (click)="close.emit()" autofocus>Fechar ✕</button></div>
  <div class="card rental-detail-content">
    @if(loading()) {<p role="status">Gerando imagens dos times…</p>}
    @if(error()) {<p role="alert">{{error()}}</p>}
    @if(images().length) {
      @if(canShare()) {<button type="button" class="primary" [disabled]="sharing()" (click)="share()">{{sharing() ? 'Compartilhando…' : 'Compartilhar imagens'}}</button><p>Escolha o WhatsApp na lista de aplicativos para enviar as três imagens.</p>}
      @else {<p>Baixe as imagens abaixo e anexe no grupo do WhatsApp.</p>}
      @for(image of images(); track image.number) {<section class="history-card"><div class="section-heading"><h3>Sorteio {{image.number}}</h3><a class="text-button" [href]="image.url" [download]="image.file.name">Baixar imagem</a></div><img class="rental-photo" [src]="image.url" [alt]="'Times do Sorteio ' + image.number"></section>}
    }
  </div>
</dialog>`})
export class DrawShareDialogComponent {
  private readonly generateImages=inject(DRAW_IMAGE_GENERATOR);
  readonly options=input.required<DrawOption[]>();readonly players=input.required<Player[]>();readonly close=output<void>();
  readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('dialog');readonly images=signal<DrawImage[]>([]);readonly loading=signal(true);readonly error=signal('');readonly sharing=signal(false);readonly canShare=signal(false);
  constructor(){
    effect(onCleanup=>{const dialog=this.dialog()?.nativeElement;if(!dialog)return;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();onCleanup(()=>{if(dialog.open)dialog.close();document.body.style.overflow=overflow;});});
    effect(onCleanup=>{
      const options=this.options();const players=this.players();let disposed=false;let generated:DrawImage[]=[];
      this.loading.set(true);this.images.set([]);this.error.set('');
      void this.generateImages(options,players).then(images=>{generated=images;if(disposed){images.forEach(image=>URL.revokeObjectURL(image.url));return;}this.images.set(images);this.canShare.set(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:images.map(image=>image.file)}));}).catch(()=>{if(!disposed)this.error.set('Não foi possível gerar as imagens. Feche e tente novamente.');}).finally(()=>{if(!disposed)this.loading.set(false);});
      onCleanup(()=>{disposed=true;generated.forEach(image=>URL.revokeObjectURL(image.url));});
    });
  }
  async share():Promise<void>{
    if(this.sharing()||!this.images().length)return;this.sharing.set(true);this.error.set('');
    try{await navigator.share({files:this.images().map(image=>image.file)});}
    catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))this.error.set('Não foi possível compartilhar. Use Baixar imagem e anexe os arquivos no WhatsApp.');}
    finally{this.sharing.set(false);}
  }
}

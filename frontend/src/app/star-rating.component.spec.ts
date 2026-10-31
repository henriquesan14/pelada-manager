import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StarRatingComponent } from './star-rating.component';

describe('estrelas do jogador', () => {
  it('oferece dez avaliações e permite selecionar meia estrela', async () => {
    await TestBed.configureTestingModule({imports:[StarRatingComponent]}).compileComponents();
    const fixture=TestBed.createComponent(StarRatingComponent);
    fixture.componentRef.setInput('value',1.5);
    fixture.detectChanges();
    const element=fixture.nativeElement as HTMLElement;
    const radios=element.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(10);
    expect(element.querySelectorAll('.star-full').length).toBe(1);
    expect(element.querySelectorAll('.star-half').length).toBe(1);
    expect(element.textContent).toContain('1,5 / 5');
    let selected=0;
    fixture.componentInstance.valueChange.subscribe(value=>selected=value);
    radios[0].click();
    expect(selected).toBe(0.5);
    fixture.destroy();
  });
  it('mostra as estrelas sem controles no sorteio', async () => {
    await TestBed.configureTestingModule({imports:[StarRatingComponent]}).compileComponents();
    const fixture=TestBed.createComponent(StarRatingComponent);
    fixture.componentRef.setInput('value',4.5);
    fixture.componentRef.setInput('readonly',true);
    fixture.detectChanges();
    const element=fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('input').length).toBe(0);
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('4,5 de 5 estrelas');
    fixture.destroy();
  });
});

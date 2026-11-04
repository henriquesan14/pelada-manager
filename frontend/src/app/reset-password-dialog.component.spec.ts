import { TestBed } from '@angular/core/testing';
import { beforeAll, expect, it } from 'vitest';
import { ResetPasswordDialogComponent } from './reset-password-dialog.component';

beforeAll(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;};
});
it('exige confirmação da nova senha e bloqueia o envio enquanto salva',async()=>{
  const fixture=TestBed.createComponent(ResetPasswordDialogComponent);
  fixture.componentRef.setInput('organizer',{id:'o',name:'Outro',nick:'outro',role:'organizer',active:true});
  fixture.detectChanges();await fixture.whenStable();
  const app=fixture.componentInstance;const values:string[]=[];app.save.subscribe(value=>values.push(value));
  const root=fixture.nativeElement as HTMLElement;
  const fill=async(name:string,value:string)=>{const input=root.querySelector(`input[name=${name}]`) as HTMLInputElement;input.value=value;input.dispatchEvent(new Event('input'));await fixture.whenStable();fixture.detectChanges();};
  await fill('newPassword','654321');await fill('confirmPassword','123456');
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('não coincidem');
  expect((root.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  await fill('confirmPassword','654321');
  (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
  expect(values).toEqual(['654321']);
  fixture.componentRef.setInput('busy',true);fixture.detectChanges();
  expect((root.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  fixture.destroy();expect(app.password).toBe('');expect(app.confirmation).toBe('');
});

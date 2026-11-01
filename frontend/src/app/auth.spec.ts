import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { NEVER } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { ApiService } from './api.service';
import { emptyState } from './models';

describe('acesso por nick', () => {
  async function setup(needsSetup: boolean) {
    const api = {
      session: vi.fn().mockResolvedValue({user:null,needsSetup,setupEnabled:true}),
      state: vi.fn().mockResolvedValue({revision:0,state:emptyState()}),
      login: vi.fn().mockResolvedValue({user:{id:'1',name:'Rico',nick:'rico10',role:'owner'}}),
      register: vi.fn().mockResolvedValue({user:{id:'1',name:'Rico',nick:'rico10',role:'owner'}})
    };
    await TestBed.configureTestingModule({imports:[AppComponent],providers:[provideRouter([{path:"**",children:[]}]),
      {provide:ApiService,useValue:api}, {provide:SwUpdate,useValue:{versionUpdates:NEVER}}
    ]}).compileComponents();
    const fixture=TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return {fixture,api};
  }
  it('exibe nick e envia o nick no login, sem pedir e-mail', async () => {
    const {fixture,api}=await setup(false);
    const form=fixture.nativeElement as HTMLElement;
    expect(form.querySelector('input[name="nick"]')).not.toBeNull();
    expect(form.querySelector('input[type="email"]')).toBeNull();
    fixture.componentInstance.auth.nick='rico10';
    fixture.componentInstance.auth.password='Synthetic-password-123';
    await fixture.componentInstance.authenticate();
    expect(api.login).toHaveBeenCalledWith(expect.objectContaining({nick:'rico10'}));
    expect(api.login.mock.calls[0][0]).not.toHaveProperty('email');
    fixture.destroy();
  });
  it('tenta recuperar a sessão quando o servidor fica indisponível durante um deploy',async()=>{
    const{fixture,api}=await setup(false);const app=fixture.componentInstance;
    app.session.set(null);api.session.mockRejectedValueOnce(new HttpErrorResponse({status:503}));
    await app.bootstrap();fixture.detectChanges();expect(fixture.nativeElement.querySelector('input[type="password"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Reconectando ao servidor');
    api.session.mockResolvedValueOnce({user:{id:'1',name:'Rico',nick:'rico10',role:'owner'},needsSetup:false,setupEnabled:true} as any);
    await app.refresh(true);expect(app.user()?.nick).toBe('rico10');expect(api.login).not.toHaveBeenCalled();fixture.destroy();
  });
  it('usa nick também no cadastro inicial', async () => {
    const {fixture,api}=await setup(true);
    expect(fixture.componentInstance.authMode()).toBe('setup');
    fixture.componentInstance.auth.nick='rico10';
    fixture.componentInstance.auth.name='Rico';
    fixture.componentInstance.auth.password='Synthetic-password-123';
    await fixture.componentInstance.authenticate();
    expect(api.register).toHaveBeenCalledWith(expect.objectContaining({nick:'rico10',name:'Rico'}));
    expect(api.register.mock.calls[0][0]).not.toHaveProperty('email');
    fixture.destroy();
  });
});

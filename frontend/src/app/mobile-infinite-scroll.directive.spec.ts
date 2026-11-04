import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { MobileInfiniteScrollDirective } from './mobile-infinite-scroll.directive';

@Component({imports:[MobileInfiniteScrollDirective],template:'<div appMobileInfiniteScroll (reached)="calls=calls+1"></div>'})
class Host {calls=0;}

afterEach(()=>vi.unstubAllGlobals());
it('carrega ao chegar ao fim no mobile e desconecta ao sair da tela',()=>{
  let callback:IntersectionObserverCallback=()=>{};
  const observe=vi.fn(),disconnect=vi.fn(),removeEventListener=vi.fn();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener}));
  vi.stubGlobal('IntersectionObserver',class {observe=observe;disconnect=disconnect;constructor(cb:IntersectionObserverCallback){callback=cb;}});
  const fixture=TestBed.createComponent(Host);fixture.detectChanges();
  expect(observe).toHaveBeenCalledOnce();
  callback([{isIntersecting:false}] as IntersectionObserverEntry[],{} as IntersectionObserver);
  expect(fixture.componentInstance.calls).toBe(0);
  callback([{isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver);
  expect(fixture.componentInstance.calls).toBe(1);
  fixture.destroy();expect(removeEventListener).toHaveBeenCalled();expect(disconnect).toHaveBeenCalled();
});
it('não carrega automaticamente no desktop',()=>{
  const observe=vi.fn();
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  vi.stubGlobal('IntersectionObserver',class {observe=observe;disconnect=vi.fn();});
  const fixture=TestBed.createComponent(Host);fixture.detectChanges();
  expect(observe).not.toHaveBeenCalled();expect(fixture.componentInstance.calls).toBe(0);fixture.destroy();
});

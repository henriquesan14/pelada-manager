import { AfterViewInit, DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

@Directive({selector:'[appMobileInfiniteScroll]'})
export class MobileInfiniteScrollDirective implements AfterViewInit {
  readonly reached = output<void>();
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly destroy = inject(DestroyRef);

  ngAfterViewInit(): void {
    if(typeof IntersectionObserver==='undefined')return;
    const mobile=window.matchMedia('(max-width: 650px)');
    const observer=new IntersectionObserver(entries=>{
      if(mobile.matches && entries.some(entry=>entry.isIntersecting)) {
        observer.disconnect();
        this.reached.emit();
      }
    },{rootMargin:'0px 0px 200px 0px'});
    const observe=()=>{observer.disconnect();if(mobile.matches)observer.observe(this.element.nativeElement);};
    observe();mobile.addEventListener('change',observe);
    this.destroy.onDestroy(()=>{observer.disconnect();mobile.removeEventListener('change',observe);});
  }
}

import { ActivatedRouteSnapshot, BaseRouteReuseStrategy, Routes } from '@angular/router';
import { AppComponent } from './app.component';

export const routes: Routes = [
  {path: '', redirectTo: 'inicio', pathMatch: 'full'},
  ...['inicio','jogadores','sorteio','alugueis','ranking','organizadores','regras','mensalidades','financeiro'].map(path => ({path, component: AppComponent})),
  {path: 'partidas', redirectTo: 'alugueis', pathMatch: 'full'},
  {path: '**', redirectTo: 'inicio'}
];

// Keep the shared session and draft while navigating between application pages.
export class PeladaRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    return (future.routeConfig?.component === AppComponent && current.routeConfig?.component === AppComponent)
      || super.shouldReuseRoute(future, current);
  }
}

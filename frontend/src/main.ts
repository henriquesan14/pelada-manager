import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, RouteReuseStrategy, withInMemoryScrolling } from '@angular/router';
import { RootComponent } from './app/root.component';
import { PeladaRouteReuseStrategy, routes } from './app/app.routes';

bootstrapApplication(RootComponent, { providers: [provideRouter(routes, withInMemoryScrolling({scrollPositionRestoration: 'top'})), {provide: RouteReuseStrategy, useClass: PeladaRouteReuseStrategy}, provideHttpClient(), provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })] }).catch(console.error);

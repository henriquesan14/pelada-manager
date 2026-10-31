import { Page } from './models';

export const PAGE_PATHS: Record<Page, string> = {
  inicio: '/inicio', jogadores: '/jogadores', sorteio: '/sorteio',
  partidas: '/alugueis', ranking: '/ranking', organizadores: '/organizadores', regras: '/regras'
};
export function pageFromUrl(url: string): Page {
  const path = url.split(/[?#]/)[0];
  return (Object.keys(PAGE_PATHS) as Page[]).find(page => PAGE_PATHS[page] === path) || 'inicio';
}

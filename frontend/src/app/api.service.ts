import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { Activity, Invitation, Organizer, Session, Snapshot, User } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api/${path}`, { withCredentials: true }).pipe(timeout(10000)));
  }
  private post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(`/api/${path}`, body, { withCredentials: true, headers: { 'X-Resenha-Client': '1' } }).pipe(timeout(10000)));
  }
  session = () => this.get<Session>('session');
  state = () => this.get<Snapshot>('state');
  publicState = () => this.get<Snapshot>('public/state');
  login = (input: unknown) => this.post<{user: User}>('login', input);
  register = (input: unknown) => this.post<{user: User}>('register', input);
  logout = () => this.post('logout', {});
  action = (input: unknown) => this.post<Snapshot>('actions', input);
  uploadPhoto(id: string, photo: File, revision: number): Promise<Snapshot> {
    const form=new FormData();form.append('photo',photo);form.append('revision',String(revision));
    return firstValueFrom(this.http.post<Snapshot>(`/api/rentals/${encodeURIComponent(id)}/photo`,form,{withCredentials:true,headers:{'X-Resenha-Client':'1'}}).pipe(timeout(60000)));
  }
  invite = () => this.post<Invitation>('invites', {});
  organizers = (before?: number) => this.get<{organizers: Organizer[]; activity: Activity[]; hasMoreActivity: boolean}>(`organizers${before === undefined ? '' : '?before=' + before}`);
  revoke = (id: string) => this.post('revoke', { id });
}

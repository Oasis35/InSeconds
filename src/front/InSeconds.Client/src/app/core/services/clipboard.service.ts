import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  // navigator.clipboard.writeText peut rejeter (permission refusée, contexte non sécurisé) :
  // le Promise<boolean> évite au caller de gérer un rejet non catché.
  copy(text: string): Promise<boolean> {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
}

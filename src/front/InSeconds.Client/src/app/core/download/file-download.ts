import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * Enregistre un fichier construit par l'app (la copie des données du joueur) : un lien vers une
 * adresse `blob:` cliqué puis retiré. Le navigateur l'enregistre sous `fileName`, sans quitter la page.
 */
@Injectable({ providedIn: 'root' })
export class FileDownload {
  private readonly document = inject(DOCUMENT);

  saveText(fileName: string, text: string, type = 'application/json'): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    this.document.body.append(link);
    link.click();
    link.remove();
    // Libérée un peu plus tard : certains navigateurs lisent l'adresse après le clic.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

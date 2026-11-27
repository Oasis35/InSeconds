/** Le navigateur demande d'économiser les données (Chrome sur Android) : rien de confort n'est téléchargé ni calculé d'avance. */
export function isSavingData(): boolean {
  return (globalThis.navigator as { connection?: { saveData?: boolean } } | undefined)?.connection?.saveData === true;
}

/** Un appareil connecté au compte, tel que l'affiche la liste du profil. */
export interface Device {
  readonly id: number;
  /** « Chrome · Android », déjà sans langue côté back ; `null` si l'appareil n'a pas d'étiquette. */
  readonly label: string | null;
  readonly lastSeenAt: Date;
  /** L'appareil qui fait cette requête (celui dont le cookie est présenté). */
  readonly isCurrent: boolean;
}

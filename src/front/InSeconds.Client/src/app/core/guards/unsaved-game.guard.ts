import { CanDeactivateFn } from '@angular/router';

export interface UnsavedGameComponent {
  canDeactivate(): boolean | Promise<boolean>;
}

export const unsavedGameGuard: CanDeactivateFn<UnsavedGameComponent> = (component) =>
  component.canDeactivate();

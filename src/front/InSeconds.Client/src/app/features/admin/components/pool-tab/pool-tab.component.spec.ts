import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { PoolTabComponent } from './pool-tab.component';
import { AdminPoolService } from '../../services/admin-pool.service';

// Pas de fixture (pas besoin de TranslateService) : seule la synchronisation page ↔ adresse est
// testée ici, comme dans players-tab.component.spec.ts.
describe('PoolTabComponent — page de la grille dans l\'adresse', () => {
  let navigate: Mock;
  let pool: { allTracksPage: ReturnType<typeof signal<number>>; poolTracksLoaded: ReturnType<typeof signal<boolean>>; setPage: Mock };

  function create(page?: string): void {
    navigate = vi.fn().mockName('navigate').mockResolvedValue(true);
    pool = {
      allTracksPage: signal(0),
      poolTracksLoaded: signal(false),
      setPage: vi.fn().mockName('setPage'),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminPoolService, useValue: pool },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(page ? { page } : {}) } } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    TestBed.runInInjectionContext(() => new PoolTabComponent());
  }

  it('reprend la page de l\'adresse (numérotée à partir de 1)', () => {
    create('3');
    expect(pool.setPage).toHaveBeenCalledWith(2);
  });

  it('ignore une page absente ou invalide', () => {
    create('abc');
    expect(pool.setPage).not.toHaveBeenCalled();
  });

  it('n\'écrit pas l\'adresse tant que le pool n\'est pas chargé', () => {
    create('3');
    TestBed.tick();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('écrit la page dans l\'adresse une fois le pool chargé, sans empiler d\'historique', () => {
    create();
    pool.poolTracksLoaded.set(true);
    pool.allTracksPage.set(2);
    TestBed.tick();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { page: 3 },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }));
  });

  it('retire le paramètre sur la première page', () => {
    create();
    pool.poolTracksLoaded.set(true);
    TestBed.tick();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { page: null } }));
  });
});

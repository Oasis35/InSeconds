import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { adminRoutes } from './admin.routes';

@Component({ template: '' })
class ShellStubComponent {}

// Anciennes adresses `/admin?tab=…` (avant les routes enfants) : redirigées vers `/admin/<onglet>`.
describe('adminRoutes', () => {
  async function navigate(url: string): Promise<string> {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'admin', component: ShellStubComponent, children: adminRoutes }])],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  }

  it('/admin ouvre le dashboard', async () => {
    expect(await navigate('/admin')).toBe('/admin/dashboard');
  });

  it('/admin?tab=pool redirige vers /admin/pool', async () => {
    expect(await navigate('/admin?tab=pool')).toBe('/admin/pool');
  });

  it('/admin?tab=inconnu retombe sur le dashboard', async () => {
    expect(await navigate('/admin?tab=inconnu')).toBe('/admin/dashboard');
  });

  it('un onglet inconnu retombe sur le dashboard', async () => {
    expect(await navigate('/admin/nimporte-quoi')).toBe('/admin/dashboard');
  });
});

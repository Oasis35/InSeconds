import { HttpInterceptorFn } from '@angular/common/http';

const ADMIN_TOKEN_KEY = 'admin_token';

export const adminAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/admin')) return next(req);

  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) return next(req);

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

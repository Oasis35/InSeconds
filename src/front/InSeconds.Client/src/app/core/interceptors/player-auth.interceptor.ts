import { HttpInterceptorFn } from '@angular/common/http';

export const playerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api') || req.url.includes('/api/admin')) return next(req);

  return next(req.clone({ withCredentials: true }));
};

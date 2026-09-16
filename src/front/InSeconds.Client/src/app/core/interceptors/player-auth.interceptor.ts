import { HttpInterceptorFn } from '@angular/common/http';

export const playerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api')) return next(req);

  return next(req.clone({ withCredentials: true }));
};

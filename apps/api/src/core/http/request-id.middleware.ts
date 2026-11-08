import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { requestId } from '@jh/security';
import type { AppRequest } from './app-request.js';

/**
 * An inbound `x-request-id` is echoed so a trace survives a proxy, but it is
 * length-capped: it ends up in logs, and an unbounded client-controlled string
 * in a log line is someone else's incident.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: AppRequest, res: Response, next: NextFunction): void {
    const inbound = req.header('x-request-id');
    const id = inbound && inbound.length <= 64 ? inbound : requestId();
    req.id = id;
    res.setHeader('x-request-id', id);
    next();
  }
}

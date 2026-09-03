import { Router } from 'express';
import { actorOf } from '../lib/context';
import { qs, wrap } from '../lib/http';
import { search } from '../services/search';

export function searchRouter(): Router {
  const r = Router();
  r.get('/', wrap(async (req, res) => res.json(await search(actorOf(req), qs(req, 'q') ?? ''))));
  return r;
}

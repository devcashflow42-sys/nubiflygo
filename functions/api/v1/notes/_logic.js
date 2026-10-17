/* notes — notas del usuario (CRUD genérico). GET/POST /notes, GET/PATCH/DELETE /notes/:id */
import { dataRoute, handleCrud } from '../../../_shared/api.js';
import { CRUD } from '../../../_shared/util.js';

export const handle = dataRoute(({ seg, request, env, method, user, scope }) =>
  handleCrud('notes', CRUD.notes, seg[1], request, env, method, user, scope));

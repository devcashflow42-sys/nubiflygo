/* documents — documentos del usuario (CRUD genérico). GET/POST /documents, GET/PATCH/DELETE /documents/:id */
import { dataRoute, handleCrud } from '../../../_shared/api.js';
import { CRUD } from '../../../_shared/util.js';

export const handle = dataRoute(({ seg, request, env, method, user, scope }) =>
  handleCrud('documents', CRUD.documents, seg[1], request, env, method, user, scope));

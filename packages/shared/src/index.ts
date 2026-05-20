// Contracts — Zod schemas + inferred TS types (D-08, Pattern F)
export { errorEnvelope, type ErrorEnvelope } from './contracts/error.js';
export {
  loginRequest,
  loginResponse,
  type LoginRequest,
  type LoginResponse,
} from './contracts/login.js';
export { meResponse, type MeResponse } from './contracts/me.js';
export {
  ACTION_KEYS,
  actionKey,
  type ActionKey,
} from './contracts/permissions.js';

// Constants — locked vocabularies shared FE+BE
export { ROLES, roleEnum, type Role } from './constants/roles.js';
export {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  orderStatusEnum,
  type OrderStatus,
} from './constants/orderStatus.js';

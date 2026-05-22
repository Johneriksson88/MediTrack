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
export {
  medicationListItem,
  type MedicationListItem,
  medicationListQuery,
  type MedicationListQuery,
  medicationListResponse,
  type MedicationListResponse,
  medicationSearchQuery,
  type MedicationSearchQuery,
  medicationSearchResult,
  type MedicationSearchResult,
  medicationSearchResponse,
  type MedicationSearchResponse,
  medicationCreateFromNplRequest,
  type MedicationCreateFromNplRequest,
  medicationCreateUserRequest,
  type MedicationCreateUserRequest,
  medicationCreateRequest,
  type MedicationCreateRequest,
  medicationUpdateRequest,
  type MedicationUpdateRequest,
} from './contracts/medication.js';
// Order contracts — Zod schemas + inferred TS types for the FE↔BE order contract (D-08, Phase 3)
export {
  orderLineResponse,
  type OrderLineResponse,
  orderResponse,
  type OrderResponse,
  orderListItem,
  type OrderListItem,
  orderListQuery,
  type OrderListQuery,
  orderListResponse,
  type OrderListResponse,
  createOrderRequest,
  type CreateOrderRequest,
  confirmOrderRequest,
  type ConfirmOrderRequest,
  deliverOrderRequest,
  type DeliverOrderRequest,
  addOrderLineRequest,
  type AddOrderLineRequest,
  updateOrderLineRequest,
  type UpdateOrderLineRequest,
  pickerOptionsQuery,
  type PickerOptionsQuery,
  pickerOption,
  type PickerOption,
  pickerOptionsResponse,
  type PickerOptionsResponse,
} from './contracts/order.js';

// Constants — locked vocabularies shared FE+BE
export { ROLES, roleEnum, type Role } from './constants/roles.js';
export {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  orderStatusEnum,
  type OrderStatus,
} from './constants/orderStatus.js';
export {
  TOP_MEDICATION_FORMS,
  type MedicationForm,
  OVRIGA_FILTER_VALUE,
} from './constants/medicationForms.js';
export { defaultLowStockThreshold } from './constants/medicationDefaults.js';

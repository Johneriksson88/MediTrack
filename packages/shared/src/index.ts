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
  atcCodesResponse,
  type AtcCodesResponse,
  medicationCreateFromNplRequest,
  type MedicationCreateFromNplRequest,
  medicationCreateUserRequest,
  type MedicationCreateUserRequest,
  medicationCreateRequest,
  type MedicationCreateRequest,
  medicationUpdateRequest,
  type MedicationUpdateRequest,
  BULK_MEDICATION_LIMIT,
  bulkAddCandidatesQuery,
  type BulkAddCandidatesQuery,
  bulkAddCandidate,
  type BulkAddCandidate,
  bulkAddCandidatesResponse,
  type BulkAddCandidatesResponse,
  bulkAddMedicationsRequest,
  type BulkAddMedicationsRequest,
  bulkAddMedicationsResponse,
  type BulkAddMedicationsResponse,
  bulkRemoveMedicationsRequest,
  type BulkRemoveMedicationsRequest,
  bulkRemoveMedicationsResponse,
  type BulkRemoveMedicationsResponse,
  bulkRemovePreviewRequest,
  type BulkRemovePreviewRequest,
  bulkRemovePreviewResponse,
  type BulkRemovePreviewResponse,
} from './contracts/medication.js';
// Phase 6 D-113 / D-114 / D-115 — therapeutic class vocabulary (closed enum
// of the 14 WHO ATC level-1 anatomical groups).
export {
  THERAPEUTIC_CLASSES,
  THERAPEUTIC_CLASS_LABELS,
  therapeuticClassEnum,
  type TherapeuticClass,
} from './constants/therapeuticClass.js';
// Phase 10 D-157 / D-165 — formatted order number (ORD-YYYY-####).
// Single source of truth for the rendered display shape; consumed by BE
// serialization (toOrderResponse / toOrderListItem / toDashboardOrderRow)
// and FE display surfaces (OrdersTable, ComposeOrderPage H1, ...).
export { formatOrderNumber } from './utils/orderNumber.js';
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
  pickerSuggestion,
  type PickerSuggestion,
  pickerSuggestionsResponse,
  type PickerSuggestionsResponse,
  restockPreviewInFlightOrder,
  type RestockPreviewInFlightOrder,
  restockPreviewRow,
  type RestockPreviewRow,
  restockPreviewResponse,
  type RestockPreviewResponse,
  restockLowStockRequest,
  type RestockLowStockRequest,
} from './contracts/order.js';
// Audit contracts — Phase 5 D-08 / D-97 / D-103 / D-105 (FE↔BE audit log read API)
export {
  auditEventResponse,
  type AuditEventResponse,
  auditEventListQuery,
  type AuditEventListQuery,
  auditEventListResponse,
  type AuditEventListResponse,
  auditFiltersResponse,
  type AuditFiltersResponse,
} from './contracts/audit.js';
// Dashboard contracts — Phase 6 D-08 / D-120 / NTF-01 (FE↔BE dashboard low-stock API)
// and Phase 9 D-141 / D-142 (FE↔BE dashboard orders API — role-discriminated)
export {
  lowStockItem,
  type LowStockItem,
  lowStockListResponse,
  type LowStockListResponse,
  dashboardOrderRow,
  type DashboardOrderRow,
  dashboardOrdersResponse,
  type DashboardOrdersResponse,
} from './contracts/dashboard.js';
// AI categorization contracts — Phase 6 D-08 / D-106 / D-111 (FE↔BE AI suggestion API)
export {
  aiSuggestionRequest,
  type AiSuggestionRequest,
  aiSuggestionResponse,
  type AiSuggestionResponse,
  aiStatusResponse,
  type AiStatusResponse,
  llmToolUseSchema,
  type LlmToolUse,
} from './contracts/ai.js';

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
// Phase 5 D-94 / D-96 / D-104 — audit action + entity-type vocabularies.
export {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  auditActionEnum,
  type AuditAction,
} from './constants/auditAction.js';
export {
  AUDIT_ENTITY_TYPES,
  AUDIT_ENTITY_TYPE_LABELS,
  auditEntityTypeEnum,
  type AuditEntityType,
} from './constants/auditEntityType.js';

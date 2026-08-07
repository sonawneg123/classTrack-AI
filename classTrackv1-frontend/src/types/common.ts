export type Role = "admin" | "teacher" | "student";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  message: string;
  // The backend (validate.middleware.js) sends a flat array of message
  // strings, not a field-keyed record — matches Joi's `error.details`.
  errors?: string[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

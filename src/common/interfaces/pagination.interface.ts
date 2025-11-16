export interface PaginationParams {
  limit?: number;
  startAfter?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  total?: number;
  nextStartAfter?: string;
}

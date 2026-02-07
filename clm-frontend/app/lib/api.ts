/**
 * CLM Backend API Client
 * Production-level API integration with proper error handling and typing
 */

const BASE_URL = 'http://127.0.0.1:8000'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface User {
  user_id: string
  email: string
  full_name?: string
  tenant_id?: string
  is_admin?: boolean
  is_superadmin?: boolean
}

export interface AuthResponse {
  access: string
  refresh: string
  user: User
  message?: string
}

export interface OTPResponse {
  message: string
}

export interface ErrorResponse {
  error?: string
  message?: string
  detail?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  full_name: string
}

export interface ResetPasswordData {
  email: string
  otp: string
  password: string
}

export interface VerifyOTPData {
  email: string
  otp: string
}

// ============================================================================
// API ERROR HANDLING
// ============================================================================

export class APIError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type')
  let data: any

  try {
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }
  } catch (error) {
    data = null
  }

  if (!response.ok) {
    const errorMessage =
      data?.error ||
      data?.message ||
      data?.detail ||
      `HTTP Error: ${response.status}`

    throw new APIError(response.status, errorMessage, data)
  }

  return data as T
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

export const tokenManager = {
  getAccessToken: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  },

  getRefreshToken: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('refresh_token')
    }
    return null
  },

  setTokens: (access: string, refresh: string): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
    }
  },

  setUser: (user: User): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user))
    }
  },

  getUser: (): User | null => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('user')
      return user ? JSON.parse(user) : null
    }
    return null
  },

  clearTokens: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
    }
  },

  /**
   * Decode JWT token payload
   */
  decodeToken: (token: string): any => {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid token format')
      }

      const decoded = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8')
      )
      return decoded
    } catch (error) {
      console.error('Failed to decode token:', error)
      return null
    }
  },

  /**
   * Check if token is expired
   */
  isTokenExpired: (token: string): boolean => {
    const decoded = tokenManager.decodeToken(token)
    if (!decoded || !decoded.exp) {
      return true
    }

    const expirationTime = decoded.exp * 1000
    return Date.now() >= expirationTime
  },

  /**
   * Get time until token expiration in milliseconds
   */
  getTokenExpirationTime: (token: string): number => {
    const decoded = tokenManager.decodeToken(token)
    if (!decoded || !decoded.exp) {
      return 0
    }

    return decoded.exp * 1000 - Date.now()
  },
}

// ============================================================================
// API CLIENT METHODS
// ============================================================================

/**
 * Register a new user
 * POST /api/auth/register/
 */
export async function registerUser(
  credentials: RegisterCredentials
): Promise<AuthResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/register/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  })

  return handleResponse<AuthResponse>(response)
}

/**
 * Login user with email and password
 * POST /api/auth/login/
 */
export async function loginUser(
  credentials: LoginCredentials
): Promise<AuthResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/login/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  })

  return handleResponse<AuthResponse>(response)
}

/**
 * Get current authenticated user
 * GET /api/auth/me/
 */
export async function getCurrentUser(accessToken: string): Promise<User> {
  const response = await fetch(`${BASE_URL}/api/auth/me/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  return handleResponse<User>(response)
}

/**
 * Refresh access token using refresh token
 * POST /api/auth/refresh/
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/refresh/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh: refreshToken }),
  })

  return handleResponse<AuthResponse>(response)
}

/**
 * Logout user
 * POST /api/auth/logout/
 */
export async function logoutUser(accessToken: string): Promise<OTPResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/logout/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  return handleResponse<OTPResponse>(response)
}

/**
 * Request OTP for passwordless login
 * POST /api/auth/request-login-otp/
 */
export async function requestLoginOTP(email: string): Promise<OTPResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/request-login-otp/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  return handleResponse<OTPResponse>(response)
}

/**
 * Verify email OTP (for registration/verification)
 * POST /api/auth/verify-email-otp/
 */
export async function verifyEmailOTP(
  data: VerifyOTPData
): Promise<OTPResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/verify-email-otp/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  return handleResponse<OTPResponse>(response)
}

/**
 * Request password reset OTP
 * POST /api/auth/forgot-password/
 */
export async function requestPasswordReset(email: string): Promise<OTPResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/forgot-password/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  return handleResponse<OTPResponse>(response)
}

/**
 * Verify password reset OTP
 * POST /api/auth/verify-password-reset-otp/
 */
export async function verifyPasswordResetOTP(
  data: VerifyOTPData
): Promise<OTPResponse> {
  const response = await fetch(
    `${BASE_URL}/api/auth/verify-password-reset-otp/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  )

  return handleResponse<OTPResponse>(response)
}

/**
 * Resend password reset OTP
 * POST /api/auth/resend-password-reset-otp/
 */
export async function resendPasswordResetOTP(
  email: string
): Promise<OTPResponse> {
  const response = await fetch(
    `${BASE_URL}/api/auth/resend-password-reset-otp/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    }
  )

  return handleResponse<OTPResponse>(response)
}

/**
 * Reset password with OTP
 * POST /api/auth/reset-password/
 */
export async function resetPassword(
  data: ResetPasswordData
): Promise<OTPResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/reset-password/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  return handleResponse<OTPResponse>(response)
}

// ============================================================================
// CONTRACT MANAGEMENT APIS
// ============================================================================

export interface Contract {
  id: string
  title: string
  description?: string
  status: 'draft' | 'in-review' | 'approved' | 'signed'
  created_at: string
  updated_at: string
  value?: number
  counter_party?: string
}

export interface ContractVersion {
  id: string
  contract_id: string
  version_number: number
  content: string
  created_at: string
}

export const contractAPI = {
  // GET /api/contracts/statistics/
  getStatistics: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/statistics/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any>(response)
  },

  // GET /api/contracts/recent/
  getRecentContracts: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/recent/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any>(response)
  },

  // GET /api/contracts/
  listContracts: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<Contract[]>(response)
  },

  // POST /api/contracts/
  createContract: async (accessToken: string, data: any) => {
    const response = await fetch(`${BASE_URL}/api/contracts/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<Contract>(response)
  },

  // GET /api/contracts/{id}/
  getContractById: async (accessToken: string, id: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/${id}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<Contract>(response)
  },

  // PUT /api/contracts/{id}/
  updateContract: async (accessToken: string, id: string, data: any) => {
    const response = await fetch(`${BASE_URL}/api/contracts/${id}/`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<Contract>(response)
  },

  // POST /api/contracts/{id}/clone/
  cloneContract: async (accessToken: string, id: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/${id}/clone/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<Contract>(response)
  },

  // POST /api/contracts/{id}/versions/
  createContractVersion: async (accessToken: string, id: string, data: any) => {
    const response = await fetch(`${BASE_URL}/api/contracts/${id}/versions/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<ContractVersion>(response)
  },

  // GET /api/contracts/{id}/versions/
  listContractVersions: async (accessToken: string, id: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/${id}/versions/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<ContractVersion[]>(response)
  },

  // POST /api/contracts/validate-clauses/
  validateClauses: async (accessToken: string, clauses: unknown[]) => {
    const response = await fetch(`${BASE_URL}/api/contracts/validate-clauses/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ clauses }),
    })

    return handleResponse<any>(response)
  },

  // GET /api/contracts/search/
  searchContracts: async (accessToken: string, query: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/search/?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<Contract[]>(response)
  },

  // GET /api/contracts/filter/
  filterContracts: async (accessToken: string, status: string) => {
    const response = await fetch(`${BASE_URL}/api/contracts/filter/?status=${status}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<Contract[]>(response)
  },
}

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

export interface TemplateField {
  name: string
  type: string
  description: string
}

export interface TemplateTypeInfo {
  display_name: string
  description: string
  contract_type: string
  required_fields: TemplateField[]
  optional_fields: TemplateField[]
  mandatory_clauses: string[]
  business_rules?: Record<string, any>
  sample_data?: Record<string, any>
}

export interface TemplateTypesResponse {
  success: boolean
  total_types: number
  template_types: Record<string, TemplateTypeInfo>
}

export interface TemplateTypeDetailResponse {
  success: boolean
  template_type: string
  display_name: string
  description: string
  contract_type: string
  required_fields: TemplateField[]
  optional_fields: TemplateField[]
  mandatory_clauses: string[]
  business_rules?: Record<string, any>
  sample_data?: Record<string, any>
}

export interface TemplateValidateRequest {
  template_type: string
  data: Record<string, any>
}

export interface TemplateValidateResponse {
  success: boolean
  is_valid: boolean
  missing_fields: string[]
  message: string
}

export interface TemplateCreateRequest {
  template_type: string
  name: string
  description?: string
  status: 'draft' | 'published'
  data: Record<string, any>
}

export interface TemplateCreateResponse {
  success: boolean
  template_id: string
  name: string
  contract_type: string
  status: string
  merge_fields: string[]
  mandatory_clauses: string[]
  message: string
}

export const templateAPI = {
  // GET /api/v1/templates/types/ - Get all template types
  getAllTemplateTypes: async (accessToken: string): Promise<TemplateTypesResponse> => {
    const response = await fetch(`${BASE_URL}/api/v1/templates/types/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<TemplateTypesResponse>(response)
  },

  // GET /api/v1/templates/types/{type}/ - Get specific template type details
  getTemplateTypeDetail: async (
    accessToken: string,
    templateType: string
  ): Promise<TemplateTypeDetailResponse> => {
    const response = await fetch(`${BASE_URL}/api/v1/templates/types/${templateType}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<TemplateTypeDetailResponse>(response)
  },

  // GET /api/v1/templates/summary/ - Get template summary
  getTemplateSummary: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/v1/templates/summary/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any>(response)
  },

  // POST /api/v1/templates/validate/ - Validate template data
  validateTemplateData: async (
    accessToken: string,
    data: TemplateValidateRequest
  ): Promise<TemplateValidateResponse> => {
    const response = await fetch(`${BASE_URL}/api/v1/templates/validate/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<TemplateValidateResponse>(response)
  },

  // POST /api/v1/templates/create-from-type/ - Create template from type
  createTemplateFromType: async (
    accessToken: string,
    data: TemplateCreateRequest
  ): Promise<TemplateCreateResponse> => {
    const response = await fetch(`${BASE_URL}/api/v1/templates/create-from-type/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<TemplateCreateResponse>(response)
  },

  // Legacy endpoints (kept for backward compatibility)
  // GET /api/v1/contract-templates/
  getTemplates: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/v1/contract-templates/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any[]>(response)
  },

  // POST /api/v1/contract-templates/
  createTemplate: async (accessToken: string, data: any) => {
    const response = await fetch(`${BASE_URL}/api/v1/contract-templates/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<any>(response)
  },

  // GET /api/v1/contract-templates/{id}/
  getTemplateById: async (accessToken: string, id: string) => {
    const response = await fetch(`${BASE_URL}/api/v1/contract-templates/${id}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any>(response)
  },
}

export const workflowAPI = {
  // GET /api/workflows/
  getWorkflows: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/workflows/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any[]>(response)
  },

  // POST /api/workflows/
  createWorkflow: async (accessToken: string, data: any) => {
    const response = await fetch(`${BASE_URL}/api/workflows/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<any>(response)
  },

  // GET /api/workflows/{id}/
  getWorkflowById: async (accessToken: string, id: string) => {
    const response = await fetch(`${BASE_URL}/api/workflows/${id}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any>(response)
  },
}

export const notificationAPI = {
  // GET /api/notifications/
  getNotifications: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/notifications/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any[]>(response)
  },

  // POST /api/notifications/
  createNotification: async (accessToken: string, data: any) => {
    const response = await fetch(`${BASE_URL}/api/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<any>(response)
  },
}

export const approvalAPI = {
  // POST /api/approval-requests/
  createApprovalRequest: async (accessToken: string, data: any) => {
    const response = await fetch(`${BASE_URL}/api/approval-requests/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    return handleResponse<any>(response)
  },

  // GET /api/approval-requests/pending/
  getPendingApprovals: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/approval-requests/pending/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any[]>(response)
  },
}

export const repositoryAPI = {
  // GET /api/documents/
  getDocuments: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/documents/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any[]>(response)
  },

  // GET /api/repository/
  getRepositoryContents: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/repository/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any>(response)
  },

  // GET /api/repository/folders/
  getRepositoryFolders: async (accessToken: string) => {
    const response = await fetch(`${BASE_URL}/api/repository/folders/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return handleResponse<any[]>(response)
  },
}

// ============================================================================
// COMPATIBILITY AUTH API (used by legacy components like AuthPage)
// ============================================================================

export const authAPI = {
  register: async (data: {
    email: string
    password: string
    first_name?: string
    last_name?: string
  }) => {
    const full_name = [data.first_name, data.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || data.first_name || data.last_name || data.email

    const result = await registerUser({
      email: data.email,
      password: data.password,
      full_name,
    })

    tokenManager.setTokens(result.access, result.refresh)
    tokenManager.setUser(result.user)
    return result
  },

  login: async (data: { email: string; password: string }) => {
    const result = await loginUser(data)
    tokenManager.setTokens(result.access, result.refresh)
    tokenManager.setUser(result.user)
    return result
  },

  forgotPassword: async (email: string) => {
    return requestPasswordReset(email)
  },

  resetPassword: async (data: ResetPasswordData) => {
    return resetPassword(data)
  },

  logout: () => {
    tokenManager.clearTokens()
  },
}

/**
 * Production-grade API Client
 * All real endpoints - NO mock data
 * Handles authentication, error handling, and all CLM operations
 */

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  status: number
}

export interface Contract {
  id: string
  title: string
  description?: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
  value?: number
  created_by?: string

  // Detail fields (present on GET /contracts/{id}/)
  metadata?: any
  rendered_text?: string
  rendered_html?: string
}

export interface ContractTemplate {
  id: string
  name: string
  contract_type: string
  description?: string
  r2_key?: string
  merge_fields?: string[]
  status: string
}

export interface Clause {
  id: string
  clause_id: string
  name: string
  version?: number
  contract_type: string
  content: string
  status: string
  is_mandatory?: boolean
  tags?: any
}

export interface ContractGenerateResponse {
  contract: any
  version: any
  mandatory_clauses: any[]
  clause_suggestions: Record<string, any>
  validation_errors: any[]
}

export interface ContractGenerateFromFileResponse {
  contract: any
  rendered_text: string
  raw_text: string
}

export interface TemplateFileResponse {
  success: boolean
  template_type: string
  filename: string
  content: string
  size: number
  display_name?: string
  description?: string
}

export interface FileTemplateItem {
  id: string
  filename: string
  name: string
  contract_type: string
  description?: string
  status: string
  created_at?: string
  updated_at?: string
  created_by_id?: string
  created_by_email?: string
}

export interface FileTemplateContentResponse {
  success: boolean
  filename: string
  name: string
  template_type: string
  content: string
  size: number
}

export interface TemplateSchemaField {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select'
  required: boolean
  options?: string[]
  in_template?: boolean
}

export interface TemplateSchemaSection {
  title: string
  fields: TemplateSchemaField[]
}

export interface TemplateFileSchemaResponse {
  success: boolean
  filename: string
  name: string
  template_type: string
  placeholders: string[]
  sections: TemplateSchemaSection[]
  clauses_ui: {
    allow_library_selection: boolean
    allow_custom_clauses: boolean
    allow_constraints: boolean
  }
}

export interface ContractPreviewFromFileResponse {
  success: boolean
  filename: string
  contract_type: string
  raw_text: string
  rendered_text: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'archived'
  steps: WorkflowStep[]
  created_at: string
}

export interface WorkflowStep {
  step_number: number
  name: string
  assigned_to: string[]
  action_type?: string
}

export interface ApprovalRequest {
  id: string
  entity_type: string
  entity_id: string
  requester_id: string
  status: 'pending' | 'approved' | 'rejected'
  comment?: string
  priority?: 'low' | 'normal' | 'high'
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  type: string
  subject: string
  message: string
  read: boolean
  created_at: string
  action_url?: string
}

export interface SearchResult {
  id: string
  title: string
  entity_type: string
  content_preview: string
  relevance_score: number
}

export interface PrivateUploadItem {
  key: string
  filename: string
  file_type: string
  size: number
  uploaded_at?: string | null
}

export interface PrivateUploadsListResponse {
  success: boolean
  count: number
  results: PrivateUploadItem[]
}

export interface PrivateUploadUrlResponse {
  success: boolean
  key: string
  url: string
  expires_in: number
}

export type ReviewContractStatus = 'uploaded' | 'processing' | 'ready' | 'failed'

export interface ReviewContractListItem {
  id: string
  title: string
  original_filename: string
  file_type: string
  size_bytes: number
  status: ReviewContractStatus
  created_at: string
  updated_at: string
}

export interface ReviewContractDetail extends ReviewContractListItem {
  r2_key: string
  error_message?: string | null
  analysis?: any
  review_text?: string
}

export interface ReviewContractsListResponse {
  count: number
  results: ReviewContractListItem[]
}

export interface ReviewContractUrlResponse {
  success: boolean
  url: string
  expires_in: number
}

export interface CalendarEvent {
  id: string
  title: string
  summary?: string
  description?: string
  start_datetime: string
  end_datetime: string
  all_day: boolean
  category: 'renewal' | 'expiry' | 'meeting'
  associated_contract_id?: string | null
  associated_contract_title?: string
  created_at?: string
  updated_at?: string
}

export class ApiClient {
  private baseUrl: string
  private token: string | null = null
  private refreshToken: string | null = null

  private static readonly API_V1_PREFIX = '/api/v1'

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000') {
    this.baseUrl = baseUrl
    this.loadTokens()
  }

  private loadTokens() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('access_token')
      this.refreshToken = localStorage.getItem('refresh_token')
    }
  }

  private setTokens(access: string, refresh?: string) {
    this.token = access
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', access)
      if (refresh) {
        this.refreshToken = refresh
        localStorage.setItem('refresh_token', refresh)
      }
    }
  }

  private clearTokens() {
    this.token = null
    this.refreshToken = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    // Tokens may have been set by a different module (e.g. authAPI in api.ts)
    // so always reload before attempting refresh.
    this.loadTokens()
    if (!this.refreshToken) return false

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refresh: this.refreshToken }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return false
      }

      const access = (data as any)?.access
      const refresh = (data as any)?.refresh
      if (access) {
        this.setTokens(access, refresh)
        return true
      }

      return false
    } catch {
      return false
    }
  }

  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    customHeaders?: Record<string, string>,
    allowRetry: boolean = true,
    options?: { auth?: boolean }
  ): Promise<ApiResponse<T>> {
    try {
      // Support the exported singleton `apiClient` and any long-lived instances.
      this.loadTokens()

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...customHeaders,
      }

      const useAuth = options?.auth !== false

      if (useAuth && this.token) {
        headers['Authorization'] = `Bearer ${this.token}`
      }

      const config: RequestInit = {
        method,
        headers,
        credentials: 'include',
      }

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.body = JSON.stringify(data)
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, config)

      if (response.status === 401) {
        if (useAuth && allowRetry && (await this.refreshAccessToken())) {
          return this.request(method, endpoint, data, customHeaders, false, options)
        }
        // Don't throw; let callers handle 401 explicitly.
        return {
          success: false,
          error: 'Unauthorized - Please log in again',
          status: 401,
        }
      }

      const responseData = await response.json().catch(() => ({}))

      if (!response.ok) {
        return {
          success: false,
          error: responseData.message || responseData.detail || 'Request failed',
          status: response.status,
        }
      }

      return {
        success: true,
        data: responseData,
        status: response.status,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 0,
      }
    }
  }

  private async multipartRequest<T>(
    method: 'POST' | 'PUT' | 'PATCH',
    endpoint: string,
    formData: FormData,
    allowRetry: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      this.loadTokens()
      const headers: Record<string, string> = {}
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        credentials: 'include',
        body: formData,
      })

      if (response.status === 401) {
        if (allowRetry && (await this.refreshAccessToken())) {
          return this.multipartRequest(method, endpoint, formData, false)
        }
        return {
          success: false,
          error: 'Unauthorized - Please log in again',
          status: 401,
        }
      }

      const responseData = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          error: (responseData as any)?.message || (responseData as any)?.detail || 'Request failed',
          status: response.status,
        }
      }

      return {
        success: true,
        data: responseData as T,
        status: response.status,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 0,
      }
    }
  }

  private async multipartRequestWithProgress<T>(
    method: 'POST' | 'PUT' | 'PATCH',
    endpoint: string,
    formData: FormData,
    opts?: {
      onProgress?: (info: { loaded: number; total?: number; percent?: number }) => void
    }
  ): Promise<ApiResponse<T>> {
    // fetch() does not reliably expose upload progress; use XHR.
    this.loadTokens()
    const url = `${this.baseUrl}${endpoint}`

    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest()
        xhr.open(method, url, true)
        xhr.withCredentials = true
        if (this.token) {
          xhr.setRequestHeader('Authorization', `Bearer ${this.token}`)
        }

        if (xhr.upload && opts?.onProgress) {
          xhr.upload.onprogress = (evt) => {
            const total = evt.lengthComputable ? evt.total : undefined
            const percent = total ? Math.round((evt.loaded / total) * 100) : undefined
            opts.onProgress?.({ loaded: evt.loaded, total, percent })
          }
        }

        xhr.onerror = () => {
          resolve({ success: false, error: 'Network error', status: 0 })
        }

        xhr.onload = () => {
          const status = xhr.status
          const raw = xhr.responseText
          let data: any = {}
          try {
            data = raw ? JSON.parse(raw) : {}
          } catch {
            data = {}
          }

          if (status === 401) {
            // Best-effort: refresh is async and XHR cannot be retried without rebuilding FormData.
            resolve({ success: false, error: 'Unauthorized - Please log in again', status: 401 })
            return
          }

          if (status < 200 || status >= 300) {
            resolve({ success: false, error: data?.message || data?.detail || 'Request failed', status })
            return
          }

          resolve({ success: true, data: data as T, status })
        }

        xhr.send(formData)
      } catch (e) {
        resolve({ success: false, error: e instanceof Error ? e.message : 'Unknown error', status: 0 })
      }
    })
  }

  private async blobRequest(
    endpoint: string,
    allowRetry: boolean = true,
    options?: { auth?: boolean }
  ): Promise<ApiResponse<Blob>> {
    try {
      this.loadTokens()

      const headers: Record<string, string> = {}
      const useAuth = options?.auth !== false

      if (useAuth && this.token) {
        headers['Authorization'] = `Bearer ${this.token}`
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers,
        credentials: 'include',
      })

      if (response.status === 401) {
        if (useAuth && allowRetry && (await this.refreshAccessToken())) {
          return this.blobRequest(endpoint, false, options)
        }
        return { success: false, error: 'Unauthorized - Please log in again', status: 401 }
      }

      if (!response.ok) {
        return { success: false, error: 'Request failed', status: response.status }
      }

      const blob = await response.blob()
      return { success: true, data: blob, status: response.status }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 0,
      }
    }
  }

  // ==================== AUTHENTICATION ====================
  async register(email: string, password: string, fullName: string): Promise<ApiResponse> {
    const response = await this.request('POST', '/api/auth/register/', {
      email,
      password,
      full_name: fullName,
    })

    if (response.success && (response.data as any)?.access) {
      this.setTokens((response.data as any).access, (response.data as any).refresh)
    }

    return response
  }

  async login(email: string, password: string): Promise<ApiResponse> {
    const response = await this.request('POST', '/api/auth/login/', {
      email,
      password,
    })

    if (response.success && (response.data as any)?.access) {
      this.setTokens((response.data as any).access, (response.data as any).refresh)
    }

    return response
  }

  async logout(): Promise<ApiResponse> {
    const response = await this.request('POST', '/api/auth/logout/', {})
    this.clearTokens()
    return response
  }

  async getCurrentUser(): Promise<ApiResponse> {
    return this.request('GET', '/api/auth/me/')
  }

  // ==================== CONTRACTS ====================
  async createContract(data: Partial<Contract>): Promise<ApiResponse<Contract>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contracts/`, data)
  }

  async generateContract(params: {
    templateId: string
    structuredInputs?: Record<string, any>
    userInstructions?: string
    title?: string
    selectedClauses?: string[]
  }): Promise<ApiResponse<ContractGenerateResponse>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contracts/generate/`, {
      template_id: params.templateId,
      structured_inputs: params.structuredInputs || {},
      user_instructions: params.userInstructions,
      title: params.title,
      selected_clauses: params.selectedClauses || [],
    })
  }

  async generateContractFromFile(params: {
    filename: string
    structuredInputs?: Record<string, any>
    userInstructions?: string
    title?: string
    selectedClauses?: string[]
    customClauses?: Array<{ title?: string; content: string }>
    constraints?: Array<{ name: string; value: string }>
  }): Promise<ApiResponse<ContractGenerateFromFileResponse>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contracts/generate-from-file/`, {
      filename: params.filename,
      structured_inputs: params.structuredInputs || {},
      user_instructions: params.userInstructions,
      title: params.title,
      selected_clauses: params.selectedClauses || [],
      custom_clauses: params.customClauses || [],
      constraints: params.constraints || [],
    })
  }

  async getContracts(params?: Record<string, any>): Promise<ApiResponse> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/contracts/${queryString}`)
  }

  async getContractById(id: string): Promise<ApiResponse<Contract>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/contracts/${id}/`)
  }

  async updateContract(id: string, data: Partial<Contract>): Promise<ApiResponse<Contract>> {
    return this.request('PUT', `${ApiClient.API_V1_PREFIX}/contracts/${id}/`, data)
  }

  async updateContractContent(
    id: string,
    data: { rendered_text?: string; rendered_html?: string }
  ): Promise<ApiResponse<any>> {
    return this.request('PATCH', `${ApiClient.API_V1_PREFIX}/contracts/${id}/content/`, data)
  }

  async streamContractAiGenerate(
    id: string,
    payload: { prompt: string; current_text?: string },
    handlers: {
      onDelta: (delta: string) => void
      onDone?: () => void
      onError?: (error: string) => void
      signal?: AbortSignal
    }
  ): Promise<void> {
    this.loadTokens()
    if (!this.token) {
      handlers.onError?.('Not authenticated')
      return
    }

    const doFetch = async () =>
      fetch(`${this.baseUrl}${ApiClient.API_V1_PREFIX}/contracts/${id}/ai/generate-stream/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
        signal: handlers.signal,
      })

    let response = await doFetch()
    if (response.status === 401) {
      const ok = await this.refreshAccessToken()
      if (ok) {
        response = await doFetch()
      }
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '')
      handlers.onError?.(text || `Request failed (${response.status})`)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    let buffer = ''
    const handleFrame = (frame: string) => {
      // SSE frame is a set of lines terminated by a blank line.
      // We care about: event: <name> and data: <json>
      const lines = frame.split(/\r?\n/)
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      const dataStr = dataLines.join('\n')
      if (!dataStr) return

      if (eventName === 'delta') {
        try {
          const obj = JSON.parse(dataStr)
          const delta = String(obj?.delta || '')
          if (delta) handlers.onDelta(delta)
        } catch {
          // Fallback: treat as raw
          handlers.onDelta(dataStr)
        }
        return
      }

      if (eventName === 'done') {
        handlers.onDone?.()
        return
      }

      if (eventName === 'error') {
        try {
          const obj = JSON.parse(dataStr)
          handlers.onError?.(String(obj?.error || 'Unknown error'))
        } catch {
          handlers.onError?.(dataStr)
        }
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Split on blank line delimiter. Keep any remainder.
      while (true) {
        const idx = buffer.indexOf('\n\n')
        if (idx === -1) break
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (frame.trim()) handleFrame(frame)
      }
    }

    // Handle trailing frame if present.
    if (buffer.trim()) handleFrame(buffer)
  }

  async streamTemplateAiGenerate(
    payload: { prompt: string; current_text: string; contract_type?: string },
    handlers: {
      onDelta: (delta: string) => void
      onDone?: () => void
      onError?: (error: string) => void
      signal?: AbortSignal
    }
  ): Promise<void> {
    this.loadTokens()
    if (!this.token) {
      handlers.onError?.('Not authenticated')
      return
    }

    const doFetch = async () =>
      fetch(`${this.baseUrl}${ApiClient.API_V1_PREFIX}/ai/generate/template-stream/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
        signal: handlers.signal,
      })

    let response = await doFetch()
    if (response.status === 401) {
      const ok = await this.refreshAccessToken()
      if (ok) {
        response = await doFetch()
      }
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '')
      handlers.onError?.(text || `Request failed (${response.status})`)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleFrame = (frame: string) => {
      const lines = frame.split(/\r?\n/)
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      const dataStr = dataLines.join('\n')
      if (!dataStr) return

      if (eventName === 'delta') {
        try {
          const obj = JSON.parse(dataStr)
          const delta = String(obj?.delta || '')
          if (delta) handlers.onDelta(delta)
        } catch {
          handlers.onDelta(dataStr)
        }
        return
      }

      if (eventName === 'done') {
        handlers.onDone?.()
        return
      }

      if (eventName === 'error') {
        try {
          const obj = JSON.parse(dataStr)
          handlers.onError?.(String(obj?.error || 'Unknown error'))
        } catch {
          handlers.onError?.(dataStr)
        }
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      while (true) {
        const idx = buffer.indexOf('\n\n')
        if (idx === -1) break
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (frame.trim()) handleFrame(frame)
      }
    }

    if (buffer.trim()) handleFrame(buffer)
  }

  async createContractFromContent(params: {
    title: string
    contract_type?: string
    rendered_text?: string
    rendered_html?: string
  }): Promise<ApiResponse<any>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contracts/create-from-content/`, {
      title: params.title,
      contract_type: params.contract_type,
      rendered_text: params.rendered_text,
      rendered_html: params.rendered_html,
    })
  }

  async downloadContractTxt(id: string): Promise<ApiResponse<Blob>> {
    return this.blobRequest(`${ApiClient.API_V1_PREFIX}/contracts/${id}/download-txt/`)
  }

  async downloadContractPdf(id: string): Promise<ApiResponse<Blob>> {
    return this.blobRequest(`${ApiClient.API_V1_PREFIX}/contracts/${id}/download-pdf/`)
  }

  async deleteContract(id: string): Promise<ApiResponse> {
    return this.request('DELETE', `${ApiClient.API_V1_PREFIX}/contracts/${id}/`)
  }

  async cloneContract(id: string, newTitle: string): Promise<ApiResponse<Contract>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contracts/${id}/clone/`, {
      title: newTitle,
    })
  }

  async getContractVersions(id: string): Promise<ApiResponse> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/contracts/${id}/versions/`)
  }

  async createContractVersion(
    id: string,
    changeSummary: string,
    selectedClauses?: string[]
  ): Promise<ApiResponse> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contracts/${id}/versions/`, {
      change_summary: changeSummary,
      selected_clauses: selectedClauses || [],
    })
  }

  async getContractStatistics(): Promise<ApiResponse> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/contracts/statistics/`)
  }

  async getRecentContracts(limit: number = 5): Promise<ApiResponse> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/contracts/recent/?limit=${limit}`)
  }

  // ==================== CLAUSES ====================
  async getClauses(params?: Record<string, any>): Promise<ApiResponse<Clause[]>> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/clauses/${queryString}`)
  }

  async getConstraintsLibrary(params?: Record<string, any>): Promise<ApiResponse<{ success: boolean; count: number; results: any[] }>> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/clauses/constraints-library/${queryString}`)
  }

  // ==================== TEMPLATES ====================
  async createTemplate(data: Partial<ContractTemplate>): Promise<ApiResponse<ContractTemplate>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contract-templates/`, data)
  }

  async getTemplates(): Promise<ApiResponse> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/contract-templates/`)
  }

  async getTemplateById(id: string): Promise<ApiResponse<ContractTemplate>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/contract-templates/${id}/`)
  }

  async updateTemplate(
    id: string,
    data: Partial<ContractTemplate>
  ): Promise<ApiResponse<ContractTemplate>> {
    return this.request('PUT', `${ApiClient.API_V1_PREFIX}/contract-templates/${id}/`, data)
  }

  async deleteTemplate(id: string): Promise<ApiResponse> {
    return this.request('DELETE', `${ApiClient.API_V1_PREFIX}/contract-templates/${id}/`)
  }

  async getTemplateFile(templateType: string): Promise<ApiResponse<TemplateFileResponse>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/templates/files/${templateType}/`, undefined, undefined, true, {
      auth: false,
    })
  }

  // ==================== FILE-BASED TEMPLATES (NO DB) ====================
  async listTemplateFiles(): Promise<ApiResponse<{ success: boolean; count: number; results: FileTemplateItem[] }>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/templates/files/`, undefined, undefined, true, {
      auth: false,
    })
  }

  async createTemplateFile(params: { name?: string; filename?: string; description?: string; content: string }): Promise<ApiResponse<{ success: boolean; template: FileTemplateItem }>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/templates/files/`, params)
  }

  async listMyTemplateFiles(): Promise<ApiResponse<{ success: boolean; count: number; results: FileTemplateItem[] }>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/templates/files/mine/`)
  }

  async getTemplateFileContent(filename: string): Promise<ApiResponse<FileTemplateContentResponse>> {
    const safe = encodeURIComponent(filename)
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/templates/files/content/${safe}/`, undefined, undefined, true, {
      auth: false,
    })
  }

  async getTemplateFileSchema(filename: string): Promise<ApiResponse<TemplateFileSchemaResponse>> {
    const safe = encodeURIComponent(filename)
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/templates/files/schema/${safe}/`, undefined, undefined, true, {
      auth: false,
    })
  }

  async previewContractFromFile(params: {
    filename: string
    structuredInputs?: Record<string, any>
    selectedClauses?: string[]
    customClauses?: Array<{ title?: string; content: string }>
    constraints?: Array<{ name: string; value: string }>
  }): Promise<ApiResponse<ContractPreviewFromFileResponse>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/contracts/preview-from-file/`, {
      filename: params.filename,
      structured_inputs: params.structuredInputs || {},
      selected_clauses: params.selectedClauses || [],
      custom_clauses: params.customClauses || [],
      constraints: params.constraints || [],
    })
  }

  // ==================== WORKFLOWS ====================
  async createWorkflow(data: Partial<Workflow>): Promise<ApiResponse<Workflow>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/workflows/`, data)
  }

  async getWorkflows(): Promise<ApiResponse> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/workflows/`)
  }

  async getWorkflowById(id: string): Promise<ApiResponse<Workflow>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/workflows/${id}/`)
  }

  async updateWorkflow(id: string, data: Partial<Workflow>): Promise<ApiResponse<Workflow>> {
    return this.request('PUT', `${ApiClient.API_V1_PREFIX}/workflows/${id}/`, data)
  }

  async deleteWorkflow(id: string): Promise<ApiResponse> {
    return this.request('DELETE', `${ApiClient.API_V1_PREFIX}/workflows/${id}/`)
  }

  async getWorkflowInstances(workflowId: string): Promise<ApiResponse> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/workflows/${workflowId}/instances/`)
  }

  // ==================== APPROVALS ====================
  async createApproval(data: Partial<ApprovalRequest>): Promise<ApiResponse<ApprovalRequest>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/approvals/`, data)
  }

  async getApprovals(params?: Record<string, any>): Promise<ApiResponse> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/approvals/${queryString}`)
  }

  async getApprovalById(id: string): Promise<ApiResponse<ApprovalRequest>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/approvals/${id}/`)
  }

  async updateApproval(
    id: string,
    data: Partial<ApprovalRequest>
  ): Promise<ApiResponse<ApprovalRequest>> {
    return this.request('PUT', `${ApiClient.API_V1_PREFIX}/approvals/${id}/`, data)
  }

  async approveRequest(id: string, comment?: string): Promise<ApiResponse> {
    return this.request('PUT', `${ApiClient.API_V1_PREFIX}/approvals/${id}/`, {
      status: 'approved',
      comment,
    })
  }

  async rejectRequest(id: string, reason?: string): Promise<ApiResponse> {
    return this.request('PUT', `${ApiClient.API_V1_PREFIX}/approvals/${id}/`, {
      status: 'rejected',
      comment: reason,
    })
  }

  // ==================== NOTIFICATIONS ====================
  async getNotifications(params?: Record<string, any>): Promise<ApiResponse> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return this.request('GET', `/api/notifications/${queryString}`)
  }

  async createNotification(data: any): Promise<ApiResponse<Notification>> {
    return this.request('POST', '/api/notifications/', data)
  }

  async markNotificationAsRead(id: string): Promise<ApiResponse> {
    return this.request('PUT', `/api/notifications/${id}/`, { read: true })
  }

  // ==================== PRIVATE UPLOADS (R2-ONLY) ====================
  async listPrivateUploads(): Promise<ApiResponse<PrivateUploadsListResponse>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/private-uploads/`)
  }

  async getPrivateUploadUrl(key: string): Promise<ApiResponse<PrivateUploadUrlResponse>> {
    const encoded = encodeURIComponent(key)
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/private-uploads/url/?key=${encoded}`)
  }

  async deletePrivateUpload(key: string): Promise<ApiResponse<{ success: boolean }>> {
    const encoded = encodeURIComponent(key)
    return this.request('DELETE', `${ApiClient.API_V1_PREFIX}/private-uploads/?key=${encoded}`)
  }

  async uploadPrivateUpload(file: File): Promise<ApiResponse<any>> {
    const form = new FormData()
    form.append('file', file)
    return this.multipartRequest('POST', `${ApiClient.API_V1_PREFIX}/private-uploads/`, form)
  }

  async uploadPrivateUploadWithProgress(
    file: File,
    opts?: { onProgress?: (info: { loaded: number; total?: number; percent?: number }) => void }
  ): Promise<ApiResponse<any>> {
    const form = new FormData()
    form.append('file', file)
    return this.multipartRequestWithProgress('POST', `${ApiClient.API_V1_PREFIX}/private-uploads/`, form, opts)
  }

  // ==================== REVIEW CONTRACTS ====================
  async listReviewContracts(params?: { q?: string }): Promise<ApiResponse<ReviewContractsListResponse>> {
    const qs = params?.q ? `?q=${encodeURIComponent(params.q)}` : ''
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/review-contracts/${qs}`)
  }

  async getReviewContractById(id: string): Promise<ApiResponse<ReviewContractDetail>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/review-contracts/${id}/`)
  }

  async uploadReviewContract(
    file: File,
    opts?: { title?: string; analyze?: boolean }
  ): Promise<ApiResponse<{ success: boolean; review_contract: ReviewContractDetail }>> {
    const form = new FormData()
    form.append('file', file)
    if (opts?.title) form.append('title', opts.title)
    if (typeof opts?.analyze === 'boolean') form.append('analyze', String(opts.analyze))
    return this.multipartRequest('POST', `${ApiClient.API_V1_PREFIX}/review-contracts/`, form)
  }

  async uploadReviewContractWithProgress(
    file: File,
    opts?: {
      title?: string
      analyze?: boolean
      onProgress?: (info: { loaded: number; total?: number; percent?: number }) => void
    }
  ): Promise<ApiResponse<{ success: boolean; review_contract: ReviewContractDetail }>> {
    const form = new FormData()
    form.append('file', file)
    if (opts?.title) form.append('title', opts.title)
    if (typeof opts?.analyze === 'boolean') form.append('analyze', String(opts.analyze))
    return this.multipartRequestWithProgress('POST', `${ApiClient.API_V1_PREFIX}/review-contracts/`, form, {
      onProgress: opts?.onProgress,
    })
  }

  async deleteReviewContract(id: string): Promise<ApiResponse<any>> {
    return this.request('DELETE', `${ApiClient.API_V1_PREFIX}/review-contracts/${id}/`)
  }

  async getReviewContractUrl(id: string): Promise<ApiResponse<ReviewContractUrlResponse>> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/review-contracts/${id}/url/`)
  }

  async analyzeReviewContract(
    id: string
  ): Promise<ApiResponse<{ success: boolean; review_contract: ReviewContractDetail }>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/review-contracts/${id}/analyze/`, {})
  }

  async downloadReviewReportTxt(id: string): Promise<ApiResponse<Blob>> {
    return this.blobRequest(`${ApiClient.API_V1_PREFIX}/review-contracts/${id}/report-txt/`)
  }

  async downloadReviewReportPdf(id: string): Promise<ApiResponse<Blob>> {
    return this.blobRequest(`${ApiClient.API_V1_PREFIX}/review-contracts/${id}/report-pdf/`)
  }

  // ==================== CALENDAR EVENTS ====================
  async listCalendarEvents(params: { start: string; end: string }): Promise<ApiResponse<{ results: CalendarEvent[] }>> {
    const qs = new URLSearchParams({ start: params.start, end: params.end }).toString()
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/events/?${qs}`)
  }

  async createCalendarEvent(data: Partial<CalendarEvent>): Promise<ApiResponse<CalendarEvent>> {
    return this.request('POST', `${ApiClient.API_V1_PREFIX}/events/`, data)
  }

  async updateCalendarEvent(id: string, data: Partial<CalendarEvent>): Promise<ApiResponse<CalendarEvent>> {
    return this.request('PATCH', `${ApiClient.API_V1_PREFIX}/events/${id}/`, data)
  }

  async deleteCalendarEvent(id: string): Promise<ApiResponse> {
    return this.request('DELETE', `${ApiClient.API_V1_PREFIX}/events/${id}/`)
  }

  // ==================== SEARCH ====================
  async search(query: string, params?: Record<string, any>): Promise<ApiResponse> {
    const fullParams = { q: query, ...params }
    const queryString = '?' + new URLSearchParams(fullParams).toString()
    return this.request('GET', `/api/search/${queryString}`)
  }

  async semanticSearch(query: string): Promise<ApiResponse> {
    return this.request('GET', `/api/search/semantic/?q=${encodeURIComponent(query)}`)
  }

  async advancedSearch(data: any): Promise<ApiResponse> {
    return this.request('POST', '/api/search/advanced/', data)
  }

  async getSearchSuggestions(query: string): Promise<ApiResponse> {
    return this.request('GET', `/api/search/suggestions/?q=${encodeURIComponent(query)}`)
  }

  // ==================== DOCUMENTS ====================
  async listDocuments(): Promise<ApiResponse> {
    return this.request('GET', '/api/documents/')
  }

  async getRepository(): Promise<ApiResponse> {
    return this.request('GET', '/api/repository/')
  }

  async getRepositoryFolders(): Promise<ApiResponse> {
    return this.request('GET', '/api/repository/folders/')
  }

  async createFolder(name: string, parentId?: string): Promise<ApiResponse> {
    return this.request('POST', '/api/repository/folders/', {
      name,
      parent_id: parentId,
    })
  }

  // ==================== METADATA ====================
  async createMetadataField(data: any): Promise<ApiResponse> {
    return this.request('POST', '/api/metadata/fields/', data)
  }

  async getMetadataFields(): Promise<ApiResponse> {
    return this.request('GET', '/api/metadata/fields/')
  }

  // ==================== HEALTH ====================
  async getHealth(): Promise<ApiResponse> {
    return this.request('GET', `${ApiClient.API_V1_PREFIX}/health/`)
  }
}

// Singleton instance
export const apiClient = new ApiClient()

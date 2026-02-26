'use client'

import React, { useState, useEffect } from 'react'
import Sidebar from './Sidebar'

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

function createIcon(pathD: string) {
  return function Icon({ className, title, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : 'presentation'}
        {...props}
      >
        {title ? <title>{title}</title> : null}
        <path d={pathD} />
      </svg>
    )
  }
}

const IconFileText = createIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8')
const IconDownload = createIcon('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3')
const IconEye = createIcon('M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12 M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6')
const IconX = createIcon('M18 6 6 18 M6 6l12 12')
const IconLoader = createIcon('M21 12a9 9 0 1 1-6.219-8.56')
const IconAlertCircle = createIcon('M12 8v4 M12 16h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0')

const IconShield = createIcon('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10')
const IconFileSignature = createIcon('M20 19h-4 M14 20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v4 M18 10V8h-2 M6 12h8 M6 16h6')
const IconUsers = createIcon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75')
const IconBriefcase = createIcon('M16 20V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v16 M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2')
const IconFileCheck = createIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 15l2 2 4-4')
const IconHome = createIcon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10')
const IconShoppingCart = createIcon('M6 6h15l-1.5 9h-13z M6 6 5 3H2 M6 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M18 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4')

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TemplateType {
  display_name: string
  description: string
  required_fields_count?: number
  optional_fields_count?: number
  icon?: string
}

interface TemplateFileContent {
  success: boolean
  template_type: string
  filename: string
  content: string
  size: number
}

interface TemplateTypesResponse {
  success: boolean
  total_types: number
  template_types: Record<string, TemplateType>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://lawflow-267708864896.asia-south1.run.appapi/v1'

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  NDA: <IconShield className="w-6 h-6" />,
  MSA: <IconFileSignature className="w-6 h-6" />,
  EMPLOYMENT: <IconUsers className="w-6 h-6" />,
  SERVICE_AGREEMENT: <IconBriefcase className="w-6 h-6" />,
  AGENCY_AGREEMENT: <IconFileCheck className="w-6 h-6" />,
  PROPERTY_MANAGEMENT: <IconHome className="w-6 h-6" />,
  PURCHASE_AGREEMENT: <IconShoppingCart className="w-6 h-6" />,
}

const TEMPLATE_COLORS: Record<string, string> = {
  NDA: 'from-blue-500 to-indigo-600',
  MSA: 'from-purple-500 to-pink-600',
  EMPLOYMENT: 'from-green-500 to-emerald-600',
  SERVICE_AGREEMENT: 'from-orange-500 to-red-600',
  AGENCY_AGREEMENT: 'from-cyan-500 to-blue-600',
  PROPERTY_MANAGEMENT: 'from-amber-500 to-orange-600',
  PURCHASE_AGREEMENT: 'from-rose-500 to-pink-600',
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface TemplatesPageNewProps {
  onLogout?: () => void
}

export default function TemplatesPageNew({ onLogout }: TemplatesPageNewProps) {
  // State management
  const [templateTypes, setTemplateTypes] = useState<Record<string, TemplateType>>({})
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [templateContent, setTemplateContent] = useState<TemplateFileContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    fetchTemplateTypes()
  }, [])

  const fetchTemplateTypes = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/templates/types/`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch templates`)
      }

      const data: TemplateTypesResponse = await response.json()

      if (data.success) {
        setTemplateTypes(data.template_types)
      } else {
        throw new Error('Failed to load templates')
      }
    } catch (err: any) {
      console.error('Error fetching templates:', err)
      setError(err.message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplateContent = async (templateType: string) => {
    try {
      setContentLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE_URL}/templates/files/${templateType}/`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch template content`)
      }

      const data: TemplateFileContent = await response.json()

      if (data.success) {
        setTemplateContent(data)
        setSelectedTemplate(templateType)
        setShowPreviewModal(true)
      } else {
        throw new Error('Failed to load template content')
      }
    } catch (err: any) {
      console.error('Error fetching template content:', err)
      setError(err.message || 'Failed to load template content')
    } finally {
      setContentLoading(false)
    }
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handlePreview = (templateType: string) => {
    fetchTemplateContent(templateType)
  }

  const handleDownload = () => {
    if (!templateContent) return

    const blob = new Blob([templateContent.content], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = templateContent.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const closePreviewModal = () => {
    setShowPreviewModal(false)
    setSelectedTemplate(null)
    setTemplateContent(null)
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getTemplateIcon = (templateType: string) => {
    return TEMPLATE_ICONS[templateType] || <IconFileText className="w-6 h-6" />
  }

  const getTemplateColor = (templateType: string) => {
    return TEMPLATE_COLORS[templateType] || 'from-gray-500 to-gray-600'
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F0EB]">
        <Sidebar onLogout={onLogout} />
        <main className="ml-0 lg:ml-[90px] min-h-screen flex items-center justify-center">
          <div className="text-center">
            <IconLoader className="w-12 h-12 animate-spin text-pink-500 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Loading Templates...</p>
          </div>
        </main>
      </div>
    )
  }

  if (error && Object.keys(templateTypes).length === 0) {
    return (
      <div className="min-h-screen bg-[#F2F0EB]">
        <Sidebar onLogout={onLogout} />
        <main className="ml-0 lg:ml-[90px] min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <IconAlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Error Loading Templates</h2>
                <p className="text-sm text-gray-600 mt-1">{error}</p>
              </div>
            </div>
            <button
              onClick={fetchTemplateTypes}
              className="w-full mt-6 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium hover:shadow-lg transition"
            >
              Retry
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F2F0EB]">
      <Sidebar onLogout={onLogout} />
      <main className="ml-0 lg:ml-[90px] min-h-screen">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Contract Templates</h1>
              <p className="text-gray-600 mt-1">
                View and download pre-built contract templates
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg">
              <IconFileText className="w-5 h-5" />
              <span className="font-semibold">{Object.keys(templateTypes).length} Templates</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <IconAlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(templateTypes).map(([templateType, template]) => (
            <div
              key={templateType}
              className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-200 group"
            >
              {/* Card Header */}
              <div className={`bg-gradient-to-r ${getTemplateColor(templateType)} p-6 text-white`}>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                    {getTemplateIcon(templateType)}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold">{template.display_name}</h3>
                    <p className="text-xs text-white/80 mt-1">{templateType}</p>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6">
                <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                  {template.description}
                </p>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handlePreview(templateType)}
                    disabled={contentLoading && selectedTemplate === templateType}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {contentLoading && selectedTemplate === templateType ? (
                      <>
                        <IconLoader className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <IconEye className="w-4 h-4" />
                        Preview
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && templateContent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className={`bg-gradient-to-r ${getTemplateColor(selectedTemplate!)} px-6 py-4 flex items-center justify-between text-white`}>
              <div className="flex items-center gap-3">
                {getTemplateIcon(selectedTemplate!)}
                <div>
                  <h2 className="text-xl font-bold">
                    {templateTypes[selectedTemplate!]?.display_name}
                  </h2>
                  <p className="text-sm text-white/80 mt-0.5">{templateContent.filename}</p>
                </div>
              </div>
              <button
                onClick={closePreviewModal}
                className="p-2 hover:bg-white/20 rounded-lg transition"
              >
                <IconX className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 leading-relaxed">
                    {templateContent.content}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <IconDownload className="w-5 h-5" />
                Download Template
              </button>
              <button
                onClick={closePreviewModal}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { FileText, Upload, CheckCircle, ArrowLeft } from 'lucide-react'

interface Session {
  id: string
  title: string
  description: string
  courses: {
    name: string
  }
}

export default function AssignmentDetail() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [submissionType, setSubmissionType] = useState<'text' | 'pdf'>('text')
  const [textContent, setTextContent] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    const fetchSession = async () => {
      if (!sessionId) return

      const { data } = await supabase
        .from('sessions')
        .select('id, title, description, courses(name)')
        .eq('id', sessionId)
        .single()

      if (data) {
        // @ts-ignore
        setSession(data)
      }
      setLoading(false)
    }

    fetchSession()
  }, [sessionId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !sessionId) return

    setSubmitting(true)
    setError(null)

    let pdfPath = null

    try {
      // 1. Upload PDF if selected
      if (submissionType === 'pdf' && file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}_${sessionId}_${Date.now()}.${fileExt}`
        const filePath = `${sessionId}/${fileName}`

        const { error: uploadError, data } = await supabase.storage
          .from('exams_bucket')
          .upload(filePath, file)

        if (uploadError) throw uploadError
        pdfPath = data.path
      }

      // 2. Call RPC to submit work
      const { data, error: rpcError } = await supabase.rpc('api_submit_work', {
        p_student_auth_id: user.id,
        p_session_id: sessionId,
        p_text_content: submissionType === 'text' ? textContent : null,
        p_pdf_path: pdfPath
      })

      if (rpcError) throw rpcError
      if (data && !data.success) throw new Error(data.error || 'Submission failed')

      setIsSuccess(true)

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-brand-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-10 rounded-[32px] shadow-sm text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-500 w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Submission Secured</h2>
          <p className="text-gray-500 mb-8 text-lg">Awaiting Professor's Review. You will be notified once graded.</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-4 px-6 bg-gray-900 text-white rounded-full font-semibold hover:bg-gray-800 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 py-4 flex items-center gap-4 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-50">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider">{session?.courses.name}</p>
          <h1 className="text-xl font-bold text-gray-900">{session?.title}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Instructions */}
        <section className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Instructions</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{session?.description}</p>
        </section>

        {/* Submission Form */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Submit Your Work</h2>

          <div className="bg-white p-2 rounded-[24px] border border-gray-100 flex mb-6 shadow-sm">
            <button
              onClick={() => setSubmissionType('text')}
              className={`flex-1 py-3 px-4 rounded-[20px] text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${submissionType === 'text' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <FileText size={18} />
              Write Online
            </button>
            <button
              onClick={() => setSubmissionType('pdf')}
              className={`flex-1 py-3 px-4 rounded-[20px] text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${submissionType === 'pdf' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <Upload size={18} />
              Upload PDF
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-500 p-4 rounded-[16px] text-sm">
                {error}
              </div>
            )}

            {submissionType === 'text' ? (
              <div className="bg-white rounded-[24px] border border-gray-100 overflow-hidden shadow-sm">
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Type your answer here..."
                  required
                  className="w-full h-64 p-6 outline-none resize-none text-base text-gray-900 placeholder:text-gray-400"
                />
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-gray-200 rounded-[24px] p-10 text-center hover:border-brand-500 transition-colors group cursor-pointer relative shadow-sm">
                <input
                  type="file"
                  accept=".pdf"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-100 transition-colors">
                  <Upload className="text-brand-600 w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  {file ? file.name : 'Select PDF to upload'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Tap to browse files (PDF only)'}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || (submissionType === 'text' && !textContent) || (submissionType === 'pdf' && !file)}
              className="w-full py-4 px-6 bg-brand-600 text-white rounded-full font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-500/20"
            >
              {submitting ? 'Securing Submission...' : 'Submit Work'}
            </button>
          </form>
        </section>

      </main>
    </div>
  )
}

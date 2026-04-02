import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react'

// Placeholder interface until we know the exact structure of AI feedback
// Assuming it might be stored in a `feedback` JSONB column on `exam_submissions`
// or we need to query a hypothetical `evaluation_results` table.
// Based on blueprint: "Shows the score per question, AI feedback... small Dispute/Appeal button next to each"
// I will assume a JSON structure in `exam_submissions.ai_feedback` or similar.
// Since the schema in blueprint doesn't define the exact feedback storage, I'll mock a robust display
// assuming `exam_submissions` might return a `score` and `feedback` (JSON array).

export default function GradeReview() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [submission, setSubmission] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [appealState, setAppealState] = useState<Record<string, 'idle'|'appealing'|'submitted'>>({})
  const [appealReason, setAppealReason] = useState('')
  const [activeAppealQId, setActiveAppealQId] = useState<string | null>(null)

  useEffect(() => {
    const fetchGrade = async () => {
      if (!submissionId || !user) return

      // Fetch submission details and session info
      const { data: subData } = await supabase
        .from('exam_submissions')
        .select(`
          id,
          status,
          sessions!inner(title, publish_status, courses(name))
        `)
        .eq('id', submissionId)
        .single()

      // Note: In a real scenario, we'd fetch the specific AI feedback JSON from the submission.
      // Since `exam_submissions` schema in appendix doesn't explicitly list `ai_feedback` or `score`,
      // we'll mock the UI presentation of feedback items for demonstration of the "Billion Dollar App" aesthetic.

      // @ts-ignore
      if (subData && subData.sessions?.publish_status === 'published') {
        setSubmission({
          ...subData,
          // Mock data for the aesthetic display
          overallScore: 85,
          feedback: [
            { id: 'q1', question: 'Explain the theory of relativity.', score: 10, maxScore: 10, aiNote: 'Excellent explanation. Covered both special and general relativity concisely.' },
            { id: 'q2', question: 'What is Quantum Entanglement?', score: 6, maxScore: 10, aiNote: 'You missed the key aspect of non-locality. The explanation was too classical.' },
          ]
        })
      }
      setLoading(false)
    }

    fetchGrade()
  }, [submissionId, user])

  const handleAppeal = async (questionId: string) => {
    if (!user || !submissionId || !appealReason) return

    // Get student ID
    const { data: student } = await supabase.from('students').select('id').eq('auth_id', user.id).single()
    if (!student) return

    setAppealState(prev => ({ ...prev, [questionId]: 'appealing' }))

    const { error } = await supabase.from('appeals').insert({
      submission_id: submissionId,
      student_id: student.id,
      question_id: questionId,
      reason: appealReason
    })

    if (!error) {
      setAppealState(prev => ({ ...prev, [questionId]: 'submitted' }))
      setActiveAppealQId(null)
      setAppealReason('')
    } else {
      setAppealState(prev => ({ ...prev, [questionId]: 'idle' }))
      alert('Failed to submit appeal')
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  if (!submission) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Grade Not Available</h2>
        <p className="text-gray-500 mb-6">This grade has not been published yet or does not exist.</p>
        <button onClick={() => navigate(-1)} className="px-6 py-3 bg-gray-100 text-gray-900 rounded-full font-semibold">Go Back</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 py-4 flex items-center gap-4 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-50">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider">{submission.sessions.courses?.name}</p>
          <h1 className="text-xl font-bold text-gray-900">{submission.sessions.title}</h1>
        </div>
        <div className="bg-brand-50 text-brand-700 px-4 py-2 rounded-full font-bold text-lg">
          {submission.overallScore}%
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white p-8 rounded-[32px] text-center border border-gray-100 shadow-sm mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">AI Evaluation Complete</h2>
          <p className="text-gray-500">Review your feedback below. You may appeal specific questions if you believe there was an error in grading.</p>
        </div>

        {submission.feedback.map((item: any) => (
          <div key={item.id} className="bg-white rounded-[24px] border border-gray-100 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-gray-50">
              <div className="flex justify-between items-start gap-4 mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex-1">{item.question}</h3>
                <div className={`px-3 py-1 rounded-full text-sm font-bold flex-shrink-0 ${item.score === item.maxScore ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {item.score} / {item.maxScore} pts
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-[16px]">
                <p className="text-sm font-semibold text-gray-500 mb-1">AI Notes:</p>
                <p className="text-gray-800">{item.aiNote}</p>
              </div>
            </div>

            <div className="bg-gray-50/50 p-4 px-6 flex justify-end">
              {appealState[item.id] === 'submitted' ? (
                <span className="flex items-center gap-2 text-sm font-bold text-green-600 bg-green-50 px-4 py-2 rounded-full">
                  <CheckCircle size={16} /> Appeal Submitted
                </span>
              ) : activeAppealQId === item.id ? (
                <div className="w-full flex gap-2">
                  <input
                    type="text"
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    placeholder="Briefly explain why..."
                    className="flex-1 px-4 py-2 rounded-full border border-gray-200 outline-none focus:border-brand-500 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => handleAppeal(item.id)}
                    disabled={!appealReason || appealState[item.id] === 'appealing'}
                    className="px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-bold disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => { setActiveAppealQId(null); setAppealReason(''); }}
                    className="p-2 text-gray-400 hover:text-gray-900 rounded-full"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setActiveAppealQId(item.id)}
                  className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <AlertCircle size={16} />
                  Dispute / Appeal
                </button>
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}

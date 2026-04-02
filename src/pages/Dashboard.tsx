import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import JoinClassModal from '../components/JoinClassModal'
import { Plus, BookOpen, Clock, CheckCircle } from 'lucide-react'

// Define types based on schema
interface Course {
  id: string
  name: string
  description: string
}

interface ClassEnrollment {
  id: string
  course_id: string
  courses: Course
}

interface Session {
  id: string
  course_id: string
  title: string
  description: string
  publish_status: string
  courses?: Course
}

interface ExamSubmission {
  id: string
  session_id: string
  status: string
  sessions: Session
}

export default function Dashboard() {
  const { user } = useAuth()
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([])
  const [pendingSessions, setPendingSessions] = useState<Session[]>([])
  const [gradedSubmissions, setGradedSubmissions] = useState<ExamSubmission[]>([])
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    // 1. Fetch student ID
    const { data: studentData } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('auth_id', user.id)
      .single()

    if (!studentData) {
      setLoading(false)
      return
    }

    // 2. Fetch Enrollments
    const { data: enrollmentsData } = await supabase
      .from('class_enrollments')
      .select('id, course_id, courses(id, name, description)')
      .eq('student_id', studentData.id)

    if (enrollmentsData) {
      // @ts-ignore - Supabase nested types issue
      setEnrollments(enrollmentsData)
    }

    // 3. Fetch submissions for this student
    const { data: submissionsData } = await supabase
      .from('exam_submissions')
      .select('id, session_id, status, sessions(id, course_id, title, description, publish_status)')
      .eq('student_name', studentData.full_name)

    // Separate graded and identify sessions student has already submitted to
    const submittedSessionIds = new Set<string>()
    const graded: ExamSubmission[] = []

    if (submissionsData) {
      submissionsData.forEach(sub => {
        // @ts-ignore
        submittedSessionIds.add(sub.session_id)
        // @ts-ignore
        if (sub.status === 'completed' && sub.sessions?.publish_status === 'published') {
           // @ts-ignore
          graded.push(sub)
        }
      })
    }
    setGradedSubmissions(graded)

    // 4. Fetch all sessions for enrolled courses, to find pending ones
    if (enrollmentsData && enrollmentsData.length > 0) {
      const courseIds = enrollmentsData.map(e => e.course_id)
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('id, course_id, title, description, publish_status, courses(id, name)')
        .in('course_id', courseIds)

      if (sessionsData) {
        // Filter sessions the student hasn't submitted to yet
        const pending = sessionsData.filter(session => !submittedSessionIds.has(session.id))
        // @ts-ignore
        setPendingSessions(pending)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [user])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white sticky top-0 z-10 border-b border-gray-100 px-6 py-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Student Portal</h1>
        <button onClick={handleLogout} className="text-sm font-medium text-gray-500 hover:text-gray-900">
          Sign out
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-10">

        {/* Classes Section */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">My Classes</h2>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-700 rounded-full text-sm font-semibold hover:bg-brand-100 transition-colors"
            >
              <Plus size={16} />
              Join Class
            </button>
          </div>

          {enrollments.length === 0 ? (
            <div className="bg-white rounded-[24px] p-8 text-center border border-gray-100 shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="text-gray-400" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No classes yet</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">Join your first class to see assignments and grades from your professor.</p>
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="px-6 py-3 bg-brand-600 text-white rounded-full font-semibold hover:bg-brand-700 transition-colors"
              >
                Join a Class
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {enrollments.map((enrollment) => (
                <div key={enrollment.id} className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-brand-50 rounded-full flex items-center justify-center mb-4">
                    <BookOpen className="text-brand-600" size={20} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">{enrollment.courses.name}</h3>
                  <p className="text-gray-500 text-sm mt-1 line-clamp-2">{enrollment.courses.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending Assignments */}
        {pendingSessions.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Clock className="text-amber-500" size={24} />
              Pending Assignments
            </h2>
            <div className="space-y-4">
              {pendingSessions.map((session) => (
                <Link
                  key={session.id}
                  to={`/assignment/${session.id}`}
                  className="block bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm hover:border-brand-300 transition-colors group"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-1">{session.courses?.name}</p>
                      <h3 className="font-bold text-gray-900 text-lg group-hover:text-brand-600 transition-colors">{session.title}</h3>
                      <p className="text-gray-500 text-sm mt-1 line-clamp-1">{session.description}</p>
                    </div>
                    <div className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold">
                      To Do
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recently Graded */}
        {gradedSubmissions.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <CheckCircle className="text-green-500" size={24} />
              Recently Graded
            </h2>
            <div className="space-y-4">
              {gradedSubmissions.map((sub) => (
                <Link
                  key={sub.id}
                  to={`/grade/${sub.id}`}
                  className="block bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm hover:border-green-300 transition-colors group"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg group-hover:text-green-600 transition-colors">{sub.sessions.title}</h3>
                      <p className="text-gray-500 text-sm mt-1">Review your AI feedback</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 group-hover:bg-green-100 transition-colors">
                      <span className="font-bold">→</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </main>

      <JoinClassModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  )
}

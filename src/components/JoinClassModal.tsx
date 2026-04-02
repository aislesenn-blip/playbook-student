import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function JoinClassModal({ isOpen, onClose, onSuccess }: Props) {
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  if (!isOpen) return null

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('api_join_class', {
      p_student_auth_id: user.id,
      p_join_code: joinCode
    })

    if (rpcError) {
      setError(rpcError.message)
    } else if (data && !data.success) {
      setError(data.error || 'Failed to join class')
    } else {
      onSuccess()
      onClose()
    }

    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-[24px] shadow-xl overflow-hidden">
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-50">
          <h3 className="text-xl font-bold text-gray-900">Join a Class</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleJoin} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-[16px] text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="joinCode">
              Class Code
            </label>
            <input
              id="joinCode"
              type="text"
              required
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-4 rounded-[16px] bg-gray-50 border-none focus:ring-2 focus:ring-brand-500 outline-none text-base text-center tracking-[0.2em] font-mono font-bold uppercase placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:lowercase"
              placeholder="e.g. A1B2C3"
            />
            <p className="mt-2 text-xs text-gray-500 text-center">Ask your teacher for the 6-digit class code</p>
          </div>

          <button
            type="submit"
            disabled={loading || joinCode.length < 6}
            className="w-full py-4 px-4 bg-brand-600 text-white rounded-full font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Joining...' : 'Join Class'}
          </button>
        </form>
      </div>
    </div>
  )
}

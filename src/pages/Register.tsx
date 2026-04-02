import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [regNumber, setRegNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 1. Register with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      // 2. Create student record
      const { error: dbError } = await supabase.from('students').insert({
        auth_id: authData.user.id,
        email,
        full_name: fullName,
        registration_number: regNumber
      })

      if (dbError) {
        setError(dbError.message)
      } else {
        navigate('/')
      }
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-[24px] shadow-sm border border-gray-100">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Create Account</h2>
          <p className="mt-2 text-sm text-gray-500">Join the student portal</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-[16px] text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="sr-only" htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-4 rounded-[16px] bg-gray-50 border-none focus:ring-2 focus:ring-brand-500 outline-none text-base"
                placeholder="Full Name"
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="regNumber">Registration Number (Optional)</label>
              <input
                id="regNumber"
                type="text"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
                className="w-full px-4 py-4 rounded-[16px] bg-gray-50 border-none focus:ring-2 focus:ring-brand-500 outline-none text-base"
                placeholder="Registration Number (Optional)"
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-4 rounded-[16px] bg-gray-50 border-none focus:ring-2 focus:ring-brand-500 outline-none text-base"
                placeholder="Email address"
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-4 rounded-[16px] bg-gray-50 border-none focus:ring-2 focus:ring-brand-500 outline-none text-base"
                placeholder="Password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-4 bg-brand-600 text-white rounded-full font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Thermometer, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@coldchain.demo');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    setLoading(true);
    await new Promise(r => setTimeout(r, 600)); // simulate network
    const result = login(email, password);
    setLoading(false);
    if (result.success) {
      navigate('/overview');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] relative overflow-hidden">
      {/* Background soft ambient gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-100/40 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md px-4 py-8">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-md shadow-blue-500/20 mb-3">
            <Thermometer size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
            ColdChain <span className="text-blue-600">Sentinel</span>
          </h1>
          <p className="text-slate-500 text-xs">Vaccine Cold-Chain Monitoring Platform</p>
        </div>

        {/* Demo notice */}
        <div className="flex items-start gap-3 p-3.5 mb-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold text-amber-800 mb-0.5">Demo Prototype Authentication</p>
            <p className="text-amber-700">Use preloaded credentials below to access the live dashboard.</p>
          </div>
        </div>

        {/* Login card */}
        <div className="clean-card p-7 shadow-lg">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900 mb-0.5">Operator Sign In</h2>
            <p className="text-xs text-slate-500">Access your cold chain telemetry console</p>
          </div>

          {/* Demo credentials hint */}
          <div className="p-3 mb-5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs text-slate-600 mb-1">
              <span className="font-semibold text-slate-900">Demo Email:</span> admin@coldchain.demo
            </p>
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Demo Password:</span> Admin@123
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                placeholder="admin@coldchain.demo"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(o => !o)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <Shield size={14} />
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-md shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full spinner" />
                  Signing in...
                </>
              ) : (
                'Sign In to Dashboard'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          ColdChain Sentinel © 2026 · Hackathon Prototype
        </p>
      </div>
    </div>
  );
}

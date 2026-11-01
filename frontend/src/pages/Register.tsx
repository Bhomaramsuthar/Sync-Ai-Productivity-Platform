import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Sparkles } from 'lucide-react';
import { toast } from '../utils/toast';

const Register = () => {
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      toast.warning('Password Mismatch', 'Passwords do not match. Please re-enter.');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      toast.warning('Password Too Short', 'Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/register', { name, email, password });
      toast.success('Account Created', 'Registration successful! Please sign in.');
      navigate(redirectUrl ? `/login?redirect=${encodeURIComponent(redirectUrl)}` : '/login');

    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Registration failed. Please try again.';
      setError(msg);
      toast.error('Registration Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#ffffff', boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)' }}>
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="auth-title" style={{ margin: 0 }}>Create Account</h1>
            <p className="auth-subtitle" style={{ margin: 0 }}>Join Sync AI Productivity Platform</p>
          </div>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="name">Full Name</label>
            <input 
              className="form-input"
              id="name"
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required 
              placeholder="Alice Johnson"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="email">Work Email</label>
            <input 
              className="form-input"
              id="email"
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
              placeholder="alice@company.com"
            />
          </div>
          
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="password">Password</label>
            <input 
              className="form-input"
              id="password"
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              placeholder="••••••••"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
            <input 
              className="form-input"
              id="confirmPassword"
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required 
              placeholder="••••••••"
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '6px', padding: '0.75rem' }} disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        
        <div className="auth-links">
          Already have an account? <Link to={redirectUrl ? `/login?redirect=${encodeURIComponent(redirectUrl)}` : '/login'} style={{ fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;

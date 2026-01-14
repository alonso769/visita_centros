import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Si solo ponen usuario, le agregamos el dominio falso automáticamente
      const finalEmail = email.includes('@') ? email : `${email}@sistema.local`;
      await signInWithEmailAndPassword(auth, finalEmail, pass);
    } catch (err) {
      console.error(err);
      setError('Credenciales incorrectas o error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card-modern">
        
        {/* Cabecera con Icono */}
        <div className="login-header">
          <div className="logo-circle">
            <ShieldCheck size={32} color="#2563eb" />
          </div>
          <h1>UFDI Acceso</h1>
          <p>Sistema de Supervisión de Internos</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          
          {/* Input Usuario */}
          <div className="input-group-modern">
            <User className="input-icon" size={20} />
            <input 
              type="text" 
              placeholder="Usuario o Correo" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required
            />
          </div>

          {/* Input Contraseña */}
          <div className="input-group-modern">
            <Lock className="input-icon" size={20} />
            <input 
              type={showPass ? "text" : "password"} 
              placeholder="Contraseña" 
              value={pass} 
              onChange={e => setPass(e.target.value)} 
              required
            />
            <button 
              type="button" 
              className="toggle-pass"
              onClick={() => setShowPass(!showPass)}
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Mensaje de Error */}
          {error && <div className="error-banner">{error}</div>}

          {/* Botón Submit */}
          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? "Verificando..." : "INICIAR SESIÓN"}
          </button>

        </form>
        
        <div className="login-footer">
          <p>© 2025 UFDI - Solo personal autorizado</p>
        </div>
      </div>
    </div>
  );
}
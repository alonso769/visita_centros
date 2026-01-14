import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setRole(docSnap.data().role);
        else setRole('user');
        setUser(currentUser);
      } else {
        setUser(null); setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="loading" style={{textAlign:'center', marginTop:'50px'}}>Cargando sistema UFDI...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/" element={!user ? <Login /> : (role === 'admin' ? <Navigate to="/admin" /> : <Navigate to="/dashboard" />)} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} isAdmin={role === 'admin'} /> : <Navigate to="/" />} />
        <Route path="/admin" element={user && role === 'admin' ? <AdminPanel user={user} /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
export default App;

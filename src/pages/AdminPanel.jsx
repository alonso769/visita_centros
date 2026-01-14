import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { db, auth, secondaryAppValues } from '../firebase';
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, setDoc, doc, Timestamp, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Calendar as CalIcon, Users, LogOut, MapPin, Trash2, Printer, BarChart2, Eye, X, Shield, Filter, AlertTriangle, AlertOctagon, CheckCircle, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { healthCenters } from '../data'; 
import * as XLSX from 'xlsx';

const COLORS_SUPERVISOR = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const COLORS_STATUS = ['#10b981', '#ef4444']; 

export default function AdminPanel({ user }) {
  const [tab, setTab] = useState('calendar');
  const [users, setUsers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [date, setDate] = useState(new Date());
  const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7)); 
  const [newUser, setNewUser] = useState({ name: '', pass: '' });
  const [selectedVisit, setSelectedVisit] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    loadVisits();
    if (tab === 'users') loadUsers();
  }, [tab]);

  const loadUsers = async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { console.error("Error usuarios", error); }
  };

  const loadVisits = async () => {
    try {
      const snap = await getDocs(collection(db, "asistencia"));
      const visitsData = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, date: data.entryTime ? data.entryTime.toDate() : new Date() };
      });
      setVisits(visitsData);
    } catch (error) { console.error("Error visitas", error); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if(!newUser.name || !newUser.pass) return alert("Complete los campos");
    try {
      const secondaryApp = initializeApp(secondaryAppValues, "Secondary");
      const secondaryAuth = getAuth(secondaryApp);
      const email = `${newUser.name}@sistema.local`;
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, newUser.pass);
      await setDoc(doc(db, "users", cred.user.uid), {
        username: newUser.name, email: email, role: 'user', created: Timestamp.now(), passwordVisible: newUser.pass // Guardamos pass solo para admin
      });
      alert(`Usuario ${newUser.name} creado.`);
      setNewUser({ name: '', pass: '' }); 
      loadUsers();
    } catch (err) { alert("Error: " + err.message); }
  };

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();
    const summaryData = selectedVisitsForTable.map(v => ({
      Centro: v.centerName, Supervisor: v.username, Tutor: v.tutorName || '-', Internos: v.registeredInterns?.length || 0, Estado: v.locationCorrect === 'no' ? 'ERROR GPS' : 'OK'
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, wsSummary, "Resumen Diario");

    selectedVisitsForTable.forEach((v, index) => {
      const detailData = [
        { A: "CENTRO:", B: v.centerName },
        { A: "SUPERVISOR:", B: v.username },
        { A: "TUTOR:", B: v.tutorName || "-" },
        { A: "OBSERVACIONES:", B: v.observations || "-" },
        { A: "", B: "" },
        { A: "DNI", B: "NOMBRE", C: "CARRERA", D: "UNIVERSIDAD" }
      ];
      v.registeredInterns?.forEach(int => {
        detailData.push({ A: int.dni, B: int.name, C: int.career, D: int.university });
      });
      const wsDetail = XLSX.utils.json_to_sheet(detailData, { skipHeader: true });
      let sName = v.centerName.substring(0, 25).replace(/[\[\]\*\?\/\\]/g, "");
      if (workbook.SheetNames.includes(sName)) sName += ` ${index}`;
      XLSX.utils.book_append_sheet(workbook, wsDetail, sName);
    });
    XLSX.writeFile(workbook, `Reporte_UFDI_${date.toISOString().split('T')[0]}.xlsx`);
  };

  const [selectedYear, selectedMonthStr] = statsMonth.split('-');
  const filteredVisitsByMonth = visits.filter(v => 
    v.date.getFullYear() === parseInt(selectedYear) && v.date.getMonth() + 1 === parseInt(selectedMonthStr)
  );
  const uniqueVisitedNames = [...new Set(filteredVisitsByMonth.map(v => v.centerName))];
  const notVisitedCenters = healthCenters.filter(c => !uniqueVisitedNames.includes(c.nombre));
  const coverageData = [{ name: 'Visitados', value: uniqueVisitedNames.length }, { name: 'Pendientes', value: notVisitedCenters.length }];
  const visitsByCenter = filteredVisitsByMonth.reduce((acc, curr) => {
    const found = acc.find(x => x.name === curr.centerName);
    if(found) found.count += 1; else acc.push({ name: curr.centerName, count: 1 });
    return acc;
  }, []).sort((a,b) => b.count - a.count);
  const visitsByUser = filteredVisitsByMonth.reduce((acc, curr) => {
    const name = curr.username || 'Desconocido';
    const found = acc.find(x => x.name === name);
    if(found) found.value += 1; else acc.push({ name: name, value: 1 });
    return acc;
  }, []);

  const selectedVisitsForTable = visits.filter(v => v.date.toDateString() === date.toDateString());

  return (
    <div className="admin-wrapper">
      <style>{`
        .admin-wrapper { font-family: 'Inter', sans-serif; background: #f8fafc; min-height: 100vh; }
        .stats-grid-complex { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
        .full-width-card { grid-column: span 2; }
        .alert-list { list-style: none; padding: 0; max-height: 300px; overflow-y: auto; }
        .alert-list li { display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid #fee2e2; color: #991b1b; background: #fff5f5; border-radius: 4px; margin-bottom: 5px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 12px; width: 90%; max-width: 750px; padding: 30px; max-height: 85vh; overflow-y: auto; }
        .obs-box { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 15px 0; font-style: italic; }
        .kpi-row { display: flex; gap: 20px; margin-top: 15px; }
        .kpi-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; }
        @media print { .no-print { display: none !important; } .admin-wrapper { background: white !important; } }
      `}</style>

      <nav className="navbar no-print">
        <div className="nav-brand">
            <Shield size={24} color="#2563eb" /> <h1 style={{marginLeft:'10px'}}>Panel Administrativo</h1>
        </div>
        <div className="nav-actions">
           <button onClick={() => navigate('/dashboard')} className="btn-secondary">Modo Supervisor</button>
           <button onClick={() => auth.signOut()} className="btn-logout">Salir</button>
        </div>
      </nav>

      <div className="main-container">
        <div className="admin-tabs no-print">
            <button className={`tab-btn ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}><CalIcon size={18}/> Gestión Diaria</button>
            <button className={`tab-btn ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}><BarChart2 size={18}/> Estadísticas</button>
            <button className={`tab-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}><Users size={18}/> Usuarios</button>
        </div>

        <div className="tab-content-wrapper">
            {tab === 'calendar' && (
                <div className="admin-grid">
                    <div className="left-panel no-print"><div className="card calendar-card"><h3>Calendario</h3><Calendar onChange={setDate} value={date} tileContent={({ date, view }) => view === 'month' && visits.some(v => v.date.toDateString() === date.toDateString()) ? <div className="dot-indicator"></div> : null} /></div></div>
                    <div className="right-panel">
                        <div className="card table-card">
                            <div className="card-header-row">
                                <h3>Reporte del {date.toLocaleDateString()}</h3>
                                <div className="flex gap-2 no-print">
                                    <button onClick={exportToExcel} className="btn-secondary" style={{color: '#16a34a'}}><Download size={16}/> Excel</button>
                                    <button onClick={() => window.print()} className="btn-secondary"><Printer size={16}/> Imprimir</button>
                                </div>
                            </div>
                            <table className="modern-table">
                                <thead><tr><th>Centro</th><th>Supervisor</th><th>Tutor</th><th className="text-center">Estado</th><th className="no-print">Acción</th></tr></thead>
                                <tbody>
                                    {selectedVisitsForTable.map((v) => (
                                        <tr key={v.id}>
                                            <td className="fw-bold">{v.centerName}</td><td>{v.username}</td><td>{v.tutorName || '-'}</td>
                                            <td className="text-center">{v.locationCorrect === 'no' ? <span className="status-err">⚠️ GPS</span> : <span className="status-ok">✅ OK</span>}</td>
                                            <td className="no-print">
                                                <button onClick={() => setSelectedVisit(v)} className="btn-icon btn-view"><Eye size={16}/></button>
                                                <button onClick={() => deleteDoc(doc(db, "asistencia", v.id)).then(loadVisits)} className="btn-icon btn-del"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'stats' && (
                <div className="stats-layout">
                    <div className="card filter-card"><div className="flex items-center gap-3"><Filter size={20} color="#2563eb"/><h3>Análisis Mensual</h3><input type="month" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} className="modern-input" /></div></div>
                    <div className="stats-grid-complex">
                        <div className="card chart-card"><h3>Cobertura</h3><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={coverageData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value">{coverageData.map((e, i) => <Cell key={i} fill={COLORS_STATUS[i]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
                            <div className="kpi-row"><div className="kpi-card" style={{background:'#ecfdf5'}}>Visitados: {uniqueVisitedNames.length}</div><div className="kpi-card" style={{background:'#fef2f2'}}>Pendientes: {notVisitedCenters.length}</div></div>
                        </div>
                        <div className="card chart-card"><h3>Rendimiento</h3><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={visitsByUser} cx="50%" cy="50%" outerRadius={70} dataKey="value" label>{visitsByUser.map((e, i) => <Cell key={i} fill={COLORS_SUPERVISOR[i % COLORS_SUPERVISOR.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
                        <div className="card chart-card full-width-card"><h3>Frecuencia por Centro</h3><ResponsiveContainer width="100%" height={250}><BarChart data={visitsByCenter}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70} style={{fontSize: '9px'}}/><YAxis /><Tooltip /><Bar dataKey="count" fill="#2563eb" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>
                        <div className="card full-width-card"><h3>Centros Pendientes</h3><ul className="alert-list">{notVisitedCenters.map((c, i) => <li key={i}><AlertTriangle size={14}/> {c.nombre}</li>)}</ul></div>
                    </div>
                </div>
            )}

            {tab === 'users' && (
                <div className="users-layout" style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
                    <div className="card create-user-card">
                        <h3>Crear Usuario</h3>
                        <form onSubmit={handleCreateUser} style={{display:'flex', flexDirection:'column', gap:'10px', marginTop:'15px'}}>
                            <input placeholder="Usuario (ej: jramos)" value={newUser.name} onChange={e=>setNewUser({...newUser, name:e.target.value})} className="modern-input" />
                            <input type="text" placeholder="Contraseña" value={newUser.pass} onChange={e=>setNewUser({...newUser, pass:e.target.value})} className="modern-input" />
                            <button type="submit" className="btn-primary">Registrar Personal</button>
                        </form>
                    </div>
                    <div className="card">
                        <h3>Usuarios del Sistema</h3>
                        <table className="modern-table">
                            <thead><tr><th>Usuario</th><th>Contraseña</th><th>Rol</th><th>Registro</th></tr></thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td className="fw-bold">{u.username}</td>
                                        <td style={{fontFamily:'monospace', color:'#2563eb'}}>{u.passwordVisible || '******'}</td>
                                        <td><span className={`badge-${u.role}`}>{u.role}</span></td>
                                        <td>{u.created?.toDate().toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      </div>

      {selectedVisit && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <div className="modal-header">
              <div><h2 style={{margin:0}}>Detalle de Supervisión</h2><p style={{fontSize:'13px', color:'#64748b'}}>{selectedVisit.centerName} — {selectedVisit.date.toLocaleDateString()}</p></div>
              <div className="flex gap-2"><button onClick={() => window.print()} className="btn-secondary no-print"><Printer size={14}/> Imprimir Ficha</button><button onClick={() => setSelectedVisit(null)} className="btn-close no-print"><X size={20}/></button></div>
            </div>
            <div className="modal-body printable-area">
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                <div><label style={{fontSize:'11px', fontWeight:'700', color:'#64748b'}}>SUPERVISOR</label><p>{selectedVisit.username}</p></div>
                <div><label style={{fontSize:'11px', fontWeight:'700', color:'#64748b'}}>TUTOR</label><p>{selectedVisit.tutorName || '-'}</p></div>
              </div>
              <div className="obs-box"><label style={{fontSize:'11px', fontWeight:'700', color:'#64748b'}}>OBSERVACIONES</label><p style={{margin:'5px 0 0 0'}}>{selectedVisit.observations || 'Sin observaciones.'}</p></div>
              <h4 style={{marginBottom:'10px', display:'flex', alignItems:'center', gap:'8px'}}><Users size={16}/> Internos ({selectedVisit.registeredInterns?.length || 0})</h4>
              <table className="modern-table printable-table" style={{width:'100%'}}>
                <thead><tr><th>DNI</th><th>Nombre</th><th>Carrera / Universidad</th></tr></thead>
                <tbody>{selectedVisit.registeredInterns?.map((int, idx) => (<tr key={idx}><td style={{fontWeight:'bold'}}>{int.dni}</td><td>{int.name}</td><td style={{fontSize:'12px'}}><strong>{int.career}</strong><br/>{int.university}</td></tr>))}</tbody>
              </table>
            </div>
            <div className="modal-footer no-print"><button onClick={() => setSelectedVisit(null)} className="btn-primary" style={{width:'100%'}}>Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
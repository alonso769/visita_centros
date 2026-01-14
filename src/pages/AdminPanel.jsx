import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { db, auth, secondaryAppValues } from '../firebase';
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, setDoc, doc, Timestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Calendar as CalIcon, Users, LogOut, MapPin, Trash2, Printer, BarChart2, Eye, X, Shield, Filter, AlertTriangle, FileText, Upload, Play, Loader, Download, Database } from 'lucide-react';
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

  // --- ESTADOS PARA CARGA MASIVA ---
  const [bulkDnis, setBulkDnis] = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState(""); // Nuevo estado para subida a Firebase

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

  // =========================================================================
  //  NUEVA LÓGICA: IMPORTAR EXCEL A FIREBASE CON FORMATO DE FECHA CORRECTO
  // =========================================================================

  // Función auxiliar para convertir fecha de Excel (número serial) a DD/MM/YYYY
  const excelDateToJSDate = (serial) => {
     if (!serial) return "-";
     // Si ya es texto (ej: "01/02/2026"), lo devolvemos tal cual
     if (typeof serial === 'string') return serial;
     
     // Si es número (ej: 46028), lo convertimos
     const utc_days  = Math.floor(serial - 25569);
     const utc_value = utc_days * 86400;                                      
     const date_info = new Date(utc_value * 1000);
     
     // Ajuste de zona horaria simple para evitar que reste un día
     const day = date_info.getUTCDate().toString().padStart(2, '0');
     const month = (date_info.getUTCMonth() + 1).toString().padStart(2, '0');
     const year = date_info.getUTCFullYear();
     
     return `${day}/${month}/${year}`;
  };

  const handleExcelDbUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadStatus("Leyendo archivo Excel...");
    const reader = new FileReader();

    reader.onload = async (evt) => {
        try {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            
            // Convertimos a JSON pero mantenemos los nombres de las columnas de tu imagen
            const data = XLSX.utils.sheet_to_json(ws);

            if (data.length === 0) {
                alert("El archivo parece vacío");
                setUploadStatus("");
                return;
            }

            setUploadStatus(`Procesando ${data.length} registros...`);
            
            // Usamos 'batch' para subir rápido (de 500 en 500 es lo ideal, aquí haremos uno por uno seguro)
            let count = 0;
            const batch = writeBatch(db);
            
            // Mapeo de tus columnas exactas a variables limpias
            for (const row of data) {
                // Aseguramos que el DNI exista para usarlo como ID
                const dni = row['DNI/CE/P'] || row['DNI'] || row['dni'];
                if (!dni) continue;

                const docData = {
                    apellidoPaterno: row['APELLIDO PATERNO'] || '',
                    apellidoMaterno: row['APELLIDO MATERNO'] || '',
                    nombres: row['NOMBRES'] || '',
                    dni: String(dni).trim(),
                    carrera: row['CARRERA PROFESIONAL'] || '',
                    universidad: row['UNIVERSIDAD'] || '',
                    sedeDocente: row['SEDE DOCENTE'] || '',
                    
                    // APLICAMOS LA CONVERSIÓN DE FECHAS AQUÍ
                    fechaInicioInternado: excelDateToJSDate(row['FECHA DE INICIO DE INTERNADO']),
                    fechaFinInternado: excelDateToJSDate(row['FECHA DE TÉRMINO DE INTERNADO']),
                    
                    rotacionNombre: row['NOMBRE ROTACION'] || '',
                    rotacionSede: row['SEDE DE ROTACION'] || '',
                    
                    rotacionInicio: excelDateToJSDate(row['FECHA INICIO']), // Columna FECHA INICIO de rotación
                    rotacionFin: excelDateToJSDate(row['FECHA FIN']),       // Columna FECHA FIN de rotación
                    
                    tutorNombre: row['TUTOR DE SEDE DE ROTACIÓN'] || '',
                    tutorCelular: row['CELULAR DEL TUTOR'] || '',
                    tutorCorreo: row['CORREO TUTOR'] || '',
                    
                    fechaRegistro: Timestamp.now()
                };

                // Guardamos en la colección "internos_general" usando el DNI como ID
                const docRef = doc(db, "internos_general", String(dni).trim());
                await setDoc(docRef, docData);
                count++;
            }

            setUploadStatus(`✅ ¡Éxito! Se guardaron ${count} internos en la base de datos.`);
            alert(`Carga completada: ${count} registros subidos a Firebase.`);

        } catch (error) {
            console.error("Error procesando excel:", error);
            setUploadStatus("❌ Error al procesar el archivo.");
            alert("Error: " + error.message);
        }
    };
    reader.readAsBinaryString(file);
  };

  // ---------------------------------------------------------
  // ROBOT (CÓDIGO ANTIGUO PARA BÚSQUEDA INDIVIDUAL)
  // ---------------------------------------------------------
  const processBulkList = async () => {
    const dnis = bulkDnis.split(/[\n,]+/).map(d => d.trim()).filter(d => d.length === 8 && !isNaN(d));
    if (dnis.length === 0) return alert("No se detectaron DNIs válidos (8 dígitos).");
    setIsProcessing(true);
    setBulkResults([]); 
    setProgress({ current: 0, total: dnis.length });
    const results = [];
    for (let i = 0; i < dnis.length; i++) {
        const dni = dnis[i];
        setProgress({ current: i + 1, total: dnis.length });
        try {
            const API_URL = "http://127.0.0.1:3002/api/buscar-dni"; 
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni })
            });
            const data = await response.json();
            if (data.success && data.found) {
                results.push({ dni, status: '✅ Encontrado', ...data.data });
            } else {
                results.push({ dni, status: '❌ No hallado', nombres: '-', apePat: '-', apeMat: '-', universidad: '-', carrera: '-', fechaInicio: '-', fechaFin: '-', resolucion: '-' });
            }
        } catch (error) {
            results.push({ dni, status: '⚠️ Error Conexión', nombres: error.message, apePat: '-', apeMat: '-', universidad: '-', carrera: '-', fechaInicio: '-', fechaFin: '-', resolucion: '-' });
        }
        setBulkResults([...results]);
    }
    setIsProcessing(false);
    alert("¡Procesamiento completado!");
  };

  const exportBulkResults = () => {
    if (bulkResults.length === 0) return alert("No hay datos para exportar");
    const ws = XLSX.utils.json_to_sheet(bulkResults);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados Masivos");
    XLSX.writeFile(wb, `Reporte_Masivo_${new Date().toISOString().slice(0,10)}.xlsx`);
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
        username: newUser.name, email: email, role: 'user', created: Timestamp.now(), passwordVisible: newUser.pass 
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
    XLSX.writeFile(workbook, `Reporte_Diario_${date.toISOString().split('T')[0]}.xlsx`);
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
        .modal-content { background: white; border-radius: 12px; width: 90%; max-width: 900px; padding: 30px; max-height: 85vh; overflow-y: auto; }
        .bulk-area textarea { width: 100%; height: 150px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 10px; font-family: monospace; }
        .progress-bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin: 15px 0; }
        .progress-fill { height: 100%; background: #2563eb; transition: width 0.3s ease; }
        .bulk-table-container { max-height: 400px; overflow-y: auto; margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .badge-found { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; }
        .badge-error { background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; }
        .db-upload-box { background: #f0f9ff; border: 2px dashed #0ea5e9; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 25px; }
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
            <button className={`tab-btn ${tab === 'bulk' ? 'active' : ''}`} onClick={() => setTab('bulk')}><Database size={18}/> Base de Datos</button>
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

            {tab === 'bulk' && (
                <div className="card bulk-area">
                    <div className="card-header-row">
                        <h3><Database size={20} style={{verticalAlign:'bottom'}}/> Base de Datos de Internos</h3>
                    </div>

                    {/* ZONA DE CARGA DE BASE DE DATOS EXCEL */}
                    <div className="db-upload-box">
                        <h4 style={{marginTop:0, color:'#0369a1'}}>📤 Carga Masiva a Firebase</h4>
                        <p style={{fontSize:'0.9rem', color:'#64748b'}}>
                            Sube aquí tu Excel maestro (con columnas: APELLIDO PATERNO, DNI, FECHAS, etc.) para guardar a todos los internos en la base de datos del sistema.
                        </p>
                        <label className="btn-primary" style={{cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'8px'}}>
                            <Upload size={18}/> Seleccionar Excel Maestro
                            <input 
                                type="file" 
                                accept=".xlsx,.xls" 
                                onChange={handleExcelDbUpload} 
                                style={{display:'none'}} 
                            />
                        </label>
                        {uploadStatus && <p style={{fontWeight:'bold', color: uploadStatus.includes('Error') ? 'red' : 'green', marginTop:'10px'}}>{uploadStatus}</p>}
                    </div>

                    <hr style={{margin:'30px 0', border:'0', borderTop:'1px solid #e2e8f0'}}/>

                    <div className="card-header-row">
                        <h4 style={{margin:0}}><Users size={18}/> Verificación por Robot (Opcional)</h4>
                        <button onClick={exportBulkResults} disabled={bulkResults.length === 0} className="btn-secondary" style={{color:'#16a34a'}}><Download size={16}/> Descargar Excel</button>
                    </div>
                    <p style={{fontSize:'0.85rem', color:'#64748b', marginBottom:'10px'}}>
                        Si deseas verificar datos actuales con el MINSA, pega los DNIs aquí.
                    </p>
                    
                    <textarea 
                        value={bulkDnis} 
                        onChange={(e) => setBulkDnis(e.target.value)} 
                        placeholder="Pegar lista de DNIs aquí..."
                        style={{height:'80px'}}
                    />

                    <button 
                        onClick={processBulkList} 
                        disabled={isProcessing} 
                        className="btn-secondary full-width" 
                        style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'10px', height:'40px'}}
                    >
                        {isProcessing ? <><Loader className="spin" size={18}/> Verificando con Robot...</> : <><Play size={18}/> Iniciar Verificación Robot</>}
                    </button>

                    {bulkResults.length > 0 && (
                        <div className="bulk-table-container">
                            <table className="modern-table" style={{fontSize:'0.85rem'}}>
                                <thead>
                                    <tr><th>DNI</th><th>Estado</th><th>Nombre</th><th>Carrera</th><th>Fechas</th></tr>
                                </thead>
                                <tbody>
                                    {bulkResults.map((r, i) => (
                                        <tr key={i}>
                                            <td style={{fontWeight:'bold'}}>{r.dni}</td>
                                            <td>{r.status.includes('Encontrado') ? <span className="badge-found">OK</span> : <span className="badge-error">NO</span>}</td>
                                            <td>{r.nombres} {r.apePat}</td>
                                            <td>{r.carrera}</td>
                                            <td>{r.fechaInicio} - {r.fechaFin}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {tab === 'stats' && (
                <div className="stats-layout">
                    {/* ... (Tu código de estadísticas se mantiene igual) ... */}
                    <div className="card filter-card"><div className="flex items-center gap-3"><Filter size={20} color="#2563eb"/><h3>Análisis Mensual</h3><input type="month" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} className="modern-input" /></div></div>
                    <div className="stats-grid-complex">
                        <div className="card chart-card"><h3>Cobertura</h3><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={coverageData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value">{coverageData.map((e, i) => <Cell key={i} fill={COLORS_STATUS[i]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
                        <div className="card chart-card"><h3>Rendimiento</h3><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={visitsByUser} cx="50%" cy="50%" outerRadius={70} dataKey="value" label>{visitsByUser.map((e, i) => <Cell key={i} fill={COLORS_SUPERVISOR[i % COLORS_SUPERVISOR.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
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
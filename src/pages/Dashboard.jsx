import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { healthCenters, universities, careers } from '../data';
import { Clock, MapPin, LogOut, Save, Search, Plus, Trash2, Users, CheckCircle, Loader, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// CSS de Leaflet
import 'leaflet/dist/leaflet.css';

// Fix Iconos Mapa
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function Dashboard({ user, isAdmin }) {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedCenter, setSelectedCenter] = useState(null); 
    const [timeLeft, setTimeLeft] = useState(null);
    const [location, setLocation] = useState(null);
    const [internsList, setInternsList] = useState([]);
    const [currentIntern, setCurrentIntern] = useState({ dni: '', name: '', university: '', career: '' });
    const [visitData, setVisitData] = useState({
        tutorName: '', tutorSpec: '', internCount: '', observations: '', 
        locationCorrect: 'yes', formGoogleDone: false
    });

    const navigate = useNavigate();

    // 1. Rastreo de ubicación y Verificación de Sesión
    useEffect(() => {
        let watchId = null;
        const startTracking = () => {
            if ("geolocation" in navigator) {
                watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        console.log("📍 GPS Actualizado");
                        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    },
                    (err) => console.error("❌ Error GPS:", err.message),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }
        };

        const checkSession = async () => {
            try {
                const q = query(
                    collection(db, "asistencia"), 
                    where("userId", "==", user.uid), 
                    where("status", "==", "active")
                );
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    setSession({ id: snap.docs[0].id, ...data });
                    // Si ya hay sesión activa, recuperamos el centro seleccionado de la sesión
                    if (data.centerData) setSelectedCenter(data.centerData);
                }
            } catch (error) {
                console.error("Error cargando sesión:", error);
            } finally {
                setLoading(false);
            }
        };

        startTracking();
        checkSession();
        return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
    }, [user]);

    // 2. Timer de la sesión
    useEffect(() => {
        if (!session || !session.entryTime) return;
        const interval = setInterval(() => {
            const now = new Date();
            const entry = session.entryTime.toDate();
            const diff = now - entry;
            const threeHours = 3 * 60 * 60 * 1000; 
            setTimeLeft(diff >= threeHours ? 0 : threeHours - diff);
        }, 1000);
        return () => clearInterval(interval);
    }, [session]);

    const searchDNI = async () => {
        if (currentIntern.dni.length !== 8) return alert("DNI debe tener 8 dígitos");
        setCurrentIntern(prev => ({ ...prev, name: "⏳ Buscando..." }));
        try {
            const response = await fetch('http://localhost:3001/api/buscar-dni', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni: currentIntern.dni })
            });
            const result = await response.json();
            if (result.success && result.found) {
                const { nombres, apePat, apeMat, universidad, carrera } = result.data;
                setCurrentIntern(prev => ({ 
                    ...prev, name: `${nombres} ${apePat} ${apeMat}`,
                    university: universidad || prev.university, career: carrera || prev.career
                }));
            } else {
                alert("⚠️ DNI no encontrado.");
                setCurrentIntern(prev => ({ ...prev, name: "", university: "", career: "" }));
            }
        } catch (error) {
            alert("Error con el Robot API.");
            setCurrentIntern(prev => ({ ...prev, name: "", university: "", career: "" }));
        }
    };

    const addInternToList = () => {
        if(!currentIntern.name || currentIntern.name === "⏳ Buscando...") return alert("DNI no válido");
        setInternsList([...internsList, currentIntern]);
        setVisitData(prev => ({...prev, internCount: internsList.length + 1}));
        setCurrentIntern({ dni: '', name: '', university: '', career: '' });
    };

    const startSupervision = async () => {
        if (!selectedCenter) return alert("⚠️ Seleccione un centro de salud.");
        
        // Prioridad: GPS Real -> Coordenadas del Centro (Data.js)
        let finalCoords = location;
        if (!finalCoords) {
            console.warn("Usando ubicación del data.js por falta de GPS");
            finalCoords = { lat: selectedCenter.lat, lng: selectedCenter.lng };
        }

        try {
            const now = new Date();
            const docData = {
                userId: user.uid,
                username: user.email.split('@')[0],
                centerName: selectedCenter.nombre, 
                centerData: selectedCenter, 
                entryTime: Timestamp.fromDate(now),
                status: 'active',
                locationCoords: finalCoords,
                dateString: now.toISOString().slice(0, 10)
            };
            const docRef = await addDoc(collection(db, "asistencia"), docData);
            setSession({ id: docRef.id, ...docData });
        } catch (e) { alert("Error al guardar: " + e.message); }
    };

    const endSupervision = async () => {
        if (!visitData.formGoogleDone) return alert("Debe completar el Formulario de Google y marcar el check de confirmación.");
        if (!visitData.tutorName) return alert("Ingrese el nombre del tutor.");
        
        if(window.confirm("¿Finalizar supervisión?")) {
            try {
                await updateDoc(doc(db, "asistencia", session.id), {
                    exitTime: Timestamp.now(),
                    ...visitData,
                    registeredInterns: internsList,
                    status: 'completed'
                });
                alert("¡Visita Finalizada!");
                window.location.reload();
            } catch (e) { alert("Error: " + e.message); }
        }
    };

    const formatTime = (ms) => {
        if (ms <= 0) return "00:00:00";
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${h}h ${m}m ${s}s`;
    };

    // Lógica para centrar el mapa: Si hay un centro seleccionado, usa SUS coordenadas. Si no, usa el GPS.
    // Esto asegura que veas el mapa de la zona exacta del centro seleccionado.
    const mapCenter = selectedCenter 
        ? [selectedCenter.lat, selectedCenter.lng] 
        : (location ? [location.lat, location.lng] : [-12.046374, -77.042793]); // Default Lima

    if (loading) return <div className="loading-screen"><Loader className="gps-loading"/> Cargando...</div>;

    return (
        <div className="dashboard-wrapper">
            <nav className="navbar">
                <div className="nav-brand">
                    <div className="nav-logo">🏥</div>
                    <div>
                        <h1>Panel de Supervisión</h1>
                        <span className="user-badge">{user.email}</span>
                    </div>
                </div>
                <div className="nav-actions">
                   {isAdmin && <button onClick={() => navigate('/admin')} className="btn-secondary">Admin</button>}
                   <button onClick={() => auth.signOut()} className="btn-logout"><LogOut size={16}/> Salir</button>
                </div>
            </nav>

            <div className="main-content">
                {!session ? (
                    <div className="card entry-card fade-in">
                        <div className="entry-header">
                            <MapPin size={48} className="icon-blue"/>
                            <h3>Iniciar Nueva Visita</h3>
                            <p>Seleccione la sede para registrar su ingreso.</p>
                        </div>
                        <div className="form-group">
                            <select className="big-select" value={selectedCenter ? selectedCenter.nombre : ""} 
                                onChange={(e) => {
                                    const center = healthCenters.find(c => c.nombre === e.target.value);
                                    setSelectedCenter(center || null);
                                }}>
                                <option value="">-- Buscar Centro de Salud --</option>
                                {healthCenters.map((c, i) => (
                                    <option key={i} value={c.nombre}>{c.ris} - {c.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="gps-indicator">
                            {location ? <span className="gps-ok"><CheckCircle size={16}/> GPS Activo</span> : <span className="gps-loading" style={{color: '#f59e0b'}}>🛰️ Buscando señal...</span>}
                        </div>
                        
                        {/* MAPA PREVIO AL INGRESO (Para confirmar ubicación) */}
                        <div className="map-preview-box" style={{height: '200px', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden'}}>
                             {/* Key ayuda a recargar el mapa si cambia el centro */}
                            <MapContainer key={selectedCenter ? selectedCenter.nombre : "default"} center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
                                {/* MAPA GOOGLE CALLES (Standard Roadmap) */}
                                <TileLayer 
                                    url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" 
                                    attribution='© Google Maps' 
                                />
                                <Marker position={mapCenter}>
                                    <Popup>{selectedCenter ? selectedCenter.nombre : "Tu Ubicación"}</Popup>
                                </Marker>
                            </MapContainer>
                        </div>

                        <button onClick={startSupervision} className="btn-primary full-width">MARCAR INGRESO</button>
                    </div>
                ) : (
                    <div className="supervision-grid fade-in">
                        <div className="left-panel">
                            <div className="card info-card">
                                <div className="card-header-row">
                                    <h2 className="center-title">{session.centerName}</h2>
                                    <span className="status-badge">En Curso</span>
                                </div>
                                <div className={`timer-box ${timeLeft === 0 ? 'time-over' : ''}`}>
                                    <Clock size={24}/> <span>{timeLeft === 0 ? "TIEMPO CUMPLIDO" : `Restante: ${formatTime(timeLeft)}`}</span>
                                </div>
                                <div className="map-container-box">
                                    {/* MAPA DURANTE LA VISITA */}
                                    <MapContainer center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
                                        {/* MAPA GOOGLE CALLES (Standard Roadmap) */}
                                        <TileLayer 
                                            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" 
                                            attribution='© Google Maps' 
                                        />
                                        <Marker position={mapCenter}>
                                            <Popup><strong>{session.centerName}</strong></Popup>
                                        </Marker>
                                    </MapContainer>
                                </div>
                            </div>
                        </div>

                        <div className="right-panel">
                            <div className="card management-card">
                                <div className="section-header">
                                    <Users size={20}/> <h3>Gestión de Internos</h3>
                                </div>
                                <div className="robot-box">
                                    <div className="search-row">
                                        <input type="text" placeholder="DNI" maxLength="8" value={currentIntern.dni} onChange={e => setCurrentIntern({...currentIntern, dni: e.target.value.replace(/\D/g, '')})} />
                                        <button onClick={searchDNI} className="btn-icon"><Search size={18}/></button>
                                    </div>
                                    <input type="text" value={currentIntern.name} readOnly className="readonly-input" placeholder="Nombre del interno"/>
                                    <div className="dropdown-row">
                                         <select value={currentIntern.university} onChange={e=>setCurrentIntern({...currentIntern, university:e.target.value})}>
                                            <option value="">- Universidad -</option>
                                            {universities.map(u => <option key={u} value={u}>{u}</option>)}
                                         </select>
                                         <select value={currentIntern.career} onChange={e=>setCurrentIntern({...currentIntern, career:e.target.value})}>
                                            <option value="">- Carrera -</option>
                                            {careers.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                                         </select>
                                    </div>
                                    <button onClick={addInternToList} className="btn-add-list">AGREGAR A LA LISTA</button>
                                </div>
                                <div className="list-box">
                                    <span>Registrados ({internsList.length})</span>
                                    <ul className="intern-list">
                                        {internsList.map((item, idx) => (
                                            <li key={idx}>
                                                <div className="info"><strong>{item.name}</strong><span>{item.university}</span></div>
                                                <button onClick={() => setInternsList(internsList.filter((_, i) => i !== idx))} className="btn-trash"><Trash2 size={16}/></button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="tutor-box">
                                    <input type="text" placeholder="Nombre del Tutor" value={visitData.tutorName} onChange={e=>setVisitData({...visitData, tutorName: e.target.value})} />
                                    <textarea placeholder="Observaciones de la visita..." value={visitData.observations} onChange={e=>setVisitData({...visitData, observations: e.target.value})}></textarea>
                                </div>

                                {/* SECCIÓN DEL FORMULARIO DE SALIDA GOOGLE */}
                                <div className="google-box" style={{ background: '#fff9eb', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba', marginTop: '10px' }}>
                                    <a href="https://docs.google.com/forms/d/e/1FAIpQLSf3XdABYsUwB1iTjopQM7vikCqvDcvNegPPE-6EaDmPM5ktAA/viewform?usp=dialog" 
                                       target="_blank" rel="noreferrer" 
                                       style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#856404', fontWeight: 'bold', textDecoration: 'none', marginBottom: '10px' }}>
                                        <ExternalLink size={18}/> Llenar Formulario de Salida
                                    </a>
                                    <label className="check-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={visitData.formGoogleDone} onChange={e => setVisitData({...visitData, formGoogleDone: e.target.checked})} /> 
                                        <span style={{color: visitData.formGoogleDone ? '#16a34a' : '#d97706', fontWeight: '500'}}>
                                            {visitData.formGoogleDone ? '✅ Formulario completado' : '⚠️ Confirmar envío aquí'}
                                        </span>
                                    </label>
                                </div>

                                <button onClick={endSupervision} className="btn-finish" style={{ marginTop: '15px' }}><Save size={18}/> FINALIZAR VISITA</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
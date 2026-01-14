import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp, getDoc } from 'firebase/firestore'; // Agregamos getDoc
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
    
    // Estado del interno actual con los campos de tu Excel
    const [currentIntern, setCurrentIntern] = useState({ 
        dni: '', 
        name: '', 
        university: '', 
        career: '',
        // Campos nuevos para mostrar en la lista
        sedeDocente: '',
        fechaInicio: '',
        fechaFin: ''
    });

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

    // ------------------------------------------------------------------
    //  NUEVA BÚSQUEDA: DIRECTO EN FIREBASE (SIN ROBOT)
    // ------------------------------------------------------------------
    const searchDNI = async () => {
        const dniBuscado = currentIntern.dni.trim();
        
        if (dniBuscado.length !== 8) return alert("El DNI debe tener 8 dígitos.");
        
        setCurrentIntern(prev => ({ ...prev, name: "🔍 Buscando en base de datos..." }));

        try {
            // Buscamos el documento con el ID igual al DNI en la colección 'internos_general'
            const docRef = doc(db, "internos_general", dniBuscado);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Construimos el nombre completo
                const nombreCompleto = `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`;
                
                setCurrentIntern({
                    dni: dniBuscado,
                    name: nombreCompleto,
                    university: data.universidad || "No especificada",
                    career: data.carrera || "No especificada",
                    sedeDocente: data.sedeDocente || "-",
                    fechaInicio: data.fechaInicioInternado || "-",
                    fechaFin: data.fechaFinInternado || "-"
                });
            } else {
                alert("⚠️ DNI no encontrado en la Base de Datos cargada.");
                setCurrentIntern(prev => ({ ...prev, name: "", university: "", career: "" }));
            }
        } catch (error) {
            console.error("Error buscando en Firebase:", error);
            alert("Error de conexión con la base de datos.");
            setCurrentIntern(prev => ({ ...prev, name: "" }));
        }
    };

    const addInternToList = () => {
        if(!currentIntern.name || currentIntern.name.includes("Buscando")) return alert("Primero busque un DNI válido.");
        
        setInternsList([...internsList, currentIntern]);
        setVisitData(prev => ({...prev, internCount: internsList.length + 1}));
        
        // Limpiamos solo el DNI y nombre para el siguiente, dejamos vacío lo demás
        setCurrentIntern({ dni: '', name: '', university: '', career: '', sedeDocente: '', fechaInicio: '', fechaFin: '' });
    };

    const startSupervision = async () => {
        if (!selectedCenter) return alert("⚠️ Seleccione un centro de salud.");
        
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

    const mapCenter = selectedCenter 
        ? [selectedCenter.lat, selectedCenter.lng] 
        : (location ? [location.lat, location.lng] : [-12.046374, -77.042793]);

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
                        
                        <div className="map-preview-box" style={{height: '200px', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden'}}>
                            <MapContainer key={selectedCenter ? selectedCenter.nombre : "default"} center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
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
                                    <MapContainer center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
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
                                        <input 
                                            type="text" 
                                            placeholder="Ingrese DNI" 
                                            maxLength="8" 
                                            value={currentIntern.dni} 
                                            onChange={e => setCurrentIntern({...currentIntern, dni: e.target.value.replace(/\D/g, '')})} 
                                            onKeyDown={e => e.key === 'Enter' && searchDNI()}
                                        />
                                        <button onClick={searchDNI} className="btn-icon"><Search size={18}/></button>
                                    </div>
                                    
                                    {/* Campos de solo lectura que se llenan desde Firebase */}
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginBottom:'10px'}}>
                                        <input type="text" value={currentIntern.name} readOnly className="readonly-input" placeholder="Nombre completo" style={{fontWeight:'bold'}}/>
                                        <div style={{display:'flex', gap:'5px'}}>
                                            <input type="text" value={currentIntern.university} readOnly className="readonly-input" placeholder="Universidad" style={{flex:1, fontSize:'0.85rem'}}/>
                                            <input type="text" value={currentIntern.career} readOnly className="readonly-input" placeholder="Carrera" style={{flex:1, fontSize:'0.85rem'}}/>
                                        </div>
                                        <div style={{display:'flex', gap:'5px'}}>
                                            <input type="text" value={currentIntern.fechaInicio} readOnly className="readonly-input" placeholder="Inicio" style={{flex:1, fontSize:'0.85rem', color:'#64748b'}}/>
                                            <input type="text" value={currentIntern.fechaFin} readOnly className="readonly-input" placeholder="Fin" style={{flex:1, fontSize:'0.85rem', color:'#64748b'}}/>
                                        </div>
                                    </div>

                                    <button onClick={addInternToList} className="btn-add-list">AGREGAR A LA LISTA</button>
                                </div>
                                
                                <div className="list-box">
                                    <span>Registrados ({internsList.length})</span>
                                    <ul className="intern-list">
                                        {internsList.map((item, idx) => (
                                            <li key={idx}>
                                                <div className="info">
                                                    <strong>{item.name}</strong>
                                                    <span style={{fontSize:'0.75rem', color:'#64748b'}}>{item.university} - {item.career}</span>
                                                </div>
                                                <button onClick={() => setInternsList(internsList.filter((_, i) => i !== idx))} className="btn-trash"><Trash2 size={16}/></button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="tutor-box">
                                    <input type="text" placeholder="Nombre del Tutor" value={visitData.tutorName} onChange={e=>setVisitData({...visitData, tutorName: e.target.value})} />
                                    <textarea placeholder="Observaciones de la visita..." value={visitData.observations} onChange={e=>setVisitData({...visitData, observations: e.target.value})}></textarea>
                                </div>

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
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TUS CREDENCIALES EXACTAS
const firebaseConfig = {
  apiKey: "AIzaSyDPQpGdUwIjqFwvqgHLq7LaqWQNjGTzK9Y",
  authDomain: "centros-salud-68a45.firebaseapp.com",
  projectId: "centros-salud-68a45",
  storageBucket: "centros-salud-68a45.firebasestorage.app",
  messagingSenderId: "924328369330",
  appId: "1:924328369330:web:dd69cfd3c290e7e7f4fdab",
  measurementId: "G-7K7FV1VFFM"
};

// Inicializamos la app con los servicios necesarios
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const secondaryAppValues = firebaseConfig; // Para crear usuarios desde el admin
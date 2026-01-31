// app.js — MÓDULO FIREBASE (GitHub Pages compatible)
console.log("app.js cargado OK");

// 🔥 IMPORTS FIREBASE (v9 modular desde CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ===============================
// 1) CONFIGURACIÓN FIREBASE
// ===============================
// ⛔️ PEGA AQUÍ TU CONFIGURACIÓN REAL ⛔️
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_STORAGE_BUCKET",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID",
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===============================
// 2) REFERENCIAS AL DOM
// ===============================
const form = document.getElementById("gastoForm");
const fechaInput = document.getElementById("fecha");
const conceptoInput = document.getElementById("concepto");
const categoriaInput = document.getElementById("categoria");
const importeInput = document.getElementById("importe");
const listaGastos = document.getElementById("listaGastos");
const btnImprimirUltimo = document.getElementById("btnImprimirUltimo");

// ===============================
// 3) FECHA AUTOMÁTICA (HOY)
// ===============================
function setFechaHoy() {
  const hoy = new Date().toISOString().slice(0, 10);
  fechaInput.value = hoy;
}

// ===============================
// 4) CARGAR GASTOS
// ===============================
async function cargarGastos() {
  listaGastos.innerHTML = "";

  const q = query(
    collection(db, "gastos"),
    orderBy("fecha", "desc"),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  snapshot.forEach((doc) => {
    const g = doc.data();

    const div = document.createElement("div");
    div.className = "gasto-item";
    div.innerHTML = `
      <strong>${g.fecha}</strong> · ${g.concepto}
      <br />
      <small>${g.categoria}</small>
      <span style="float:right">${Number(g.importe).toFixed(2)} €</span>
    `;

    listaGastos.appendChild(div);
  });
}

// ===============================
// 5) GUARDAR GASTO
// ===============================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const gasto = {
    fecha: fechaInput.value,
    concepto: conceptoInput.value.trim(),
    categoria: categoriaInput.value,
    importe: parseFloat(importeInput.value),
    createdAt: new Date(),
  };

  if (!gasto.fecha || !gasto.concepto || !gasto.categoria || isNaN(gasto.importe)) {
    alert("Completa todos los campos correctamente");
    return;
  }

  await addDoc(collection(db, "gastos"), gasto);

  form.reset();
  setFechaHoy();
  cargarGastos();
});

// ===============================
// 6) IMPRIMIR ÚLTIMO GASTO
// ===============================
btnImprimirUltimo.addEventListener("click", async () => {
  const q = query(
    collection(db, "gastos"),
    orderBy("createdAt", "desc"),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    alert("No hay gastos para imprimir");
    return;
  }

  const g = snapshot.docs[0].data();

  const ventana = window.open("", "_blank");
  ventana.document.write(`
    <h2>Último gasto</h2>
    <p><strong>Fecha:</strong> ${g.fecha}</p>
    <p><strong>Concepto:</strong> ${g.concepto}</p>
    <p><strong>Categoría:</strong> ${g.categoria}</p>
    <p><strong>Importe:</strong> ${Number(g.importe).toFixed(2)} €</p>
  `);
  ventana.print();
});

// ===============================
// 7) ARRANQUE INICIAL
// ===============================
setFechaHoy();
cargarGastos();

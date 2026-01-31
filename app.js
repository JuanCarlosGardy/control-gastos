// app.js (ESM)
// 1) Conecta Firebase
// 2) Guarda gastos en Firestore
// 3) Genera correlativo seguro por año: GAS-YYYY-0001
// 4) Lista, filtra, elimina, imprime

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, runTransaction,
  query, orderBy, onSnapshot, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* =========================
   PASO A: PEGA AQUÍ TU CONFIG DE FIREBASE
   ========================= */
const firebaseConfig = {
  apiKey: "PON_TU_API_KEY",
  authDomain: "PON_TU_AUTH_DOMAIN",
  projectId: "PON_TU_PROJECT_ID",
  storageBucket: "PON_TU_STORAGE_BUCKET",
  messagingSenderId: "PON_TU_SENDER_ID",
  appId: "PON_TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================
   UI Helpers
   ========================= */
const $ = (id) => document.getElementById(id);

const form = $("expenseForm");
const statusEl = $("status");
const tbody = $("tbody");
const btnPrint = $("btnPrint");
const btnRefresh = $("btnRefresh");
const filterText = $("filterText");
const filterYear = $("filterYear");

const sumBase = $("sumBase");
const sumVat = $("sumVat");
const sumTotal = $("sumTotal");

function euro(n){
  return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function yearFromDate(isoDate){
  // isoDate "YYYY-MM-DD"
  return Number(String(isoDate).slice(0,4));
}

function pad4(n){
  return String(n).padStart(4, "0");
}

function setStatus(msg, isError=false){
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ffb4b4" : "";
}

/* =========================
   Correlativo seguro (transacción)
   Doc contador: counters/gastos_YYYY
   Campo: value (number)
   ========================= */
async function nextExpenseNumber(year){
  const counterRef = doc(db, "counters", `gastos_${year}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    let current = 0;
    if (snap.exists()) {
      current = Number(snap.data().value || 0);
    }
    const updated = current + 1;
    tx.set(counterRef, { value: updated }, { merge: true });
    return updated;
  });

  return `GAS-${year}-${pad4(next)}`;
}

/* =========================
   Firestore: colección de gastos
   ========================= */
const expensesCol = collection(db, "expenses");

/* =========================
   Estado local (para filtros)
   ========================= */
let allExpenses = []; // array de {id, ...data}

/* =========================
   Render tabla + totales
   ========================= */
function render(){
  const txt = (filterText.value || "").trim().toLowerCase();
  const yr = filterYear.value;

  const filtered = allExpenses.filter(e => {
    const matchesText =
      !txt ||
      (e.concept || "").toLowerCase().includes(txt) ||
      (e.supplier || "").toLowerCase().includes(txt) ||
      (e.category || "").toLowerCase().includes(txt) ||
      (e.number || "").toLowerCase().includes(txt);

    const matchesYear =
      !yr || String(e.year) === String(yr);

    return matchesText && matchesYear;
  });

  tbody.innerHTML = "";

  let sBase=0, sVat=0, sTot=0;

  for(const e of filtered){
    const base = Number(e.amount) || 0;
    const vatPct = Number(e.vatPct) || 0;
    const vat = base * (vatPct/100);
    const total = base + vat;

    sBase += base;
    sVat += vat;
    sTot += total;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${e.number || ""}</strong></td>
      <td>${e.date || ""}</td>
      <td>${escapeHtml(e.concept || "")}</td>
      <td>${escapeHtml(e.supplier || "")}</td>
      <td>${escapeHtml(e.category || "")}</td>
      <td class="right">${euro(base)}</td>
      <td class="right">${euro(vat)}</td>
      <td class="right"><strong>${euro(total)}</strong></td>
      <td>${escapeHtml(e.payment || "")}</td>
      <td class="no-print">
        <button data-del="${e.id}" type="button">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  sumBase.textContent = euro(sBase);
  sumVat.textContent = euro(sVat);
  sumTotal.textContent = euro(sTot);
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   Cargar años en el filtro
   ========================= */
function refreshYearOptions(){
  const years = Array.from(new Set(allExpenses.map(e => e.year))).sort((a,b)=>b-a);
  const current = filterYear.value;

  filterYear.innerHTML = `<option value="">Todos los años</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");

  // Mantener selección si existía
  if (current && years.includes(Number(current))) filterYear.value = current;
}

/* =========================
   Suscripción en tiempo real
   ========================= */
function startLive(){
  const q = query(expensesCol, orderBy("date", "desc"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snap) => {
    allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshYearOptions();
    render();
    setStatus(`Cargados ${allExpenses.length} registros.`);
  }, (err) => {
    console.error(err);
    setStatus("Error cargando datos. Revisa configuración y reglas de Firestore.", true);
  });
}

/* =========================
   Guardar gasto
   ========================= */
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  setStatus("Guardando...");

  const date = $("date").value;
  const concept = $("concept").value.trim();
  const supplier = $("supplier").value.trim();
  const category = $("category").value;
  const amount = Number($("amount").value);
  const vatPct = Number($("vat").value || 0);
  const payment = $("payment").value;
  const notes = $("notes").value.trim();

  if(!date || !concept || !category || !payment || !(amount >= 0)){
    setStatus("Faltan datos obligatorios o el importe no es válido.", true);
    return;
  }

  try{
    const year = yearFromDate(date);
    const number = await nextExpenseNumber(year);

    await addDoc(expensesCol, {
      number,
      year,
      date,
      concept,
      supplier,
      category,
      amount,
      vatPct,
      payment,
      notes,
      createdAt: Date.now()
    });

    form.reset();
    // Sugerencia: dejar fecha de hoy tras reset
    $("date").valueAsDate = new Date();

    setStatus(`Guardado: ${number}`);
  }catch(err){
    console.error(err);
    setStatus("No se pudo guardar. Revisa Firebase Config / Reglas / Permisos.", true);
  }
});

/* =========================
   Eliminar
   ========================= */
tbody.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if(!btn) return;

  const id = btn.getAttribute("data-del");
  if(!id) return;

  const ok = confirm("¿Eliminar este registro?");
  if(!ok) return;

  try{
    await deleteDoc(doc(db, "expenses", id));
    setStatus("Registro eliminado.");
  }catch(err){
    console.error(err);
    setStatus("No se pudo eliminar.", true);
  }
});

/* =========================
   Filtros + imprimir
   ========================= */
filterText.addEventListener("input", render);
filterYear.addEventListener("change", render);

btnPrint.addEventListener("click", () => window.print());
btnRefresh.addEventListener("click", () => render());

/* =========================
   Inicialización
   ========================= */
(function init(){
  // Fecha hoy por defecto
  $("date").valueAsDate = new Date();
  startLive();
})();



"use client";

import { useState, useEffect } from "react";
import {
  Shield, User, ShieldAlert, Users,
  Search, EyeOff, AlertTriangle, CheckCircle,
  XCircle, Send, QrCode, PhoneCall, Upload,
  ListFilter, RefreshCw, Radio, FileCheck
} from "lucide-react";
import confetti from "canvas-confetti";

export default function Simulator() {
  const [role, setRole] = useState("student"); // student | guard | warden | admin
  const [scannedStudent, setScannedStudent] = useState(null);
  const [scanMessage, setScanMessage] = useState("");
  
  // SOS State
  const [sosActive, setSosActive] = useState(false);

  // Initial State
  const [requests, setRequests] = useState([
    {
      id: "REQ-4091",
      studentName: "Ananya Verma",
      rollNo: "BT/CS/2023/045",
      phone: "+91 98765 43210",
      room: "304-B",
      destination: "New Delhi (Hometown)",
      travelTime: "9:30 PM (Late Night)",
      status: "Approved",
      ticketUploaded: true,
      ticketName: "train_ticket_delhi.png",
      approvedBy: "Warden (Self)",
      timestamp: "Today, 4:30 PM"
    },
    {
      id: "REQ-4092",
      studentName: "Priya Sharma",
      rollNo: "BT/EE/2023/102",
      phone: "+91 88123 45678",
      room: "112-A",
      destination: "Local Market",
      travelTime: "7:00 PM (Regular)",
      status: "Pending",
      ticketUploaded: false,
      ticketName: null,
      approvedBy: null,
      timestamp: "Today, 5:15 PM"
    }
  ]);

  const [complaints, setComplaints] = useState([
    {
      id: "COMP-701",
      timestamp: "Today, 2:10 PM",
      description: "Guard at main gate repeatedly asked for my phone number and social accounts during entry logging.",
      status: "Investigating"
    }
  ]);

  const [auditLogs, setAuditLogs] = useState([
    {
      time: "17:15:32",
      actor: "Student (Priya Sharma)",
      action: "Submitted regular outing request #REQ-4092",
      severity: "info"
    },
    {
      time: "16:45:10",
      actor: "AI Monitor",
      action: "Anomalous Lookup Flagged: Guard Rajesh searched Room 304 twice in 10 minutes.",
      severity: "warning"
    },
    {
      time: "16:30:15",
      actor: "Warden",
      action: "Approved late outing #REQ-4091 (Ananya Verma) - Validated ticket attachment.",
      severity: "success"
    },
    {
      time: "16:28:40",
      actor: "Student (Ananya Verma)",
      action: "Uploaded travel proof ticket: train_ticket_delhi.png",
      severity: "info"
    }
  ]);

  // Form State for Student Outing
  const [newRequest, setNewRequest] = useState({
    studentName: "Megha Sen",
    rollNo: "BT/EC/2024/012",
    phone: "+91 99887 76655",
    room: "205-C",
    destination: "",
    travelTime: "8:00 PM",
    ticketUploaded: false,
    ticketName: ""
  });

  // Complaint Form State
  const [newComplaint, setNewComplaint] = useState("");

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 }
    });
  };

  const addLog = (actor, action, severity = "info") => {
    const now = new Date();
    const timeString = now.toTimeString().split(" ")[0];
    setAuditLogs(prev => [{ time: timeString, actor, action, severity }, ...prev]);
  };

  const handleOutingSubmit = (e) => {
    e.preventDefault();
    if (!newRequest.destination) return;

    const requestID = "REQ-" + Math.floor(1000 + Math.random() * 9000);
    const addedReq = {
      ...newRequest,
      id: requestID,
      status: newRequest.ticketUploaded ? "Approved" : "Pending",
      timestamp: "Just Now",
      approvedBy: newRequest.ticketUploaded ? "System Auto-Approved" : null
    };

    setRequests(prev => [addedReq, ...prev]);
    addLog("Student (Megha Sen)", `Submitted outing request to ${newRequest.destination} (${requestID})`, "info");
    if (addedReq.status === "Approved") {
      addLog("System", `Auto-approved ${requestID} based on uploaded ticket verification.`, "success");
      triggerConfetti();
    }
    
    alert(`Outing Request Submitted Successfully! Status: ${addedReq.status}`);
    setNewRequest(prev => ({
      ...prev,
      destination: "",
      travelTime: "8:00 PM",
      ticketUploaded: false,
      ticketName: ""
    }));
  };

  const handleSosTrigger = () => {
    const nextSos = !sosActive;
    setSosActive(nextSos);
    if (nextSos) {
      addLog("Student (Megha Sen)", "TRIGGERED SOS EMERGENCY ALERT", "danger");
      alert("🚨 EMERGENCY SOS SENT! High-priority alerts pushed to Warden & Security Control.");
    } else {
      addLog("Student (Megha Sen)", "Deactivated SOS alert", "info");
    }
  };

  const handleGuardScan = (studentReq) => {
    setScannedStudent(studentReq);
    setScanMessage(`QR code scanned successfully! Profile loaded.`);
    addLog("Guard (Gate 1)", `Scanned QR Code for student: ${studentReq.studentName}. Info masked.`, "info");
  };

  const handleMockCall = (studentName) => {
    alert(`📞 Call Routing Active...\nConnecting to ${studentName} via virtual masked relay number.\n\nStudent's real phone number remains hidden!`);
    addLog("Guard (Gate 1)", `Initiated masked telephone relay to ${studentName}`, "info");
  };

  const handleRegisterMovement = (studentReq, direction) => {
    addLog("Guard (Gate 1)", `Recorded ${direction} movement for ${studentReq.studentName} (${studentReq.id})`, "success");
    alert(`Success: Registered ${direction} movement in database.`);
    setScannedStudent(null);
  };

  const handleWardenApproval = (reqId, approve) => {
    setRequests(prev => prev.map(req => {
      if (req.id === reqId) {
        return {
          ...req,
          status: approve ? "Approved" : "Rejected",
          approvedBy: "Warden (Self)"
        };
      }
      return req;
    }));
    const req = requests.find(r => r.id === reqId);
    addLog("Warden", `${approve ? 'Approved' : 'Rejected'} outing request ${reqId} for ${req.studentName}`, approve ? "success" : "warning");
    
    if (approve) {
      triggerConfetti();
    }
  };

  const handleComplaintSubmit = (e) => {
    e.preventDefault();
    if (!newComplaint) return;

    const compId = "COMP-" + Math.floor(700 + Math.random() * 300);
    const addedComp = {
      id: compId,
      timestamp: "Just Now",
      description: newComplaint,
      status: "Investigating"
    };

    setComplaints(prev => [addedComp, ...prev]);
    addLog("Student (Anonymous)", `Submitted misconduct complaint ${compId}`, "warning");
    alert("Complaint filed anonymously. Your identity is masked, and the report has been dispatched to the Internal Complaints Committee (ICC).");
    setNewComplaint("");
  };

  const simulateFileUpload = () => {
    setNewRequest(prev => ({
      ...prev,
      ticketUploaded: true,
      ticketName: "train_ticket_3tier.jpg"
    }));
  };

  return (
    <section
      id="simulator"
      className="py-20 bg-gradient-to-b from-[#eef3ff] via-[#f6f9ff] to-[#e9f1ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 border-t border-slate-200/60 dark:border-slate-800/60 transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-extrabold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-3 py-1.5 rounded-full border border-cyan-150/40 dark:border-cyan-900/40">
            Safety Sandbox
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            See the Safety Flow in Action
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">
            Switch roles to see how SafeExit protects privacy, verifies exits, and logs every access in real time.
          </p>
        </div>

        {/* Dashboard Frame */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/70 dark:border-slate-700/60 shadow-xl overflow-hidden max-w-5xl mx-auto transition-colors">
          
          {/* Top Bar - Role Switcher */}
          <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                Simulation Running: SafeExit WebPortal
              </span>
            </div>

            {/* Role Selectors */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700/60 w-full sm:w-auto overflow-x-auto">
              {[
                { id: "student", label: "Student App", icon: <User className="h-3.5 w-3.5" /> },
                { id: "guard", label: "Guard Scan", icon: <Search className="h-3.5 w-3.5" /> },
                { id: "warden", label: "Warden Desk", icon: <Shield className="h-3.5 w-3.5" /> },
                { id: "admin", label: "Admin Logs", icon: <Users className="h-3.5 w-3.5" /> }
              ].map(btn => (
                <button
                  key={btn.id}
                  onClick={() => {
                    setRole(btn.id);
                    setScannedStudent(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                    role === btn.id
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {btn.icon}
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Workspace Frame */}
          <div className="min-h-[500px] p-6 sm:p-8 bg-slate-50/50 dark:bg-slate-900/30 transition-colors">
            
            {/* 1. STUDENT VIEW */}
            {role === "student" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Outing Form */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm space-y-6 transition-colors">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700/80">
                    <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                      Request Campus Outing
                    </h3>
                    <span className="text-xs text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/60 font-bold px-2.5 py-1 rounded-full border border-transparent dark:border-indigo-900/40">
                      Logged in: Megha Sen
                    </span>
                  </div>

                  <form onSubmit={handleOutingSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-1">NAME</label>
                        <input
                          type="text"
                          readOnly
                          value={newRequest.studentName}
                          className="w-full p-2.5 bg-slate-50 text-slate-500 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-750 rounded-xl text-sm outline-none cursor-not-allowed font-medium transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-1">ROOM NO</label>
                        <input
                          type="text"
                          readOnly
                          value={newRequest.room}
                          className="w-full p-2.5 bg-slate-50 text-slate-500 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-750 rounded-xl text-sm outline-none cursor-not-allowed font-medium transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-650 dark:text-slate-350 mb-1">OUTING DESTINATION *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Local Market or Delhi Central Rly Station"
                        value={newRequest.destination}
                        onChange={(e) => setNewRequest(prev => ({ ...prev, destination: e.target.value }))}
                        className="w-full p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-indigo-600 outline-none font-medium transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-650 dark:text-slate-350 mb-1">ESTIMATED OUTING TIME</label>
                        <select
                          value={newRequest.travelTime}
                          onChange={(e) => setNewRequest(prev => ({ ...prev, travelTime: e.target.value }))}
                          className="w-full p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-indigo-600 outline-none font-medium transition-colors"
                        >
                          <option value="6:00 PM">6:00 PM (Regular)</option>
                          <option value="7:30 PM">7:30 PM (Regular)</option>
                          <option value="9:00 PM">9:00 PM (Late Outing)</option>
                          <option value="10:30 PM (Midnight)">10:30 PM (Late Outing)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-650 dark:text-slate-350 mb-1">TRAVEL PROOF (FOR LATE OUTINGS)</label>
                        {newRequest.ticketUploaded ? (
                          <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-bold">
                            <span className="truncate">{newRequest.ticketName}</span>
                            <button
                              type="button"
                              onClick={() => setNewRequest(prev => ({ ...prev, ticketUploaded: false, ticketName: "" }))}
                              className="text-emerald-900 dark:text-emerald-350 hover:text-emerald-700 dark:hover:text-white cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={simulateFileUpload}
                            className="w-full flex items-center justify-center gap-2 p-2.5 border border-dashed border-indigo-200 dark:border-indigo-900/80 hover:border-indigo-500 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 cursor-pointer"
                          >
                            <Upload className="h-4 w-4" />
                            Simulate Ticket Upload
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/25 hover:bg-indigo-700 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      File Outing Request
                    </button>
                  </form>
                </div>

                {/* Safety & SOS Section */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  
                  {/* SOS Trigger Card */}
                  <div className={`p-6 rounded-2xl border transition-all duration-300 ${
                    sosActive 
                      ? "bg-rose-50 dark:bg-rose-950/30 border-rose-350 dark:border-rose-900 animate-pulse text-rose-900 dark:text-rose-200" 
                      : "bg-white dark:bg-slate-850 border-slate-200/60 dark:border-slate-700/60"
                  }`}>
                    <div className="flex items-center gap-3.5 mb-4">
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${sosActive ? "bg-rose-600 text-white" : "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-450"}`}>
                        <Radio className={`h-5 w-5 ${sosActive ? "animate-spin" : ""}`} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Active Journey Guard</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">One-Tap Emergency SOS Broadcasting</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-450 mb-4 leading-relaxed font-medium">
                      If you feel unsafe outside campus or face harassment, trigger SOS. System logs location and dispatches immediate notification alerts to wardens.
                    </p>

                    <button
                      type="button"
                      onClick={handleSosTrigger}
                      className={`w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider shadow transition-all cursor-pointer ${
                        sosActive 
                          ? "bg-rose-700 text-white shadow-rose-900/30 hover:bg-rose-800" 
                          : "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/25"
                      }`}
                    >
                      {sosActive ? "Deactivate Emergency SOS" : "Trigger Emergency SOS"}
                    </button>
                  </div>

                  {/* Misconduct Report */}
                  <div className="bg-white dark:bg-slate-855 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm space-y-4 transition-colors">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Report Guard Misconduct</h4>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                      Did security staff ask for personal social links or behave inappropriately? File a masked, direct escalation report.
                    </p>

                    <form onSubmit={handleComplaintSubmit} className="space-y-3">
                      <textarea
                        required
                        rows="2"
                        placeholder="Detail the interaction here. (This report is sent anonymously straight to ICC officers)"
                        value={newComplaint}
                        onChange={(e) => setNewComplaint(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-xs rounded-xl focus:border-indigo-600 outline-none font-medium transition-colors"
                      ></textarea>
                      <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-950 dark:bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-slate-900 dark:hover:bg-indigo-700 active:scale-95 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send Anonymous Report
                      </button>
                    </form>
                  </div>

                </div>

              </div>
            )}

            {/* 2. GUARD VIEW */}
            {role === "guard" && (
              <div className="space-y-6">
                
                {/* Search / Scan Simulation header */}
                <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      Hostel Gate QR Access Terminal
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      Verify outing QR codes. Students' contact and room numbers are masked automatically.
                    </p>
                  </div>

                  {/* Scanner Simulation Button */}
                  <div className="flex gap-2 flex-wrap text-white">
                    {requests.map(req => (
                      <button
                        key={req.id}
                        onClick={() => handleGuardScan(req)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-sm cursor-pointer"
                      >
                        <QrCode className="h-4 w-4" />
                        Scan {req.studentName.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scanner Interface View */}
                {scannedStudent ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* Left: Scanned Details Card */}
                    <div className="lg:col-span-8 bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-250 dark:border-slate-700 shadow-md space-y-6 relative overflow-hidden transition-colors">
                      
                      {/* Masking alert badge */}
                      <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                        <EyeOff className="h-3 w-3" />
                        Privacy Masking Active
                      </div>

                      <div className="flex items-center gap-4 pb-4 border-b border-slate-150 dark:border-slate-700">
                        <div className="h-14 w-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xl transition-colors">
                          {scannedStudent.studentName[0]}
                        </div>
                        <div>
                          <h4 className="font-black text-lg text-slate-900 dark:text-white">{scannedStudent.studentName}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">{scannedStudent.rollNo}</p>
                        </div>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">MASKED PHONE NO</label>
                          <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors">
                            <span className="font-mono text-sm font-bold text-slate-650 dark:text-slate-300">
                              +91 ••••• ••{scannedStudent.phone.slice(-4)}
                            </span>
                            <button
                              onClick={() => handleMockCall(scannedStudent.studentName)}
                              className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer"
                              title="Call Routed via System Mask"
                            >
                              <PhoneCall className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">ROOM NUMBER</label>
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 font-mono text-sm font-bold text-slate-655 dark:text-slate-300 transition-colors">
                            Room {scannedStudent.room[0]}••
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">DESTINATION</label>
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors">
                            {scannedStudent.destination}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">STATUS</label>
                          <div className="flex items-center gap-1.5 pt-2">
                            {scannedStudent.status === "Approved" ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-755 dark:text-emerald-400 text-xs font-bold rounded-lg transition-colors">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Valid Outing Approval
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-250 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-lg animate-pulse transition-colors">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Pending Warden Approval
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Register logs section */}
                      <div className="flex justify-end gap-3 pt-6 border-t border-slate-150 dark:border-slate-700">
                        <button
                          onClick={() => setScannedStudent(null)}
                          className="px-5 py-2.5 border border-slate-205 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          Clear Screen
                        </button>
                        <button
                          disabled={scannedStudent.status !== "Approved"}
                          onClick={() => handleRegisterMovement(scannedStudent, "OUT")}
                          className={`px-5 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all ${
                            scannedStudent.status === "Approved"
                              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/25 active:scale-95 cursor-pointer"
                              : "bg-slate-250 dark:bg-slate-800 text-slate-450 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-750 shadow-none"
                          }`}
                        >
                          Confirm Exit Movement
                        </button>
                      </div>

                    </div>

                    {/* Right: Camera scan mock graphic */}
                    <div className="lg:col-span-4 bg-slate-950 rounded-2xl p-6 flex flex-col items-center justify-center border border-slate-800 text-center text-slate-400">
                      <div className="h-28 w-28 border-2 border-indigo-500 border-dashed rounded-2xl flex items-center justify-center mb-4 relative p-1.5 animate-pulse bg-indigo-950/20">
                        <QrCode className="h-16 w-16 text-indigo-400" />
                        {/* Scanning green line */}
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-indigo-400 shadow-lg animate-bounce"></div>
                      </div>
                      <h4 className="font-extrabold text-sm text-white">QR Scanning Feed</h4>
                      <p className="text-[10px] text-slate-500 font-semibold max-w-[200px] mt-1.5 leading-relaxed">
                        Scanning active at main gate scanner device. Keep QR in grid alignment.
                      </p>
                    </div>

                  </div>
                ) : (
                  <div className="py-20 text-center bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl space-y-3 transition-colors">
                    <QrCode className="h-12 w-12 text-slate-350 dark:text-slate-600 mx-auto animate-bounce" />
                    <h4 className="font-bold text-slate-700 dark:text-slate-300">Gate Terminal Idle</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto font-medium">
                      Simulate a student scan by clicking "Scan Ananya" or "Scan Priya" buttons in the scanner header menu above.
                    </p>
                  </div>
                )}

              </div>
            )}

            {/* 3. WARDEN VIEW */}
            {role === "warden" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Outing Approvals Queue */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-white dark:bg-slate-855 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm transition-colors">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                        Outing Requests Queue
                      </h3>
                      <span className="text-xs text-slate-550 dark:text-slate-400 font-bold bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 px-2 py-0.5 rounded-lg transition-colors">
                        {requests.filter(r => r.status === "Pending").length} Pending
                      </span>
                    </div>

                    {/* Request List */}
                    <div className="space-y-4">
                      {requests.map(req => (
                        <div
                          key={req.id}
                          className="p-4 border border-slate-200/85 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-900/80 hover:border-slate-350 dark:hover:border-slate-700 transition-all flex flex-col sm:flex-row justify-between gap-4 items-start"
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-slate-900 dark:text-white">{req.studentName}</span>
                              <span className="text-[9px] text-indigo-650 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/60 font-bold px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/40 transition-colors">
                                Room {req.room}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                              Dest: <span className="text-slate-800 dark:text-slate-200 font-medium">{req.destination}</span>
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                              Time: <span className="text-slate-800 dark:text-slate-200 font-medium">{req.travelTime}</span>
                            </p>
                            
                            {req.ticketUploaded && (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 text-[10px] text-emerald-700 dark:text-emerald-400 font-extrabold mt-1 transition-colors">
                                <FileCheck className="h-3 w-3" />
                                Travel proof verified: {req.ticketName}
                              </div>
                            )}
                          </div>

                          <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0 justify-end self-end sm:self-center">
                            {req.status === "Pending" ? (
                              <>
                                <button
                                  onClick={() => handleWardenApproval(req.id, false)}
                                  className="flex-1 sm:flex-none px-3.5 py-2 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleWardenApproval(req.id, true)}
                                  className="flex-1 sm:flex-none px-3.5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold rounded-lg transition-all active:scale-95 shadow shadow-indigo-600/10 cursor-pointer"
                                >
                                  Approve
                                </button>
                              </>
                            ) : (
                              <span className={`inline-block text-center px-3.5 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                req.status === "Approved"
                                  ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                                  : "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/40 text-rose-700 dark:text-rose-455"
                              }`}>
                                {req.status === "Approved" ? "Approved" : "Rejected"}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Warden Alerts & Misconduct reports */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* Active SOS Warning Feed */}
                  <div className={`p-6 rounded-2xl border transition-all duration-300 ${
                    sosActive 
                      ? "bg-rose-50 dark:bg-rose-950/20 border-rose-350 dark:border-rose-900 shadow-lg text-rose-950 dark:text-rose-200 animate-pulse" 
                      : "bg-white dark:bg-slate-850 border-slate-200/60 dark:border-slate-700/60 shadow-sm"
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      <AlertTriangle className={`h-5 w-5 ${sosActive ? "text-rose-650 animate-bounce" : "text-slate-400"}`} />
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Active Distress Alerts</h4>
                    </div>

                    {sosActive ? (
                      <div className="space-y-3">
                        <div className="p-3 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/80 text-slate-800 dark:text-slate-200 text-xs leading-relaxed rounded-xl transition-colors">
                          <span className="font-black text-rose-700 dark:text-rose-400 uppercase block mb-1">🚨 EMERGENCY SOS</span>
                          <strong>Student:</strong> Megha Sen (Room 205-C)<br />
                          <strong>Triggered:</strong> Just Now (Gate 1 perimeter)<br />
                          <strong>Live Tracking:</strong> Active
                        </div>
                        <button
                          onClick={() => setSosActive(false)}
                          className="w-full py-2 bg-rose-600 hover:bg-rose-750 text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Acknowledge & Dismiss Alert
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        No active SOS signals from hostel perimeters currently.
                      </p>
                    )}
                  </div>

                  {/* Misconduct escalation reports */}
                  <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm space-y-4 transition-colors">
                    <div className="pb-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Escalated Complaints</h4>
                      <span className="text-[10px] text-rose-650 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/60 px-2 py-0.5 rounded font-bold border border-transparent dark:border-rose-900/40 transition-colors">ICC Connected</span>
                    </div>

                    <div className="space-y-3">
                      {complaints.map(comp => (
                        <div key={comp.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-2 transition-colors">
                          <div className="flex items-center justify-between font-bold text-[10px] text-slate-500">
                            <span>ID: {comp.id}</span>
                            <span>{comp.timestamp}</span>
                          </div>
                          <p className="text-slate-650 dark:text-slate-350 leading-relaxed font-medium">
                            "{comp.description}"
                          </p>
                          <div className="flex justify-between items-center pt-1">
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:text-amber-450 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md border border-transparent dark:border-amber-900/40 transition-colors">
                              Status: {comp.status}
                            </span>
                            <button
                              onClick={() => {
                                setComplaints(prev => prev.map(c => c.id === comp.id ? { ...c, status: "Escalated to ICC Council" } : c));
                                addLog("Warden", `Escalated complaint ${comp.id} to ICC board`, "warning");
                                alert("Complaint forwarded to Internal Complaints Committee. Action logged.");
                              }}
                              disabled={comp.status.includes("ICC")}
                              className={`text-[10px] font-bold cursor-pointer ${comp.status.includes("ICC") ? "text-slate-450 dark:text-slate-600 cursor-not-allowed" : "text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"}`}
                            >
                              {comp.status.includes("ICC") ? "Escalated" : "Escalate to ICC →"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* 4. ADMIN VIEW */}
            {role === "admin" && (
              <div className="space-y-6">
                
                {/* Section Header */}
                <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      Blockchain-Ready Tamper-Proof Audit Trail
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      Monitors every system action, check-in, check-out, data scan, and security alert.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setAuditLogs(prev => [
                        {
                          time: new Date().toTimeString().split(" ")[0],
                          actor: "System Audit Monitor",
                          action: "Recalibrated active verification logs. Integrity match: 100%.",
                          severity: "success"
                        },
                        ...prev
                      ]);
                      triggerConfetti();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-750 dark:text-slate-200 transition-all active:scale-95 shadow-sm cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    Verify Log Integrity
                  </button>
                </div>

                {/* Logs Table */}
                <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm overflow-hidden transition-colors">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                          <th className="p-4 text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider">TIME</th>
                          <th className="p-4 text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider">OPERATOR / ACTOR</th>
                          <th className="p-4 text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider">ACTION RECORDED</th>
                          <th className="p-4 text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider">INTEGRITY</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {auditLogs.map((log, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="p-4 text-xs font-mono text-slate-500 whitespace-nowrap">{log.time}</td>
                            <td className="p-4 text-xs font-bold text-slate-850 dark:text-slate-200 whitespace-nowrap">
                              {log.actor}
                            </td>
                            <td className="p-4 text-xs font-medium text-slate-650 dark:text-slate-350">
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold mr-2 border transition-colors ${
                                log.severity === "danger"
                                  ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/40 animate-pulse"
                                  : log.severity === "warning"
                                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/40"
                                  : log.severity === "success"
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40"
                                  : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-405 border-slate-200 dark:border-slate-800"
                              }`}>
                                {log.severity.toUpperCase()}
                              </span>
                              {log.action}
                            </td>
                            <td className="p-4 text-xs whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                Cryptographic-Match
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>
    </section>
  );
}

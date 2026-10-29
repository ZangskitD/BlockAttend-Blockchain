
import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Html5QrcodeScanner } from "html5-qrcode";
import {
  Activity, ArrowUpRight, BadgeCheck, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleHelp, Clock3, Copy, Download, GraduationCap, LayoutDashboard,
  Link2, LogOut, Menu, Plus, QrCode, ScanLine, ShieldCheck, Users, Wallet, X,
  AlertTriangle, RefreshCw, Search, ExternalLink, Trash2, LockKeyhole
} from "lucide-react";
import { connectWallet, errorMessage, getContract, shortAddress } from "./chain.js";

const emptyForm = {
  name: "",
  code: "",
  description: "",
  semester: "Fall 2026",
  schedule: "Mon / Wed · 10:00 AM",
  threshold: 75
};

const navFaculty = [
  ["Overview", "overview", LayoutDashboard],
  ["My Courses", "courses", BookOpen],
  ["Attendance", "attendance", CheckCircle2],
  ["Students", "students", Users],
  ["Eligibility", "eligibility", BadgeCheck]
];

const navStudent = [
  ["Overview", "overview", LayoutDashboard],
  ["My Courses", "courses", BookOpen],
  ["Scan QR", "scan", ScanLine],
  ["My Attendance", "attendance", CheckCircle2],
  ["Exam Eligibility", "eligibility", BadgeCheck]
];

function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button className={`btn ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Pill({ children, tone = "blue" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function Stat({ icon: Icon, label, value, note, tone = "blue" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={19} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [account, setAccount] = useState("");
  const [role, setRole] = useState("");
  const [contract, setContract] = useState(null);
  const [provider, setProvider] = useState(null);
  const [page, setPage] = useState("overview");
  const [courses, setCourses] = useState([]);
  const [studentsByCourse, setStudentsByCourse] = useState({});
  const [requestsByCourse, setRequestsByCourse] = useState({});
  const [statsByCourse, setStatsByCourse] = useState({});
  const [sessionsByCourse, setSessionsByCourse] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [courseForm, setCourseForm] = useState(emptyForm);
  const [activeCourse, setActiveCourse] = useState("");
  const [rosterInput, setRosterInput] = useState("");
  const [qr, setQr] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [duration, setDuration] = useState(15);
  const [thresholdDraft, setThresholdDraft] = useState(75);
  const [searchTerm, setSearchTerm] = useState("");
  const [studentProfile, setStudentProfile] = useState({ fullName: "", rollNumber: "" });
  const [profileSaving, setProfileSaving] = useState(false);

  const isFaculty = role === "Faculty";
  const nav = isFaculty ? navFaculty : navStudent;
  const active = courses.find(c => String(c.id) === String(activeCourse)) || courses[0];

  function notify(type, message) {
    setNotice({ type, message });
    window.setTimeout(() => setNotice(null), 5500);
  }

  async function copyAddress(address) {
    try {
      await navigator.clipboard.writeText(address);
      notify("success", "Student wallet address copied.");
    } catch {
      notify(
        "error",
        "Could not copy automatically. Select and copy the wallet address manually."
      );
    }
  }

  async function refreshData(c = contract, a = account, r = role) {
    if (!c || !a || !r) return;

    try {
      if (r === "Student") {
        try {
          const profile = await c.getStudentProfile(a);
          setStudentProfile({
            fullName: profile.name || "",
            rollNumber: profile.rollNumber || ""
          });
        } catch (profileError) {
          console.warn(
            "Student profile is unavailable on this contract.",
            profileError
          );
        }
      }

      const ids = r === "Faculty"
        ? await c.getMyCourseIds()
        : await c.getAllCourseIds();

      const list = [];

      for (const rawId of ids) {
        const id = Number(rawId);
        const item = await c.getCourse(id);

        if (r === "Faculty" && item.faculty.toLowerCase() !== a.toLowerCase()) {
          continue;
        }

        if (r === "Student") {
          const isEnrolled = await c.enrolled(id, a);
          const requested = await c.enrollmentRequested(id, a);
          const approved = await c.approved(id, a);

          if (!isEnrolled && !requested && !approved) continue;
        }

        const sessionIds = await c.getSessionIds(id);
        const sessionList = [];

        for (const sid of sessionIds) {
          const s = await c.getSession(sid);

          sessionList.push({
            id: Number(s.id),
            expiresAt: Number(s.expiresAt),
            open: s.open,
            counted: s.counted,
            attendedByMe: r === "Student"
              ? await c.attendance(Number(sid), a)
              : false
          });
        }

        list.push({
          id,
          faculty: item.faculty,
          name: item.name,
          code: item.code,
          description: item.description,
          semester: item.semester,
          schedule: item.schedule,
          threshold: Number(item.threshold),
          totalSessions: Number(item.totalSessions),
          enrolled: r === "Student" ? await c.enrolled(id, a) : false,
          requested: r === "Student" ? await c.enrollmentRequested(id, a) : false,
          approved: r === "Student" ? await c.approved(id, a) : false,
          sessionList
        });
      }

      setCourses(list);

      if (!list.some(c => String(c.id) === String(activeCourse)) && list.length) {
        setActiveCourse(String(list[0].id));
      }
      if (!list.length) setActiveCourse("");

      for (const course of list) {
        if (r === "Faculty") {
          const addresses = await c.getCourseStudents(course.id);
          setStudentsByCourse(prev => ({
            ...prev,
            [course.id]: addresses
          }));

          const requestAddresses = [];

          // Discover requests from on-chain EnrollmentRequested events.
          try {
            const filter = c.filters.EnrollmentRequested(course.id);
            const logs = await c.queryFilter(filter, 0, "latest");

            for (const log of logs) {
              const address = log.args.student;

              if (await c.enrollmentRequested(course.id, address)) {
                requestAddresses.push(address);
              }
            }
          } catch (requestError) {
            console.warn("Could not read enrollment request events.", requestError);
          }

          setRequestsByCourse(prev => ({
            ...prev,
            [course.id]: [...new Set(requestAddresses)]
          }));

          const statRows = [];

          for (const address of addresses) {
            const s = await c.getStudentStats(course.id, address);
            let fullName = "";
            let rollNumber = "";

            try {
              const profile = await c.getStudentProfile(address);
              fullName = profile.name || "";
              rollNumber = profile.rollNumber || "";
            } catch (profileError) {
              // The contract may not expose student profile functions.
            }

            statRows.push({
              address,
              fullName,
              rollNumber,
              attended: Number(s.attended),
              total: Number(s.total),
              percentage: Number(s.percentage),
              threshold: Number(s.threshold),
              eligible: s.eligible
            });
          }

          setStatsByCourse(prev => ({
            ...prev,
            [course.id]: statRows
          }));
        } else if (course.enrolled) {
          const s = await c.getStudentStats(course.id, a);
          let fullName = studentProfile.fullName;
          let rollNumber = studentProfile.rollNumber;

          try {
            const profile = await c.getStudentProfile(a);
            fullName = profile.name || "";
            rollNumber = profile.rollNumber || "";
          } catch (profileError) {}

          setStatsByCourse(prev => ({
            ...prev,
            [course.id]: [{
              address: a,
              fullName,
              rollNumber,
              attended: Number(s.attended),
              total: Number(s.total),
              percentage: Number(s.percentage),
              threshold: Number(s.threshold),
              eligible: s.eligible
            }]
          }));
        }

        setSessionsByCourse(prev => ({
          ...prev,
          [course.id]: course.sessionList
        }));
      }
    } catch (e) {
      notify("error", errorMessage(e));
    }
  }

  async function saveStudentProfile(e) {
    e.preventDefault();
    if (!contract || role !== "Student") return;

    const fullName = studentProfile.fullName.trim();
    const rollNumber = studentProfile.rollNumber.trim();

    if (!fullName || !rollNumber) {
      notify("error", "Enter both your full name and roll number.");
      return;
    }

    setProfileSaving(true);

    try {
      const tx = await contract.setStudentProfile(fullName, rollNumber);
      await tx.wait();

      setStudentProfile({ fullName, rollNumber });
      notify("success", "Student name and roll number saved on-chain.");
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setProfileSaving(false);
    }
  }

  // Connect MetaMask, then let the user choose Faculty or Student.
  // The selected role is checked against the existing on-chain role below.
  async function connect() {
    setBusy(true);

    try {
      const wallet = await connectWallet();
      const c = await getContract(wallet.signer);

      setAccount(wallet.address);
      setProvider(wallet.provider);
      setContract(c);
      setRole("");
      setPage("overview");

      notify("success", "Wallet connected. Choose Faculty or Student.");
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Never register an unauthorized wallet as Faculty from the frontend.
  // Existing on-chain roles cannot be switched to the opposite role.
  async function selectRole(nextRole) {
    if (!contract || !account) return;

    setBusy(true);

    try {
      const u = await contract.users(account);
      const isActive = u.active;
      const onChainRole = Number(u.role);

      if (nextRole === "Student") {
        if (isActive && onChainRole === 1) {
          throw new Error(
            "This wallet is registered as Faculty. Use a separate wallet for Student access."
          );
        }

        if (isActive && onChainRole !== 2) {
          throw new Error("This wallet does not have a valid Student role.");
        }

        if (!isActive) {
          const tx = await contract.registerStudent();
          await tx.wait();
        }

        setRole("Student");
        setPage("overview");
        notify("success", "Student wallet selected and verified on-chain.");
        return;
      }

      if (nextRole === "Faculty") {
        if (isActive && onChainRole === 2) {
          throw new Error(
            "This wallet is registered as Student. Use a separate wallet for Faculty access."
          );
        }

        if (isActive && onChainRole !== 1) {
          throw new Error("This wallet is not registered as Faculty.");
        }

        if (!isActive) {
          throw new Error(
            "This wallet is not authorized as Faculty. Ask the institution admin to authorize this wallet on-chain first."
          );
        }

        setRole("Faculty");
        setPage("overview");
        notify("success", "Faculty wallet selected and verified on-chain.");
      }
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (contract && account && role) refreshData();
  }, [contract, account, role]);

  useEffect(() => {
    if (isFaculty && active) setThresholdDraft(active.threshold);
  }, [activeCourse, active?.id, active?.threshold, isFaculty]);

  useEffect(() => {
    if (!window.ethereum) return;

    const changed = () => {
      setAccount("");
      setContract(null);
      setProvider(null);
      setRole("");
      setCourses([]);
      setStudentsByCourse({});
      setRequestsByCourse({});
      setStatsByCourse({});
      setSessionsByCourse({});
    };

    window.ethereum.on?.("accountsChanged", changed);
    return () => window.ethereum.removeListener?.("accountsChanged", changed);
  }, []);

  async function createCourse(e) {
    e.preventDefault();
    if (!contract) return;

    setBusy(true);

    try {
      const tx = await contract.createCourse(
        courseForm.name.trim(),
        courseForm.code.trim().toUpperCase(),
        courseForm.description.trim(),
        courseForm.semester.trim(),
        courseForm.schedule.trim(),
        Number(courseForm.threshold)
      );

      const receipt = await tx.wait();

      const event = receipt.logs
        .map(log => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(log => log?.name === "CourseCreated");

      setCreateOpen(false);
      setCourseForm(emptyForm);

      notify(
        "success",
        `Course created on-chain${event ? ` · Course #${event.args.courseId}` : ""}.`
      );

      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function approveRoster(e) {
    e.preventDefault();
    if (!contract || !active) return;

    const addresses = [
      ...new Set(
        rosterInput
          .split(/[\n,; ]+/)
          .map(x => x.trim())
          .filter(Boolean)
      )
    ];

    if (!addresses.length) {
      notify("error", "Enter at least one student wallet address.");
      return;
    }

    setBusy(true);

    try {
      for (const address of addresses) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          throw new Error(`Invalid wallet address: ${address}`);
        }

        const tx = await contract.approveStudent(active.id, address);
        await tx.wait();
      }

      setRosterInput("");
      notify("success", `${addresses.length} student wallet(s) approved on-chain.`);
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function enroll(course) {
    if (!contract) return;

    setBusy(true);

    try {
      const tx = await contract.enroll(course.id);
      await tx.wait();

      notify("success", `Joined ${course.name}.`);
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function requestJoin(course) {
    if (!contract) return;

    setBusy(true);

    try {
      const tx = await contract.requestEnrollment(course.id);
      await tx.wait();

      notify("success", "Enrollment request recorded on-chain.");
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    if (!contract || !active) return;

    setBusy(true);

    try {
      const tx = await contract.startSession(active.id, Number(duration));
      const receipt = await tx.wait();

      const event = receipt.logs
        .map(log => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(log => log?.name === "SessionStarted");

      const sessionId = Number(event.args.sessionId);
      const expiry = Number(event.args.expiresAt);

      const payload = JSON.stringify({
        type: "blockattend-session",
        courseId: active.id,
        sessionId,
        expiresAt: expiry
      });

      const dataUrl = await QRCode.toDataURL(payload, {
        width: 300,
        margin: 2,
        color: { dark: "#12233f", light: "#ffffff" }
      });

      setQr({
        dataUrl,
        payload,
        title: `${active.code} · Session #${sessionId}`,
        sessionId,
        expiry,
        kind: "session"
      });

      notify("success", `Attendance session #${sessionId} is live.`);
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function generateCourseQr(course) {
    const payload = JSON.stringify({
      type: "blockattend-course",
      courseId: course.id
    });

    try {
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 300,
        margin: 2,
        color: { dark: "#12233f", light: "#ffffff" }
      });

      setQr({
        dataUrl,
        payload,
        title: `${course.code} · Enrollment`,
        kind: "course",
        courseId: course.id
      });
    } catch (e) {
      notify("error", errorMessage(e));
    }
  }

  async function markFromQr(value) {
    let data;

    try {
      data = JSON.parse(value);
    } catch {
      notify("error", "QR code is not a valid BlockAttend code.");
      return;
    }

    if (data.type === "blockattend-course") {
      if (!contract || role !== "Student") {
        notify("error", "Connect a registered student wallet before joining a course.");
        return;
      }

      let course = courses.find(c => c.id === Number(data.courseId));

      if (!course) {
        try {
          const item = await contract.getCourse(Number(data.courseId));

          course = {
            id: Number(item.id),
            faculty: item.faculty,
            name: item.name,
            code: item.code,
            description: item.description,
            semester: item.semester,
            schedule: item.schedule,
            threshold: Number(item.threshold),
            totalSessions: Number(item.totalSessions),
            enrolled: false,
            requested: false,
            approved: false,
            sessionList: []
          };
        } catch {
          notify("error", "This course does not exist on the connected blockchain.");
          return;
        }
      }

      if (course.enrolled) {
        notify("success", "You are already enrolled in this course.");
        return;
      }

      if (course.requested) {
        notify("success", "Your enrollment request is already pending.");
        return;
      }

      if (course.approved) await enroll(course);
      else await requestJoin(course);

      return;
    }

    if (
      data.type !== "blockattend-session" ||
      !data.sessionId ||
      !data.courseId
    ) {
      notify("error", "This QR code is not a valid attendance session.");
      return;
    }

    if (Date.now() / 1000 > Number(data.expiresAt)) {
      notify("error", "This attendance QR has expired.");
      return;
    }

    setBusy(true);

    try {
      const tx = await contract.markAttendance(Number(data.sessionId));
      const receipt = await tx.wait();

      notify("success", `Attendance recorded on-chain · ${receipt.hash.slice(0, 12)}…`);

      setScanOpen(false);
      setScanValue("");
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setThreshold() {
    if (!contract || !active) return;

    setBusy(true);

    try {
      const tx = await contract.setThreshold(active.id, Number(thresholdDraft));
      await tx.wait();

      notify("success", "Eligibility threshold updated on-chain.");
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function closeSession(sessionId) {
    setBusy(true);

    try {
      const tx = await contract.closeSession(sessionId);
      await tx.wait();

      notify("success", `Session #${sessionId} closed.`);
      await refreshData();
    } catch (e) {
      notify("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    if (!active) return;

    const rows = [[
      "Student name",
      "Roll number",
      "Wallet address",
      "Attended sessions",
      "Total sessions",
      "Percentage",
      "Threshold",
      "Exam eligibility"
    ]];

    (statsByCourse[active.id] || []).forEach(s => rows.push([
      s.fullName || "Not provided",
      s.rollNumber || "Not provided",
      s.address,
      s.attended,
      s.total,
      `${s.percentage}%`,
      `${s.threshold}%`,
      s.eligible ? "Eligible" : "Not eligible"
    ]));

    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    link.download = `${active.code || "course"}-attendance.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const stats = active ? (statsByCourse[active.id] || []) : [];
  const studentStats = stats.find(
    s => s.address.toLowerCase() === account.toLowerCase()
  );
  const totalStudents = active ? (studentsByCourse[active.id] || []).length : 0;
  const filteredCourses = courses.filter(c =>
    `${c.name} ${c.code}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!account || !contract) {
    return (
      <div className="landing">
        <div className="landing-nav">
          <div className="brand">
            <div className="brand-mark"><ShieldCheck size={23} /></div>
            <span>Block<span>Attend</span></span>
          </div>
          <div className="network-status">
            <span className="status-dot" /> Ethereum-compatible · On-chain
          </div>
        </div>

        <main className="landing-main">
          <div className="hero-copy">
            <Pill tone="blue">BLOCKCHAIN-VERIFIED ATTENDANCE</Pill>
            <h1>Attendance you can <em>verify.</em></h1>
            <p>
              A transparent, tamper-evident attendance system for faculty and
              students. Courses, enrollment and attendance records are enforced
              by smart contracts.
            </p>

            <div className="hero-actions">
              <Button onClick={connect} disabled={busy}>
                <Wallet size={17} />
                {busy ? "Connecting…" : "Connect MetaMask"}
                <ArrowUpRight size={16} />
              </Button>
              <span className="secure-note">
                <LockKeyhole size={14} /> Your wallet is your identity
              </span>
            </div>

            <div className="hero-points">
              <span><Check size={15} /> No centralized database</span>
              <span><Check size={15} /> On-chain records</span>
              <span><Check size={15} /> QR-based workflow</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-glow" />
            <div className="preview-window">
              <div className="preview-top">
                <div className="window-dots"><i /><i /><i /></div>
                <span>BLOCKATTEND / OVERVIEW</span>
                <span className="live-tag"><span /> LIVE</span>
              </div>
              <div className="preview-body">
                <div className="preview-label">ATTENDANCE OVERVIEW</div>
                <div className="preview-big">94.2% <span>+2.4%</span></div>
                <div className="preview-bars">
                  <i style={{ height: "43%" }} />
                  <i style={{ height: "58%" }} />
                  <i style={{ height: "49%" }} />
                  <i style={{ height: "75%" }} />
                  <i style={{ height: "64%" }} />
                  <i style={{ height: "87%" }} />
                  <i style={{ height: "72%" }} />
                  <i style={{ height: "100%" }} />
                  <i style={{ height: "81%" }} />
                </div>
                <div className="preview-divider" />
                <div className="preview-course">
                  <div className="course-icon"><BookOpen size={18} /></div>
                  <div><b>Blockchain Technology</b><small>CS425 · 32 enrolled</small></div>
                  <Pill tone="green">Active</Pill>
                </div>
                <div className="preview-course">
                  <div className="course-icon violet"><ShieldCheck size={18} /></div>
                  <div><b>Smart Contract Systems</b><small>CS418 · 28 enrolled</small></div>
                  <Pill tone="blue">Verified</Pill>
                </div>
              </div>
            </div>

            <div className="floating-card transaction-float">
              <div className="float-icon"><CheckCircle2 size={17} /></div>
              <div><b>Attendance recorded</b><small>Confirmed on-chain</small></div>
              <span className="float-check"><Check size={14} /></span>
            </div>

            <div className="floating-card qr-float">
              <QrCode size={24} />
              <div><b>Scan to check in</b><small>Secure · Time-limited</small></div>
            </div>
          </div>
        </main>

        <footer className="landing-footer">
          <span>© 2026 BlockAttend</span>
          <span>Built on smart contracts · No MySQL / MongoDB</span>
          <span><CircleHelp size={14} /> Local Hardhat development</span>
        </footer>

        {notice && (
          <div className={`toast ${notice.type}`}>
            {notice.type === "error"
              ? <AlertTriangle size={17} />
              : <CheckCircle2 size={17} />}
            {notice.message}
          </div>
        )}
      </div>
    );
  }

  if (!role) {
    return (
      <div className="role-screen">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={23} /></div>
          <span>Block<span>Attend</span></span>
        </div>

        <div className="role-card">
          <Pill>WALLET CONNECTED</Pill>
          <h1>Choose your workspace</h1>
          <p>Your wallet <b>{shortAddress(account)}</b> is connected. Select your role.</p>

          <div className="role-options">
            <button
              onClick={() => selectRole("Faculty")}
              className="role-option"
              disabled={busy}
            >
              <div className="role-symbol"><GraduationCap /></div>
              <div>
                <b>Faculty</b>
                <small>
                  Access your authorized faculty wallet, create courses,
                  manage students and record attendance.
                </small>
              </div>
              <ChevronRight />
            </button>

            <button
              onClick={() => selectRole("Student")}
              className="role-option"
              disabled={busy}
            >
              <div className="role-symbol student"><BookOpen /></div>
              <div>
                <b>Student</b>
                <small>
                  Register your wallet, join courses, scan attendance QR codes
                  and view eligibility.
                </small>
              </div>
              <ChevronRight />
            </button>
          </div>

          <div className="role-foot">
            <ShieldCheck size={15} />
            Faculty access requires an already authorized faculty wallet.
          </div>

          <Button
            variant="secondary"
            onClick={() => {
              setAccount("");
              setContract(null);
              setProvider(null);
              setRole("");
            }}
          >
            Disconnect wallet
          </Button>
        </div>

        {notice && (
          <div className={`toast ${notice.type}`}>
            {notice.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <span>Block<span>Attend</span></span>
          <button
            className="mobile-close icon-btn"
            onClick={() => setMobileNav(false)}
          >
            <X />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="role-chip">
          <div className="role-avatar">
            {isFaculty ? <GraduationCap size={18} /> : <BookOpen size={18} />}
          </div>
          <div>
            <b>{role} workspace</b>
            <small>{shortAddress(account)}</small>
          </div>
          <span className="connected-dot" />
        </div>

        <div className="nav-caption">MENU</div>
        <nav>
          {nav.map(([label, id, Icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "selected" : ""}`}
              onClick={() => {
                setPage(id);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {page === id && <ChevronRight size={15} className="nav-chevron" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="chain-card">
            <div className="chain-card-icon"><Link2 size={17} /></div>
            <div>
              <b>Local blockchain</b>
              <small><span className="status-dot" /> Hardhat Network</small>
            </div>
            <Pill tone="green">Connected</Pill>
          </div>
          <button
            className="nav-item logout"
            onClick={() => {
              setAccount("");
              setContract(null);
              setProvider(null);
              setRole("");
              setCourses([]);
              setStudentsByCourse({});
              setRequestsByCourse({});
              setStatsByCourse({});
              setSessionsByCourse({});
            }}
          >
            <LogOut size={18} /> Disconnect wallet
          </button>
          <div className="sidebar-copy">BLOCKATTEND v1.0 · ON-CHAIN</div>
        </div>
      </aside>

      {mobileNav && <div className="mobile-scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn menu-btn" onClick={() => setMobileNav(true)}>
              <Menu />
            </button>
            <div>
              <div className="breadcrumb">
                Workspace <ChevronRight size={13} /> <b>{nav.find(n => n[1] === page)?.[0] || "Overview"}</b>
              </div>
              <div className="topbar-date">
                <CalendarDays size={13} /> On-chain attendance management
              </div>
            </div>
          </div>

          <div className="topbar-right">
            <div className="chain-badge"><span className="status-dot" /> Local network</div>
            <button className="wallet-chip" title={account}>
              <span className="wallet-indicator"><Wallet size={15} /></span>
              {shortAddress(account)}
            </button>
            <button className="icon-btn" title="Refresh blockchain data" onClick={() => refreshData()}>
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {isFaculty ? "FACULTY PORTAL" : "STUDENT PORTAL"} <span>•</span>{" "}
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                })}
              </div>
              <h1>
                {page === "overview"
                  ? `Good ${
                      new Date().getHours() < 12
                        ? "morning"
                        : new Date().getHours() < 18
                          ? "afternoon"
                          : "evening"
                    }`
                  : nav.find(n => n[1] === page)?.[0]}
              </h1>
              <p>
                {page === "overview"
                  ? (isFaculty
                      ? "Your courses, class activity and attendance at a glance."
                      : "Your enrolled courses and exam eligibility in one place.")
                  : page === "courses"
                    ? "Manage course information and access."
                    : page === "scan"
                      ? "Scan a valid course or active attendance QR code."
                      : "Records are retrieved directly from the blockchain."}
              </p>
            </div>

            <div className="heading-actions">
              <Button variant="secondary" onClick={() => refreshData()}>
                <RefreshCw size={15} /> Refresh
              </Button>
              {isFaculty && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus size={17} /> Create course
                </Button>
              )}
            </div>
          </div>

          {page === "overview" && (
            <>
              {!isFaculty && (
                <section className="panel" style={{ marginBottom: 20 }}>
                  <div className="panel-head">
                    <div>
                      <h2>Student profile</h2>
                      <p>Your name and roll number are saved on the blockchain and linked to this wallet.</p>
                    </div>
                    <Pill tone={studentProfile.fullName && studentProfile.rollNumber ? "green" : "amber"}>
                      {studentProfile.fullName && studentProfile.rollNumber ? "Profile saved" : "Complete profile"}
                    </Pill>
                  </div>

                  <form className="form-grid" onSubmit={saveStudentProfile}>
                    <div className="field">
                      <label>Full name *</label>
                      <input
                        required
                        maxLength={100}
                        value={studentProfile.fullName}
                        onChange={e => setStudentProfile(prev => ({ ...prev, fullName: e.target.value }))}
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div className="field">
                      <label>Roll number *</label>
                      <input
                        required
                        maxLength={50}
                        value={studentProfile.rollNumber}
                        onChange={e => setStudentProfile(prev => ({ ...prev, rollNumber: e.target.value }))}
                        placeholder="e.g. MCA001"
                      />
                    </div>
                    <div className="form-actions full">
                      <Button disabled={profileSaving || !studentProfile.fullName.trim() || !studentProfile.rollNumber.trim()}>
                        {profileSaving ? "Saving profile…" : "Save profile on-chain"}
                      </Button>
                    </div>
                    <div className="form-note full">
                      <ShieldCheck size={16} />
                      Name and roll number are publicly readable on this local blockchain. Use details you are comfortable sharing.
                    </div>
                  </form>
                </section>
              )}

              {isFaculty ? (
                <div className="stats-grid">
                  <Stat icon={BookOpen} label="Total courses" value={courses.length} note="Courses you own" tone="blue" />
                  <Stat icon={Users} label="Enrolled students" value={courses.reduce((n, c) => n + (studentsByCourse[c.id] || []).length, 0)} note="Across your courses" tone="violet" />
                  <Stat icon={Activity} label="Class sessions" value={courses.reduce((n, c) => n + c.totalSessions, 0)} note="Recorded on-chain" tone="teal" />
                  <Stat icon={BadgeCheck} label="Eligibility threshold" value={`${active?.threshold ?? 75}%`} note="Selected course" tone="amber" />
                </div>
              ) : (
                <div className="stats-grid">
                  <Stat icon={BookOpen} label="My courses" value={courses.filter(c => c.enrolled).length} note="Authorized courses" tone="blue" />
                  <Stat icon={CheckCircle2} label="Sessions attended" value={courses.reduce((n, c) => n + (statsByCourse[c.id]?.[0]?.attended || 0), 0)} note="Across enrolled courses" tone="teal" />
                  <Stat icon={Activity} label="Attendance average" value={`${Math.round(courses.filter(c => c.enrolled).reduce((n, c) => n + (statsByCourse[c.id]?.[0]?.percentage || 0), 0) / Math.max(1, courses.filter(c => c.enrolled).length))}%`} note="Across enrolled courses" tone="violet" />
                  <Stat icon={BadgeCheck} label="Exam eligibility" value={courses.filter(c => c.enrolled && statsByCourse[c.id]?.[0]?.eligible).length} note="Eligible courses" tone="amber" />
                </div>
              )}

              <div className="content-grid">
                <section className="panel course-panel">
                  <div className="panel-head">
                    <div>
                      <h2>{isFaculty ? "Your courses" : "My courses"}</h2>
                      <p>{isFaculty ? "Courses managed by your wallet" : "Courses you have been approved to join"}</p>
                    </div>
                    <button className="text-action" onClick={() => setPage("courses")}>
                      View all <ChevronRight size={15} />
                    </button>
                  </div>

                  <div className="course-list">
                    {courses.slice(0, 4).map(c => (
                      <CourseRow
                        key={c.id}
                        course={c}
                        faculty={isFaculty}
                        students={studentsByCourse[c.id]?.length || 0}
                        stats={statsByCourse[c.id]?.find(s => s.address.toLowerCase() === account.toLowerCase())}
                        onSelect={() => {
                          setActiveCourse(String(c.id));
                          setPage("courses");
                        }}
                        onQr={() => generateCourseQr(c)}
                      />
                    ))}
                    {!courses.length && (
                      <Empty
                        icon={BookOpen}
                        title="No courses yet"
                        text={isFaculty ? "Create your first course to get started." : "Ask faculty for a course QR code and approved enrollment."}
                        action={isFaculty ? <Button onClick={() => setCreateOpen(true)}><Plus size={15} /> Create course</Button> : null}
                      />
                    )}
                  </div>
                </section>

                <section className="panel activity-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Blockchain activity</h2>
                      <p>How BlockAttend protects records</p>
                    </div>
                    <div className="activity-icon"><ShieldCheck size={18} /></div>
                  </div>
                  <div className="activity-list">
                    <ActivityRow icon={LockKeyhole} title="Wallet-based identity" text="Actions are signed by the connected wallet." tone="blue" />
                    <ActivityRow icon={CheckCircle2} title="Contract-enforced rules" text="Enrollment and attendance checks run on-chain." tone="green" />
                    <ActivityRow icon={QrCode} title="Session-specific QR" text="Attendance codes expire and cannot be reused." tone="violet" />
                    <ActivityRow icon={Link2} title="Tamper-evident records" text="Transactions can be inspected on the network." tone="amber" />
                  </div>
                  <div className="security-note">
                    <ShieldCheck size={16} />
                    <span>
                      <b>Privacy by design</b>
                      <small>Only wallet addresses and course records are stored on this local chain. Avoid personal details.</small>
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}

          {page === "courses" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>{isFaculty ? "Course management" : "Available courses"}</h2>
                  <p>{isFaculty ? "Create, inspect and share your course QR codes." : "Only approved course enrollments can be activated."}</p>
                </div>
                <div className="search-box">
                  <Search size={16} />
                  <input
                    placeholder="Search courses…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {filteredCourses.length ? (
                <div className="course-grid">
                  {filteredCourses.map(c => (
                    <div className="course-card" key={c.id}>
                      <div className="course-card-top">
                        <div className="course-icon"><BookOpen size={20} /></div>
                        <Pill tone={isFaculty ? "green" : c.enrolled ? "green" : c.requested ? "amber" : "blue"}>
                          {isFaculty ? "Owned by you" : c.enrolled ? "Enrolled" : c.requested ? "Request pending" : c.approved ? "Approved" : "Restricted"}
                        </Pill>
                      </div>
                      <div className="course-code">{c.code} · COURSE #{c.id}</div>
                      <h3>{c.name}</h3>
                      <p>{c.description || "No course description provided."}</p>
                      <div className="course-meta">
                        <span><CalendarDays size={14} />{c.semester}</span>
                        <span><Clock3 size={14} />{c.schedule || "Schedule not set"}</span>
                      </div>
                      <div className="course-card-bottom">
                        <span><Users size={14} />{isFaculty ? `${studentsByCourse[c.id]?.length || 0} students` : `${c.totalSessions} sessions`}</span>
                        <b>{c.threshold}% threshold</b>
                      </div>
                      <div className="course-card-actions">
                        {isFaculty ? (
                          <>
                            <Button variant="secondary" onClick={() => {
                              setActiveCourse(String(c.id));
                              setPage("students");
                            }}>
                              Manage students
                            </Button>
                            <Button onClick={() => generateCourseQr(c)}>
                              <QrCode size={15} /> Course QR
                            </Button>
                          </>
                        ) : c.enrolled ? (
                          <Button block onClick={() => {
                            setActiveCourse(String(c.id));
                            setPage("attendance");
                          }}>
                            View attendance
                          </Button>
                        ) : c.approved ? (
                          <Button block onClick={() => enroll(c)}>Join course</Button>
                        ) : (
                          <Button
                            block
                            variant="secondary"
                            onClick={() => requestJoin(c)}
                            disabled={c.requested || busy}
                          >
                            {c.requested ? "Request pending" : "Request access"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon={BookOpen} title="No matching courses" text="Try another search, or refresh on-chain data." />
              )}
            </section>
          )}

          {page === "attendance" && (
            <div className="stack-layout">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>{isFaculty ? "Attendance sessions" : "Attendance summary"}</h2>
                    <p>{isFaculty ? "Start a temporary QR session for the selected course." : "Your attendance is verified against contract records."}</p>
                  </div>
                  {isFaculty && (
                    <Button onClick={startSession} disabled={!active || busy}>
                      <QrCode size={16} /> Start session
                    </Button>
                  )}
                </div>

                {courses.length > 0 && (
                  <CourseSelect courses={courses} activeCourse={activeCourse} setActiveCourse={setActiveCourse} />
                )}

                {isFaculty ? (
                  <>
                    <div className="session-config">
                      <div>
                        <label>QR validity</label>
                        <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                          <option value={5}>5 minutes</option>
                          <option value={10}>10 minutes</option>
                          <option value={15}>15 minutes</option>
                          <option value={30}>30 minutes</option>
                          <option value={60}>60 minutes</option>
                        </select>
                      </div>
                      <div className="session-info">
                        <Clock3 size={16} />
                        <span>One check-in per wallet per session. Expired sessions reject new attendance.</span>
                      </div>
                    </div>

                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>SESSION</th><th>COURSE</th><th>EXPIRES</th><th>STATUS</th><th></th></tr>
                        </thead>
                        <tbody>
                          {(active ? (sessionsByCourse[active.id] || []) : []).slice().reverse().map(s => (
                            <tr key={s.id}>
                              <td><b>#{s.id}</b></td>
                              <td>{active?.code}</td>
                              <td>{new Date(s.expiresAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                              <td>
                                <Pill tone={s.open && Date.now() / 1000 < s.expiresAt ? "green" : "muted"}>
                                  {s.open && Date.now() / 1000 < s.expiresAt ? "Open" : "Closed / expired"}
                                </Pill>
                              </td>
                              <td>{s.open && <button className="small-action" onClick={() => closeSession(s.id)}>Close session</button>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!active || !(sessionsByCourse[active.id] || []).length) && (
                        <Empty icon={QrCode} title="No sessions recorded" text="Start a session to generate an attendance QR code." />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="student-attendance-card">
                      <div className="attendance-ring" style={{ "--progress": `${studentStats?.percentage || 0}%` }}>
                        <div><b>{studentStats?.percentage || 0}%</b><small>Attendance</small></div>
                      </div>
                      <div className="attendance-details">
                        <h3>{studentProfile.fullName || "Student profile not saved"}</h3>
                        <p>Roll number: {studentProfile.rollNumber || "—"}</p>
                        <h3>{active?.name || "Select a course"}</h3>
                        <p>{active?.code || "No course selected"} · {studentStats?.attended || 0} of {studentStats?.total || 0} counted sessions attended</p>
                        <div className="progress-track">
                          <span style={{ width: `${Math.min(100, studentStats?.percentage || 0)}%` }} />
                        </div>
                        <div className="attendance-bottom">
                          <span>Required: <b>{studentStats?.threshold ?? active?.threshold ?? 75}%</b></span>
                          <Pill tone={studentStats?.eligible ? "green" : "amber"}>
                            {studentStats?.eligible ? "Eligible" : "Not eligible yet"}
                          </Pill>
                        </div>
                      </div>
                    </div>
                    <Button onClick={() => setPage("scan")}><ScanLine size={16} /> Scan attendance QR</Button>
                  </>
                )}
              </section>

              {!isFaculty && (
                <section className="panel">
                  <div className="panel-head">
                    <div><h2>Attendance records</h2><p>Confirmed on-chain sessions</p></div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>SESSION</th><th>COURSE</th><th>RECORD</th></tr></thead>
                      <tbody>
                        {(active ? sessionsByCourse[active.id] || [] : []).map(s => (
                          <tr key={s.id}>
                            <td>Session #{s.id}</td>
                            <td>{active?.code}</td>
                            <td>
                              {s.attendedByMe
                                ? <Pill tone="green">Present · confirmed on-chain</Pill>
                                : <Pill tone="muted">Not recorded</Pill>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}

          {page === "students" && isFaculty && (
            <div className="stack-layout">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Authorized class roster</h2>
                    <p>Approve student wallet addresses before they can enroll.</p>
                  </div>
                  <Pill tone="blue">{totalStudents} enrolled</Pill>
                </div>

                {courses.length > 0 && (
                  <CourseSelect courses={courses} activeCourse={activeCourse} setActiveCourse={setActiveCourse} />
                )}

                <form className="roster-form" onSubmit={approveRoster}>
                  <label>Student wallet addresses</label>
                  <textarea
                    rows="3"
                    value={rosterInput}
                    onChange={e => setRosterInput(e.target.value)}
                    placeholder="0x1234... (one address per line, or comma-separated)"
                  />
                  <div className="form-foot">
                    <span>Students must register their wallet as a student first.</span>
                    <Button disabled={busy || !active}>
                      <ShieldCheck size={15} /> Approve wallets
                    </Button>
                  </div>
                </form>
              </section>

              {/* New: show on-chain requests and let faculty copy addresses for manual checking. */}
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Pending join requests</h2>
                    <p>Copy a student's wallet address and check it manually before approving the student.</p>
                  </div>
                  <Button variant="secondary" onClick={() => refreshData()} disabled={busy}>
                    <RefreshCw size={15} /> Refresh requests
                  </Button>
                </div>

                {courses.length > 0 && (
                  <CourseSelect courses={courses} activeCourse={activeCourse} setActiveCourse={setActiveCourse} />
                )}

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>STUDENT WALLET ADDRESS</th>
                        <th>REQUEST STATUS</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(active ? requestsByCourse[active.id] || [] : []).map(address => (
                        <tr key={address}>
                          <td>
                            <code style={{ overflowWrap: "anywhere" }}>{address}</code>
                          </td>
                          <td><Pill tone="amber">Pending review</Pill></td>
                          <td>
                            <Button variant="secondary" onClick={() => copyAddress(address)}>
                              <Copy size={14} /> Copy address
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {(!active || !(requestsByCourse[active.id] || []).length) && (
                    <Empty
                      icon={Users}
                      title="No pending join requests"
                      text="Requests recorded on-chain appear here. Select a course or refresh the data."
                    />
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Enrolled students</h2>
                    <p>Wallets currently authorized in this course</p>
                  </div>
                  <Button variant="secondary" onClick={exportCsv}>
                    <Download size={15} /> Export CSV
                  </Button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>STUDENT NAME</th>
                        <th>ROLL NUMBER</th>
                        <th>STUDENT WALLET</th>
                        <th>ATTENDANCE</th>
                        <th>PERCENTAGE</th>
                        <th>ELIGIBILITY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map(s => (
                        <tr key={s.address}>
                          <td>{s.fullName || <span className="muted">Profile not saved</span>}</td>
                          <td>{s.rollNumber || "—"}</td>
                          <td>
                            <div className="address-cell">
                              <div className="student-avatar">{s.address.slice(2, 4).toUpperCase()}</div>
                              <span>{shortAddress(s.address)}</span>
                              <button className="copy-btn" onClick={() => copyAddress(s.address)} title="Copy full wallet address">
                                <Copy size={13} />
                              </button>
                            </div>
                          </td>
                          <td>{s.attended} / {s.total}</td>
                          <td><b>{s.percentage}%</b></td>
                          <td>
                            <Pill tone={s.eligible ? "green" : "amber"}>
                              {s.eligible ? "Eligible" : "Not eligible"}
                            </Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!stats.length && (
                    <Empty icon={Users} title="No enrolled students" text="Approve wallet addresses, then students can join the course." />
                  )}
                </div>
              </section>
            </div>
          )}

          {page === "scan" && !isFaculty && (
            <div className="scan-layout">
              <section className="panel scan-panel">
                <div className="scan-illustration">
                  <div className="scan-corners"><QrCode size={76} /></div>
                </div>
                <h2>Scan a BlockAttend QR</h2>
                <p>Scan a course enrollment QR or a temporary attendance session QR. Your wallet signs the on-chain transaction.</p>
                <Button onClick={() => setScanOpen(true)}>
                  <ScanLine size={17} /> Open camera scanner
                </Button>
                <div className="or-divider"><span /> OR <span /></div>
                <label>Paste QR content</label>
                <textarea
                  rows="3"
                  value={scanValue}
                  onChange={e => setScanValue(e.target.value)}
                  placeholder='{"type":"blockattend-session","courseId":1,"sessionId":1,"expiresAt":...}'
                />
                <Button
                  variant="secondary"
                  block
                  disabled={!scanValue.trim() || busy}
                  onClick={() => markFromQr(scanValue)}
                >
                  Validate QR and continue
                </Button>
              </section>

              <section className="panel scan-help">
                <h2>How it works</h2>
                <ActivityRow icon={QrCode} title="1. Scan the code" text="Faculty displays the course QR or active session QR." tone="blue" />
                <ActivityRow icon={Wallet} title="2. Verify your wallet" text="Your connected wallet must be approved and enrolled." tone="violet" />
                <ActivityRow icon={ShieldCheck} title="3. Record on-chain" text="The contract checks expiry, enrollment and duplicates." tone="green" />
                <div className="warning-box">
                  <AlertTriangle size={17} />
                  <span>QR codes can be shared. The contract validates your wallet, but it cannot prove your physical presence in the classroom.</span>
                </div>
              </section>
            </div>
          )}

          {page === "eligibility" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>{isFaculty ? "Exam eligibility" : "My exam eligibility"}</h2>
                  <p>{isFaculty ? "Attendance totals and threshold status for the selected course." : "Eligibility is calculated from on-chain attendance."}</p>
                </div>
                {isFaculty && (
                  <Button variant="secondary" onClick={exportCsv}>
                    <Download size={15} /> Export report
                  </Button>
                )}
              </div>

              {courses.length > 0 && (
                <CourseSelect courses={courses} activeCourse={activeCourse} setActiveCourse={setActiveCourse} />
              )}

              {isFaculty && active && (
                <div className="threshold-editor">
                  <div>
                    <b>Minimum attendance threshold</b>
                    <small>Applies to {active.code} and recalculates eligibility immediately.</small>
                  </div>
                  <div className="threshold-control">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={thresholdDraft}
                      onChange={e => setThresholdDraft(e.target.value)}
                    />
                    <span>%</span>
                    <Button
                      onClick={setThreshold}
                      disabled={busy || thresholdDraft === "" || Number(thresholdDraft) < 0 || Number(thresholdDraft) > 100}
                    >
                      Save threshold
                    </Button>
                  </div>
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {isFaculty && (
                        <>
                          <th>STUDENT NAME</th>
                          <th>ROLL NUMBER</th>
                          <th>STUDENT WALLET</th>
                        </>
                      )}
                      <th>ATTENDED</th>
                      <th>TOTAL SESSIONS</th>
                      <th>ATTENDANCE</th>
                      <th>REQUIRED</th>
                      <th>EXAM STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isFaculty ? stats : stats.filter(s => s.address.toLowerCase() === account.toLowerCase())).map(s => (
                      <tr key={s.address}>
                        {isFaculty && (
                          <>
                            <td>{s.fullName || "Profile not saved"}</td>
                            <td>{s.rollNumber || "—"}</td>
                            <td>
                              <div className="address-cell">
                                <span>{shortAddress(s.address)}</span>
                                <button className="copy-btn" onClick={() => copyAddress(s.address)} title="Copy full wallet address">
                                  <Copy size={13} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                        <td>{s.attended}</td>
                        <td>{s.total}</td>
                        <td>
                          <div className="percentage-cell">
                            <div className="mini-track">
                              <span style={{ width: `${Math.min(100, s.percentage)}%` }} />
                            </div>
                            <b>{s.percentage}%</b>
                          </div>
                        </td>
                        <td>{s.threshold}%</td>
                        <td>
                          <Pill tone={s.eligible ? "green" : "amber"}>
                            {s.eligible ? "Eligible" : "Not eligible"}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!stats.length && (
                  <Empty
                    icon={BadgeCheck}
                    title="Eligibility data will appear here"
                    text={isFaculty ? "Enroll students and record attendance sessions first." : "Join an approved course to view your eligibility."}
                  />
                )}
              </div>
            </section>
          )}

          {page === "students" && !isFaculty && (
            <section className="panel">
              <Empty
                icon={LockKeyhole}
                title="Faculty-only area"
                text="Student roster management is available only to the faculty wallet that owns a course."
              />
            </section>
          )}
        </div>

        <footer className="app-footer">
          <span>© 2026 BlockAttend</span>
          <span><span className="status-dot" /> Blockchain connected · <b>Records are on-chain</b></span>
          <span>Privacy-first attendance</span>
        </footer>
      </main>

      {createOpen && (
        <Modal title="Create a course" onClose={() => setCreateOpen(false)}>
          <form className="form-grid" onSubmit={createCourse}>
            <div className="field full">
              <label>Course name *</label>
              <input
                required
                value={courseForm.name}
                onChange={e => setCourseForm({ ...courseForm, name: e.target.value })}
                placeholder="e.g. Blockchain Technology"
              />
            </div>
            <div className="field">
              <label>Course code *</label>
              <input
                required
                value={courseForm.code}
                onChange={e => setCourseForm({ ...courseForm, code: e.target.value })}
                placeholder="CS425"
              />
            </div>
            <div className="field">
              <label>Exam threshold (%)</label>
              <input
                type="number"
                required
                min="0"
                max="100"
                value={courseForm.threshold}
                onChange={e => setCourseForm({ ...courseForm, threshold: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Semester / year</label>
              <input
                value={courseForm.semester}
                onChange={e => setCourseForm({ ...courseForm, semester: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Schedule</label>
              <input
                value={courseForm.schedule}
                onChange={e => setCourseForm({ ...courseForm, schedule: e.target.value })}
              />
            </div>
            <div className="field full">
              <label>Description</label>
              <textarea
                rows="3"
                value={courseForm.description}
                onChange={e => setCourseForm({ ...courseForm, description: e.target.value })}
                placeholder="Briefly describe this course"
              />
            </div>
            <div className="form-note full">
              <ShieldCheck size={16} />
              Course details and threshold will be recorded on-chain. The transaction requires a wallet confirmation.
            </div>
            <div className="form-actions full">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled={busy}>
                {busy ? "Creating…" : <><Plus size={16} /> Create course</>}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {qr && (
        <Modal title={qr.kind === "course" ? "Course enrollment QR" : "Attendance session QR"} onClose={() => setQr(null)}>
          <div className="qr-modal">
            <div className="qr-frame"><img src={qr.dataUrl} alt="QR code" /></div>
            <h3>{qr.title}</h3>
            <p>
              {qr.kind === "course"
                ? "Share this code with students. They still need approval from the course faculty."
                : `Session #${qr.sessionId} · Expires ${new Date(qr.expiry * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </p>
            <div className="qr-payload">
              <code>{qr.payload}</code>
              <button className="copy-btn" onClick={() => copyAddress(qr.payload)} title="Copy QR content">
                <Copy size={14} />
              </button>
            </div>
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = qr.dataUrl;
                  a.download = `blockattend-${qr.kind}-${qr.sessionId || qr.courseId}.png`;
                  a.click();
                }}
              >
                <Download size={15} /> Download QR
              </Button>
              <Button onClick={() => setQr(null)}>Done</Button>
            </div>
          </div>
        </Modal>
      )}

      {scanOpen && (
        <Modal title="Scan QR code" onClose={() => setScanOpen(false)}>
          <QrScanner onScan={value => {
            setScanOpen(false);
            setScanValue(value);
            markFromQr(value);
          }} />
          <p className="scanner-note">
            Allow camera access in your browser. If scanning is unavailable, paste the QR content on the Scan QR page.
          </p>
        </Modal>
      )}

      {notice && (
        <div className={`toast ${notice.type}`}>
          {notice.type === "error" ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
          {notice.message}
          <button onClick={() => setNotice(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function CourseRow({ course, faculty, students, stats, onSelect, onQr }) {
  return (
    <div className="course-row">
      <div className="course-icon"><BookOpen size={18} /></div>
      <div className="course-row-main">
        <b>{course.name}</b>
        <small>{course.code} · {faculty ? `${students} enrolled` : `${course.totalSessions} sessions`}</small>
      </div>
      <div className="course-row-meta">
        {faculty
          ? <Pill tone="green">Active</Pill>
          : <Pill tone={stats?.eligible ? "green" : "amber"}>{stats?.eligible ? "Eligible" : "Tracking"}</Pill>}
        <button className="icon-btn" onClick={onSelect}><ChevronRight size={17} /></button>
      </div>
    </div>
  );
}

function ActivityRow({ icon: Icon, title, text, tone }) {
  return (
    <div className="activity-row">
      <div className={`activity-row-icon ${tone}`}><Icon size={17} /></div>
      <div><b>{title}</b><p>{text}</p></div>
    </div>
  );
}

function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={23} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function CourseSelect({ courses, activeCourse, setActiveCourse }) {
  return (
    <div className="course-select">
      <label>Selected course</label>
      <select
        value={activeCourse || courses[0]?.id || ""}
        onChange={e => setActiveCourse(e.target.value)}
      >
        {courses.map(c => (
          <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
        ))}
      </select>
    </div>
  );
}

function QrScanner({ onScan }) {
  const [error, setError] = useState("");

  useEffect(() => {
    let scanner;

    try {
      scanner = new Html5QrcodeScanner(
        "blockattend-qr-reader",
        { fps: 10, qrbox: { width: 230, height: 230 }, rememberLastUsedCamera: true },
        false
      );

      scanner.render(
        decoded => {
          scanner.clear().catch(() => {});
          onScan(decoded);
        },
        () => {}
      );
    } catch (e) {
      setError("Camera scanner could not start. Check browser camera permissions or paste the QR content manually.");
    }

    return () => {
      if (scanner) scanner.clear().catch(() => {});
    };
  }, []);

  return (
    <div className="scanner-wrap">
      <div id="blockattend-qr-reader" />
      {error && <p className="error-copy">{error}</p>}
    </div>
  );
}

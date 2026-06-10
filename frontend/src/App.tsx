import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Role } from "./api/client";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Services from "./pages/Services";
import ServiceDetail from "./pages/ServiceDetail";
import Packages from "./pages/Packages";
import PackageDetail from "./pages/PackageDetail";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import NewRequest from "./pages/NewRequest";
import Directories from "./pages/Directories";
import Clinics from "./pages/Clinics";
import Users from "./pages/Users";
import Audit from "./pages/Audit";
import Profile from "./pages/Profile";

function Guard({ roles, children }: { roles?: Role[]; children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="login-wrap">Загрузка…</div>;
  if (!me) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(me.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { me, loading } = useAuth();
  if (loading) return <div className="login-wrap">Загрузка…</div>;

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/packages/:id" element={<PackageDetail />} />
        <Route path="/requests" element={<Guard roles={["r1", "r2", "r3"]}><Requests /></Guard>} />
        <Route path="/requests/new" element={<Guard roles={["r3"]}><NewRequest /></Guard>} />
        <Route path="/requests/:id" element={<Guard roles={["r1", "r2", "r3"]}><RequestDetail /></Guard>} />
        <Route path="/directories" element={<Guard roles={["r1", "r2", "r3"]}><Directories /></Guard>} />
        <Route path="/clinics" element={<Guard roles={["r1", "r2", "r3"]}><Clinics /></Guard>} />
        <Route path="/users" element={<Guard roles={["r1"]}><Users /></Guard>} />
        <Route path="/audit" element={<Guard roles={["r1"]}><Audit /></Guard>} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

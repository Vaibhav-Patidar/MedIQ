import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PatientDetail from './pages/PatientDetail';
import AlertCenter from './pages/AlertCenter';
import NewPatient from './pages/NewPatient';
import AppShell from './layouts/AppShell';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/patients/new" element={<NewPatient />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/alerts" element={<AlertCenter />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

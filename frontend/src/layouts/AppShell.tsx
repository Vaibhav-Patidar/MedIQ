import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import Sidebar from '../components/Sidebar';
import TopHeader from '../components/TopHeader';
import { ToastContainer } from '../components/ui/ToastContainer';

export default function AppShell() {
  const token = useAuthStore((s) => s.token);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-wrapper">
        <TopHeader />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

import { useToastStore } from '../../stores/toast';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.exiting ? 'toast-exit' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

/**
 * Wrappa le route che richiedono autenticazione.
 * Se l'utente non è loggato (nessun accessToken) → redirect a /auth.
 */
export default function ProtectedRoute({ children }) {
  const accessToken = useAuthStore(s => s.accessToken)
  if (!accessToken) return <Navigate to="/auth" replace />
  return children
}

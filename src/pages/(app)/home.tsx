/** /home is the scaffold's signed-in entry point; DecisionRoom's lives at /decisions. */
import { Navigate } from 'react-router-dom'

export default function HomeRedirect() {
  return <Navigate to="/decisions" replace />
}

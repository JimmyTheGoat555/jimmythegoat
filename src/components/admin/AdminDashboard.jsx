import FounderConsole from './FounderConsole';
import { useAdminAnalytics } from '../../hooks/useAdminAnalytics';
import { useAdminOps } from '../../hooks/useAdminOps';

// The /admin route: the Founder Console on the live hooks. The console
// itself is presentational (FounderConsole.jsx) so dev/admin.jsx can show
// it on a fixture; this is the only place the real callables are wired.
// The server's row cap (adminAnalytics.js's MAX_ROWS). Asked for in full
// because the rows double as the Targeted User Actions search directory
// (UserActionsPanel.jsx); the Power Users table shows its own top slice.
const DIRECTORY_ROWS = 50;

export default function AdminDashboard() {
  const analytics = useAdminAnalytics({ limit: DIRECTORY_ROWS });
  const ops = useAdminOps();
  return <FounderConsole analytics={analytics} ops={ops} />;
}
